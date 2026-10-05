"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/lib/auth";
import { createBotClient, telegramConfigured, webhookSecret } from "@/lib/telegram/bot";
import { webhookUrl } from "@/lib/telegram/webhook-url";

/** Points the Telegram bot at this deployment. Only one deployment can receive messages at a time. */
export async function connectTelegramAction(): Promise<{ ok: boolean; error?: string }> {
  await requireFreelancer();
  if (!telegramConfigured()) return { ok: false, error: "Add TELEGRAM_BOT_TOKEN in Vercel first, then redeploy." };
  try {
    await createBotClient().api.setWebhook(await webhookUrl(), {
      secret_token: webhookSecret(),
      allowed_updates: ["message"],
    });
  } catch (err) {
    console.error("telegram: setWebhook failed", err);
    return { ok: false, error: "Telegram rejected the request. Check that the bot token is correct." };
  }
  revalidatePath("/settings");
  return { ok: true };
}
