"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClientDeviceBrowserClient } from "@/lib/supabase/browser";
import { unlockAction } from "./actions";

export function PasscodeForm({ token, freelancerName }: { token: string; freelancerName: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    // The anonymous session is created only when someone actually tries a
    // passcode, not on every page view (keeps bots from creating users).
    const supabase = createClientDeviceBrowserClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setPending(false);
        setError("Couldn't start a secure session. Please try again in a minute.");
        return;
      }
    }
    const res = await unlockAction(token, passcode);
    if (res.ok) {
      router.refresh();
      return;
    }
    setPending(false);
    setError(res.error);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">Chat with {freelancerName}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the passcode {freelancerName} sent you. You&apos;ll only need it once on this device.
        </p>
        <input
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="Passcode"
          placeholder="••••••"
          className="mt-6 w-full rounded-xl bg-slate-100 px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button
          disabled={pending || passcode.length !== 6}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Checking…" : "Open chat"}
        </button>
      </form>
    </main>
  );
}
