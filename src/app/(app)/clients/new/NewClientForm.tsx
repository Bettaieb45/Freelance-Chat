"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ClientFields } from "@/components/ClientFields";
import { InviteCard } from "@/components/InviteCard";
import { createClientAction } from "../actions";

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClientAction, null);

  if (state?.ok) {
    return (
      <div className="mt-4 space-y-4">
        <InviteCard invite={state.data} title={`${state.data.clientName} is ready`} />
        <Link
          href={`/clients/${state.data.clientId}`}
          className="block rounded-xl bg-white px-4 py-3 text-center font-medium ring-1 ring-slate-200"
        >
          Open chat
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <ClientFields />
      {state && !state.ok && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create private link"}
      </button>
    </form>
  );
}
