"use client";

import { useState, useTransition } from "react";
import { checkEmailNowAction } from "./actions";

export function CheckEmailButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await checkEmailNowAction()))}
        className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Checking…" : "Check email now"}
      </button>
      {result && <p className={`mt-2 text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </>
  );
}

export function CopySetupSql({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Timer setup (run once in Supabase)</summary>
      <p className="mt-2 text-slate-600">
        Supabase → SQL Editor → New query → paste → Run. It checks your Gmail for client replies every minute.
      </p>
      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{sql}</pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(sql);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-2 w-full rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"
      >
        {copied ? "Copied ✓" : "Copy SQL"}
      </button>
    </details>
  );
}
