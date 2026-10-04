"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/lib/auth";
import { generateMagicToken, generatePasscode, hashPasscode } from "@/lib/secrets";
import { clientPageUrl } from "@/lib/site-url";
import type { Invite } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

type ClientFields = { name: string; email: string; drive_link: string };

function parseClientFields(formData: FormData): ActionResult<ClientFields> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const drive_link = String(formData.get("drive_link") ?? "").trim();
  if (!name || name.length > 100) return { ok: false, error: "Enter a name (up to 100 characters)." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
  if (drive_link) {
    try {
      if (new URL(drive_link).protocol !== "https:") throw new Error();
    } catch {
      return { ok: false, error: "The Drive link must be a full https:// link." };
    }
  }
  return { ok: true, data: { name, email, drive_link } };
}

export async function createClientAction(
  _prev: ActionResult<Invite> | null,
  formData: FormData,
): Promise<ActionResult<Invite>> {
  const { supabase } = await requireFreelancer();
  const fields = parseClientFields(formData);
  if (!fields.ok) return fields;

  const token = generateMagicToken();
  const passcode = generatePasscode();
  const { data: clientId, error } = await supabase.rpc("create_client", {
    p_name: fields.data.name,
    p_email: fields.data.email,
    p_drive_link: fields.data.drive_link,
    p_magic_token: token,
    p_passcode_hash: await hashPasscode(passcode),
  });
  if (error) return { ok: false, error: "Couldn't create the client. Please try again." };

  revalidatePath("/");
  return {
    ok: true,
    data: { clientId, clientName: fields.data.name, url: await clientPageUrl(token), passcode },
  };
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase } = await requireFreelancer();
  const fields = parseClientFields(formData);
  if (!fields.ok) return fields;
  const { error } = await supabase
    .from("clients")
    .update({
      name: fields.data.name,
      email: fields.data.email || null,
      drive_link: fields.data.drive_link || null,
    })
    .eq("id", clientId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/** New passcode (and optionally a new link). Signs out every device that had unlocked the page. */
export async function resetAccessAction(clientId: string, newLink: boolean): Promise<ActionResult<Invite>> {
  const { supabase } = await requireFreelancer();
  const passcode = generatePasscode();
  const token = newLink ? generateMagicToken() : null;
  const { error } = await supabase.rpc("reset_client_access", {
    p_client_id: clientId,
    p_passcode_hash: await hashPasscode(passcode),
    p_magic_token: token,
  });
  if (error) return { ok: false, error: "Couldn't reset access. Please try again." };

  const { data: client } = await supabase.from("clients").select("name, magic_token").eq("id", clientId).single();
  if (!client) return { ok: false, error: "Client not found." };
  revalidatePath(`/clients/${clientId}`);
  return {
    ok: true,
    data: { clientId, clientName: client.name, url: await clientPageUrl(client.magic_token), passcode },
  };
}

export async function setArchivedAction(clientId: string, archived: boolean): Promise<ActionResult> {
  const { supabase } = await requireFreelancer();
  const { error } = await supabase.rpc("set_client_archived", { p_client_id: clientId, p_archived: archived });
  if (error) return { ok: false, error: "Couldn't update. Please try again." };
  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}
