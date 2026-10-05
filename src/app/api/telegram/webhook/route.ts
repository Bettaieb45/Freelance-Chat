import { webhookCallback } from "grammy";
import { createBotClient, telegramConfigured, webhookSecret } from "@/lib/telegram/bot";
import { registerHandlers } from "@/lib/telegram/handlers";

let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (!handler) {
    const bot = createBotClient();
    registerHandlers(bot);
    // grammY checks the X-Telegram-Bot-Api-Secret-Token header and answers 401 if it's wrong.
    handler = webhookCallback(bot, "std/http", { secretToken: webhookSecret() });
  }
  return handler;
}

export async function POST(request: Request) {
  if (!telegramConfigured()) return new Response("Telegram is not configured", { status: 503 });
  return getHandler()(request);
}
