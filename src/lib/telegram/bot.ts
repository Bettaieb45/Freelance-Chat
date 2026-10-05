import "server-only";
import { createHmac } from "node:crypto";
import { Bot } from "grammy";

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Missing environment variable TELEGRAM_BOT_TOKEN (see README setup checklist)");
  return t;
}

/**
 * Secret Telegram sends back in the X-Telegram-Bot-Api-Secret-Token header,
 * derived from the bot token so there's no extra env var to manage.
 */
export function webhookSecret(): string {
  return createHmac("sha256", token()).update("client-chat-telegram-webhook").digest("hex");
}

/** A bot without handlers, for sending messages and admin calls. */
export function createBotClient(): Bot {
  // TELEGRAM_API_ROOT is only for tests (a fake Telegram API).
  return new Bot(token(), process.env.TELEGRAM_API_ROOT ? { client: { apiRoot: process.env.TELEGRAM_API_ROOT } } : {});
}

let usernameCache: string | null = null;

export async function botUsername(): Promise<string> {
  if (!usernameCache) usernameCache = (await createBotClient().api.getMe()).username;
  return usernameCache;
}
