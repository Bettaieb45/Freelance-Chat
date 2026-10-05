import Link from "next/link";
import { requireFreelancer } from "@/lib/auth";
import { botUsername, createBotClient, telegramConfigured } from "@/lib/telegram/bot";
import { webhookUrl } from "@/lib/telegram/webhook-url";
import { ConnectTelegramButton } from "./ConnectTelegramButton";

async function telegramStatus() {
  if (!telegramConfigured()) return { state: "missing" as const };
  try {
    const [username, info] = await Promise.all([botUsername(), createBotClient().api.getWebhookInfo()]);
    const expected = (await webhookUrl()).split("?")[0];
    const current = info.url ? info.url.split("?")[0] : "";
    return {
      state: current === expected ? ("connected" as const) : current ? ("elsewhere" as const) : ("disconnected" as const),
      username,
      current,
      lastError: info.last_error_message,
    };
  } catch {
    return { state: "error" as const };
  }
}

export default async function SettingsPage() {
  const { freelancer } = await requireFreelancer();
  const tg = await telegramStatus();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="-ml-2 rounded-full p-2 text-slate-600" aria-label="Back to inbox">
          ←
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-medium">Telegram</h2>
        {tg.state === "missing" && (
          <p className="mt-2 text-sm text-slate-600">
            Not set up. Create a bot with @BotFather, add its token as <code>TELEGRAM_BOT_TOKEN</code> in Vercel, and
            redeploy. See the README.
          </p>
        )}
        {tg.state === "error" && (
          <p className="mt-2 text-sm text-red-700">Couldn&apos;t reach Telegram. Check that the bot token is correct.</p>
        )}
        {(tg.state === "connected" || tg.state === "disconnected" || tg.state === "elsewhere") && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Bot:{" "}
              <a className="text-indigo-600" href={`https://t.me/${tg.username}`} target="_blank" rel="noreferrer">
                @{tg.username}
              </a>
            </p>
            {tg.state === "connected" && <p className="mt-1 text-sm text-emerald-700">✓ Receiving messages on this site</p>}
            {tg.state === "disconnected" && <p className="mt-1 text-sm text-amber-700">Not receiving messages yet.</p>}
            {tg.state === "elsewhere" && (
              <p className="mt-1 text-sm text-amber-700">
                Messages currently go to another deployment:
                <span className="mt-1 block break-all text-xs text-slate-500">{tg.current}</span>
              </p>
            )}
            {tg.lastError && tg.state === "connected" && (
              <p className="mt-1 text-xs text-red-700">Last delivery error from Telegram: {tg.lastError}</p>
            )}
            {tg.state !== "connected" && <ConnectTelegramButton />}
          </>
        )}
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-medium">Account</h2>
        <p className="mt-1 text-sm text-slate-600">Signed in as {freelancer.email}</p>
        <form action="/auth/signout" method="post">
          <button className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm">Sign out</button>
        </form>
      </section>
    </main>
  );
}
