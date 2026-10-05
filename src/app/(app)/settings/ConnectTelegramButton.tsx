"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectTelegramAction } from "./actions";

export function ConnectTelegramButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await connectTelegramAction();
            if (res.ok) router.refresh();
            else setError(res.error ?? "Something went wrong.");
          })
        }
        className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Connecting…" : "Connect Telegram to this site"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}
