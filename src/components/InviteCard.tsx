"use client";

import { useState } from "react";
import type { Invite } from "@/lib/types";

export function inviteText(invite: Invite) {
  return `Hi ${invite.clientName}! Here's our private chat link — no app or sign-up needed:\n${invite.url}\n\nPasscode: ${invite.passcode}`;
}

export function InviteCard({ invite, title }: { invite: Invite; title: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const text = inviteText(invite);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Share sheet dismissed; fall through to copy.
      }
    }
    await copy(text, "invite");
  }

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Send both to {invite.clientName}. The passcode is shown only now — you can reset it later.
      </p>
      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Passcode</p>
        <p className="mt-1 font-mono text-3xl tracking-[0.3em]">{invite.passcode}</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Link</p>
        <p className="mt-1 break-all text-sm text-slate-700">{invite.url}</p>
      </div>
      <button
        onClick={share}
        className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white"
      >
        {copied === "invite" ? "Copied invite ✓" : "Share invite message"}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => copy(invite.url, "link")} className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
          {copied === "link" ? "Copied ✓" : "Copy link"}
        </button>
        <button onClick={() => copy(invite.passcode, "code")} className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
          {copied === "code" ? "Copied ✓" : "Copy passcode"}
        </button>
      </div>
    </div>
  );
}
