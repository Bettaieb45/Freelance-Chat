import "server-only";
import { emailConfigured } from "@/lib/email/config";
import { sendClientEmail } from "@/lib/email/send";
import { clientPageUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBotClient, telegramConfigured } from "@/lib/telegram/bot";
import type { Channel, Message } from "@/lib/types";

/**
 * Sends a freelancer message out on the client's chosen channel and records
 * delivery. Phases 2–3: Telegram or email, immediately. (Phase 4 adds the
 * escalation ladder: live-only while the page is open, then ~10 min, then 24 h.)
 * Never throws — the message is already saved and visible on the web page.
 */
export async function deliverFreelancerMessage(message: Message): Promise<Message> {
  try {
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("clients")
      .select(
        "id, preferred_channel, archived, email, email_reply_token, email_thread_message_id, magic_token, freelancers(name), telegram_links(telegram_chat_id)",
      )
      .eq("id", message.client_id)
      .single();
    if (!client || client.archived) return message;

    let via: Channel | null = null;
    if (client.preferred_channel === "telegram" && telegramConfigured()) {
      const link = Array.isArray(client.telegram_links) ? client.telegram_links[0] : client.telegram_links;
      if (link) {
        await createBotClient().api.sendMessage(link.telegram_chat_id, message.body);
        via = "telegram";
      }
    } else if (client.preferred_channel === "email" && client.email && emailConfigured()) {
      const freelancer = Array.isArray(client.freelancers) ? client.freelancers[0] : client.freelancers;
      const messageId = await sendClientEmail({
        to: client.email,
        freelancerName: freelancer?.name ?? "Your freelancer",
        body: message.body,
        chatUrl: await clientPageUrl(client.magic_token),
        replyToken: client.email_reply_token,
        previousMessageId: client.email_thread_message_id,
      });
      await admin.from("clients").update({ email_thread_message_id: messageId }).eq("id", client.id);
      via = "email";
    }
    if (!via) return message;

    const { data: updated } = await admin
      .from("messages")
      .update({ delivered_at: new Date().toISOString(), delivered_via: via })
      .eq("id", message.id)
      .select()
      .single();
    return (updated as Message) ?? message;
  } catch (err) {
    console.error("delivery: failed", err);
    return message;
  }
}
