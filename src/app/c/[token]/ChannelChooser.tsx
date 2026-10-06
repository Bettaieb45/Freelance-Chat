"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ClientPageData } from "@/lib/client-device";
import { createTelegramLinkAction } from "./actions";

export function ChannelChooser({
  token,
  client,
  supabase,
  telegramAvailable,
  emailAvailable,
  onDone,
}: {
  token: string;
  client: ClientPageData;
  supabase: SupabaseClient;
  telegramAvailable: boolean;
  emailAvailable: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [askEmail, setAskEmail] = useState(false);
  const [email, setEmail] = useState(client.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const linked = !!client.telegram;
  const current = client.channelChosenAt ? client.preferredChannel : null;

  // While waiting for the client to tap Start in Telegram, refresh when they
  // come back to this tab or as soon as the link appears.
  useEffect(() => {
    if (!telegramUrl) return;
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    const channel = supabase
      .channel(`telegram-link:${client.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_links", filter: `client_id=eq.${client.id}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [telegramUrl, supabase, client.id, router]);

  function choose(channel: "web" | "telegram") {
    setError(null);
    startTransition(async () => {
      if (channel === "telegram" && !linked) {
        const res = await createTelegramLinkAction(token);
        if (res.ok) setTelegramUrl(res.url);
        else setError(res.error);
        return;
      }
      const { error } = await supabase.rpc("client_set_preferred_channel", { p_client_id: client.id, p_channel: channel });
      if (error) setError("Couldn't save. Please try again.");
      else {
        onDone?.();
        router.refresh();
      }
    });
  }

  function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.rpc("client_set_email", { p_client_id: client.id, p_email: email });
      if (error) setError(error.code === "22023" ? "That email address doesn't look right." : "Couldn't save. Please try again.");
      else {
        setAskEmail(false);
        onDone?.();
        router.refresh();
      }
    });
  }

  function disconnect() {
    startTransition(async () => {
      const { error } = await supabase.rpc("unlink_telegram", { p_client_id: client.id });
      if (error) setError("Couldn't disconnect. Please try again.");
      else {
        onDone?.();
        router.refresh();
      }
    });
  }

  if (telegramUrl) {
    return (
      <div className="text-center">
        <p className="font-medium">Almost done</p>
        <p className="mt-1 text-sm text-slate-500">
          Open Telegram and tap <b>Start</b>. Then you can chat with {client.freelancerName} right there.
        </p>
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-xl bg-sky-500 px-4 py-3 font-medium text-white"
        >
          Open Telegram ✈️
        </a>
        <p className="mt-2 text-xs text-slate-400">The link works once and expires in 30 minutes.</p>
        <button onClick={() => setTelegramUrl(null)} className="mt-3 text-sm text-slate-500">
          Back
        </button>
      </div>
    );
  }

  if (askEmail) {
    return (
      <form onSubmit={saveEmail}>
        <p className="font-medium">Where should we email you?</p>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;ll get {client.freelancerName}&apos;s replies by email and can answer straight from your inbox.
        </p>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Your email address"
          className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-[16px] ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button disabled={pending} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : "Email me replies"}
        </button>
        <button type="button" onClick={() => setAskEmail(false)} className="mt-3 w-full text-sm text-slate-500">
          Back
        </button>
      </form>
    );
  }

  const option = "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 disabled:opacity-60";
  return (
    <div>
      <p className="font-medium">How do you want to get {client.freelancerName}&apos;s replies?</p>
      <div className="mt-3 space-y-2">
        <button
          disabled={pending}
          onClick={() => choose("web")}
          className={`${option} ${current === "web" ? "bg-indigo-50 ring-indigo-400" : "bg-white ring-slate-200"}`}
        >
          <span className="text-xl" aria-hidden>🌐</span>
          <span className="flex-1">
            <span className="block text-sm font-medium">On this page</span>
            <span className="block text-xs text-slate-500">Bookmark it or add it to your home screen</span>
          </span>
          {current === "web" && <span className="text-indigo-600">✓</span>}
        </button>
        {telegramAvailable && (
          <button
            disabled={pending}
            onClick={() => choose("telegram")}
            className={`${option} ${current === "telegram" ? "bg-indigo-50 ring-indigo-400" : "bg-white ring-slate-200"}`}
          >
            <span className="text-xl" aria-hidden>✈️</span>
            <span className="flex-1">
              <span className="block text-sm font-medium">On Telegram</span>
              <span className="block text-xs text-slate-500">
                {linked ? "Connected — chat from Telegram" : "Chat from the Telegram app, no new account"}
              </span>
            </span>
            {current === "telegram" && <span className="text-indigo-600">✓</span>}
          </button>
        )}
        {emailAvailable && (
          <button
            disabled={pending}
            onClick={() => setAskEmail(true)}
            className={`${option} ${current === "email" ? "bg-indigo-50 ring-indigo-400" : "bg-white ring-slate-200"}`}
          >
            <span className="text-xl" aria-hidden>✉️</span>
            <span className="flex-1">
              <span className="block text-sm font-medium">By email</span>
              <span className="block truncate text-xs text-slate-500">
                {current === "email" && client.email ? client.email : "Get replies in your inbox and answer by email"}
              </span>
            </span>
            {current === "email" && <span className="text-indigo-600">✓</span>}
          </button>
        )}
      </div>
      {linked && (
        <button disabled={pending} onClick={disconnect} className="mt-3 text-sm text-red-600">
          Disconnect Telegram
        </button>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
