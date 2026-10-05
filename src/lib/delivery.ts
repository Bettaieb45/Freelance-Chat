import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBotClient, telegramConfigured } from "@/lib/telegram/bot";
import type { Message } from "@/lib/types";

/**
 * Sends a freelancer message out on the client's chosen channel and records
 * delivery. Phase 2: Telegram, immediately. (Phase 4 adds the escalation
 * ladder: live-only while the page is open, then ~10 min, then 24 h.)
 * Never throws — the message is already saved and visible on the web page.
 */
export async function deliverFreelancerMessage(message: Message): Promise<Message> {
  try {
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("clients")
      .select("preferred_channel, archived, telegram_links(telegram_chat_id)")
      .eq("id", message.client_id)
      .single();
    const link = Array.isArray(client?.telegram_links) ? client.telegram_links[0] : client?.telegram_links;
    if (!client || client.archived || client.preferred_channel !== "telegram" || !link || !telegramConfigured()) {
      return message;
    }

    await createBotClient().api.sendMessage(link.telegram_chat_id, message.body);
    const { data: updated } = await admin
      .from("messages")
      .update({ delivered_at: new Date().toISOString(), delivered_via: "telegram" })
      .eq("id", message.id)
      .select()
      .single();
    return (updated as Message) ?? message;
  } catch (err) {
    console.error("delivery: failed", err);
    return message;
  }
}
