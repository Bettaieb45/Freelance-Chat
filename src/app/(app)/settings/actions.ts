"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/config";
import { syncInbox } from "@/lib/email/inbound";
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

/** Runs the email check right away (normally the Supabase timer does this every minute). */
export async function checkEmailNowAction(): Promise<{ ok: boolean; message: string }> {
  await requireFreelancer();
  if (!emailConfigured()) return { ok: false, message: "Add GMAIL_ADDRESS and GMAIL_APP_PASSWORD in Vercel first, then redeploy." };
  try {
    const r = await syncInbox();
    revalidatePath("/settings");
    return { ok: true, message: `Checked ${r.scanned} new email${r.scanned === 1 ? "" : "s"}, saved ${r.saved} repl${r.saved === 1 ? "y" : "ies"}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: /auth|credentials|login/i.test(msg)
        ? "Gmail rejected the login. Check the address and App Password."
        : `Couldn't check email: ${msg.slice(0, 200)}`,
    };
  }
}
