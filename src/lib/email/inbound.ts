import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { createAdminClient } from "@/lib/supabase/admin";
import { findReplyToken, gmailAddress, imapServer, mailCredentials } from "./config";
import { stripQuoted } from "./quote";

const FIRST_SYNC_DAYS = 2;
const MAX_PER_RUN = 300;

export type SyncResult = { scanned: number; saved: number; skipped: number };

function addresses(a: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap((x) => x.value.map((v) => v.address ?? "")).filter(Boolean);
}

function headerValues(mail: ParsedMail, name: string): string[] {
  const v = mail.headers.get(name);
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "object" && "value" in v) return addresses(v as AddressObject);
  return [String(v)];
}

function isAutoReply(mail: ParsedMail): boolean {
  const auto = String(mail.headers.get("auto-submitted") ?? "no").toLowerCase();
  const precedence = String(mail.headers.get("precedence") ?? "").toLowerCase();
  return (
    auto !== "no" ||
    mail.headers.has("x-autoreply") ||
    mail.headers.has("x-autorespond") ||
    ["bulk", "junk", "list", "auto_reply"].includes(precedence)
  );
}

function plainText(mail: ParsedMail): string {
  if (mail.text) return mail.text;
  if (typeof mail.html === "string") {
    return mail.html
      .replace(/<(br|\/p|\/div)\s*\/?>/gi, "\n")
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return "";
}

/** Saves one raw email as a client message if it's a reply to a plus address. */
async function processEmail(source: Buffer, own: string): Promise<"saved" | "skipped"> {
  const mail = await simpleParser(source);
  const from = mail.from?.value[0]?.address?.toLowerCase() ?? "";
  if (!from || from === own || isAutoReply(mail)) return "skipped";

  const token = findReplyToken([
    ...addresses(mail.to),
    ...addresses(mail.cc),
    ...headerValues(mail, "delivered-to"),
    ...headerValues(mail, "x-original-to"),
  ]);
  if (!token) return "skipped";

  const admin = createAdminClient();
  const messageId = mail.messageId ?? `${from}:${mail.date?.toISOString() ?? ""}:${mail.subject ?? ""}`;
  const { data: client } = await admin
    .from("clients")
    .select("id, email, archived")
    .eq("email_reply_token", token)
    .maybeSingle();

  const { data: claimed } = await admin
    .from("email_inbound")
    .upsert({ message_id: messageId, client_id: client?.id ?? null, status: "processing" }, { onConflict: "message_id", ignoreDuplicates: true })
    .select("message_id");
  if (!claimed?.length) return "skipped"; // already handled by an earlier run

  const finish = (status: string) => admin.from("email_inbound").update({ status }).eq("message_id", messageId);
  if (!client) return (await finish("unknown_token"), "skipped");
  if (client.archived) return (await finish("archived"), "skipped");

  let body = stripQuoted(plainText(mail));
  if (!body) return (await finish("empty"), "skipped");
  if (client.email && from !== client.email.toLowerCase()) body = `(from ${from})\n${body}`;

  const { error } = await admin
    .from("messages")
    .insert({ client_id: client.id, sender: "client", body: body.slice(0, 5000), channel: "email" });
  if (error) {
    await admin.from("email_inbound").delete().eq("message_id", messageId); // retry next run
    throw error;
  }
  await finish("saved");
  return "saved";
}

/** Reads new mail over IMAP and saves client replies. Safe to run concurrently. */
export async function syncInbox(): Promise<SyncResult> {
  const admin = createAdminClient();
  const own = gmailAddress();
  const result: SyncResult = { scanned: 0, saved: 0, skipped: 0 };
  const imap = new ImapFlow({ ...imapServer(), auth: mailCredentials(), logger: false });

  try {
    await imap.connect();
    // Gmail's "All Mail" keeps replies even if a filter archives them; any other server uses INBOX.
    const boxes = await imap.list();
    const mailbox = boxes.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const lock = await imap.getMailboxLock(mailbox);
    try {
      const status = imap.mailbox && typeof imap.mailbox === "object" ? imap.mailbox : null;
      const uidValidity = status ? Number(status.uidValidity) : 0;
      const { data: state } = await admin.from("email_sync_state").select("*").eq("id", 1).maybeSingle();

      let uids: number[];
      if (!state || Number(state.uidvalidity) !== uidValidity || state.last_uid == null) {
        uids = (await imap.search({ since: new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000) }, { uid: true })) || [];
      } else {
        const last = Number(state.last_uid);
        uids = ((await imap.search({ uid: `${last + 1}:*` }, { uid: true })) || []).filter((u) => u > last);
      }
      uids = uids.sort((a, b) => a - b).slice(0, MAX_PER_RUN);

      let lastUid = state && Number(state.uidvalidity) === uidValidity ? Number(state.last_uid ?? 0) : 0;
      for (const uid of uids) {
        const msg = await imap.fetchOne(String(uid), { source: true }, { uid: true });
        result.scanned++;
        if (msg && msg.source) {
          const outcome = await processEmail(msg.source, own);
          result[outcome]++;
        }
        lastUid = Math.max(lastUid, uid);
      }
      if (!uids.length && lastUid === 0) lastUid = Number(status?.uidNext ?? 1) - 1;

      await admin.from("email_sync_state").upsert({
        id: 1,
        uidvalidity: uidValidity,
        last_uid: lastUid,
        last_run_at: new Date().toISOString(),
        last_error: null,
      });
    } finally {
      lock.release();
    }
    await imap.logout();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("email_sync_state").upsert({ id: 1, last_run_at: new Date().toISOString(), last_error: message.slice(0, 500) });
    try {
      imap.close();
    } catch {}
    throw err;
  }
}
