import "server-only";
import type { Bot, Context } from "grammy";
import { createAdminClient } from "@/lib/supabase/admin";

const TEXT_ONLY =
  "I can only pass on text messages for now. Please put files in the shared Google Drive folder (the button at the top of your chat page).";
const NOT_LINKED =
  "I don't know which conversation this is yet. Open your private chat link and tap \"Telegram\" to connect.";
const EXPIRED =
  "This connect link has expired or was already used. Open your chat page and tap \"Telegram\" again.";

function displayName(ctx: Context): string | null {
  const u = ctx.from;
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || null;
}

async function linkedClient(chatId: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("telegram_links")
    .select("client_id, clients(archived, freelancers(name))")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  const freelancer = Array.isArray(client?.freelancers) ? client.freelancers[0] : client?.freelancers;
  return { clientId: data.client_id as string, archived: !!client?.archived, freelancerName: freelancer?.name ?? "your freelancer" };
}

export function registerHandlers(bot: Bot) {
  // Only private chats with people; ignore groups/channels.
  bot.chatType("private").command("start", async (ctx) => {
    const code = ctx.match.trim();
    if (!code) {
      const link = await linkedClient(ctx.chat.id);
      await ctx.reply(link && !link.archived ? `You're connected with ${link.freelancerName}. Just write here.` : NOT_LINKED);
      return;
    }
    const admin = createAdminClient();
    const { data: clientId } = await admin.rpc("redeem_telegram_link_code", {
      p_code: code,
      p_chat_id: ctx.chat.id,
      p_username: ctx.from?.username ?? null,
      p_name: displayName(ctx),
    });
    if (!clientId) {
      await ctx.reply(EXPIRED);
      return;
    }
    const link = await linkedClient(ctx.chat.id);
    await ctx.reply(
      `✅ Connected! You're now chatting with ${link?.freelancerName ?? "your freelancer"}.\n\nWrite here anytime — replies will arrive in this chat. Send /stop to switch back to the web page.`,
    );
  });

  bot.chatType("private").command("stop", async (ctx) => {
    const link = await linkedClient(ctx.chat.id);
    if (!link) {
      await ctx.reply(NOT_LINKED);
      return;
    }
    const admin = createAdminClient();
    await admin.from("telegram_links").delete().eq("client_id", link.clientId);
    await admin.from("clients").update({ preferred_channel: "web" }).eq("id", link.clientId).eq("preferred_channel", "telegram");
    await ctx.reply("Disconnected. You'll find replies on your private chat page. You can reconnect from there anytime.");
  });

  bot.chatType("private").on("message:text", async (ctx) => {
    const link = await linkedClient(ctx.chat.id);
    if (!link) {
      await ctx.reply(NOT_LINKED);
      return;
    }
    if (link.archived) {
      await ctx.reply("This conversation has been closed.");
      return;
    }
    const body = ctx.message.text.trim().slice(0, 5000);
    if (!body) return;
    const admin = createAdminClient();
    const { error } = await admin
      .from("messages")
      .insert({ client_id: link.clientId, sender: "client", body, channel: "telegram" });
    if (error) {
      console.error("telegram: failed to save message", error);
      await ctx.reply("Sorry, that message didn't go through. Please try again.");
    }
  });

  // Photos, files, voice notes, stickers…
  bot.chatType("private").on("message", async (ctx) => {
    await ctx.reply(TEXT_ONLY);
  });

  bot.catch((err) => {
    console.error("telegram: handler error", err.error);
  });
}
