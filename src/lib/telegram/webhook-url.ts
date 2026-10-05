import "server-only";
import { siteOrigin } from "@/lib/site-url";

/** Webhook URL for this deployment (never exported as a server action — it can contain a secret). */
export async function webhookUrl(): Promise<string> {
  const url = new URL("/api/telegram/webhook", await siteOrigin());
  // Vercel preview deployments are behind Deployment Protection; Telegram can
  // only reach them with the automation bypass secret (if enabled in Vercel).
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) url.searchParams.set("x-vercel-protection-bypass", bypass);
  return url.toString();
}
