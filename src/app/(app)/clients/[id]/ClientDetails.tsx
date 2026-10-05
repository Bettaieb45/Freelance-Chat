"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { ClientFields } from "@/components/ClientFields";
import { InviteCard } from "@/components/InviteCard";
import type { ClientRow, Invite, TelegramLink } from "@/lib/types";
import { disconnectTelegramAction, resetAccessAction, setArchivedAction, updateClientAction } from "../actions";

export function ClientDetails({
  client,
  link,
  telegram,
  onClose,
}: {
  client: ClientRow;
  link: string;
  telegram: TelegramLink | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, startTransition] = useTransition();
  const [saveState, saveAction, saving] = useActionState(updateClientAction.bind(null, client.id), null);

  function reset(newLink: boolean) {
    const warning = newLink
      ? "Create a new link and passcode? The old link stops working and the client must use the new one."
      : "Create a new passcode? The client will need to enter it again on every device.";
    if (!confirm(warning)) return;
    startTransition(async () => {
      const res = await resetAccessAction(client.id, newLink);
      if (res.ok) {
        setInvite(res.data);
        router.refresh();
      } else setError(res.error);
    });
  }

  function toggleArchived() {
    if (!client.archived && !confirm(`Archive ${client.name}? Their link stops working until you unarchive.`)) return;
    startTransition(async () => {
      const res = await setArchivedAction(client.id, !client.archived);
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error);
    });
  }

  function disconnectTelegram() {
    if (!confirm(`Disconnect ${client.name}'s Telegram? Your replies will only appear on their chat page.`)) return;
    startTransition(async () => {
      const res = await disconnectTelegramAction(client.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const telegramLabel = telegram?.telegram_username ? `@${telegram.telegram_username}` : telegram?.telegram_name;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${client.name} settings`}
        onClick={(e) => e.stopPropagation()}
        className="pb-safe max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-4 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{client.name}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-slate-500" aria-label="Close">
            ✕
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {invite ? (
          <div className="mt-4">
            <InviteCard invite={invite} title="New access ready" />
          </div>
        ) : (
          <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Private link</p>
            <p className="mt-1 break-all text-sm">{link}</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-3 w-full rounded-xl bg-slate-100 px-3 py-2 text-sm"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <p className="mt-3 text-xs text-slate-500">
              The passcode was shown when you created the client. Forgot it? Make a new one — the client then enters it
              once more.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => reset(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
                New passcode
              </button>
              <button disabled={busy} onClick={() => reset(true)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
                New link + passcode
              </button>
            </div>
          </section>
        )}

        <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gets your replies on</p>
          {telegram ? (
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-sm">
                ✈️ Telegram{telegramLabel ? <span className="text-slate-500"> · {telegramLabel}</span> : null}
              </p>
              <button disabled={busy} onClick={disconnectTelegram} className="text-sm text-red-600">
                Disconnect
              </button>
            </div>
          ) : (
            <p className="mt-1 text-sm">
              🌐 Chat page only
              {!client.channel_chosen_at && <span className="text-slate-500"> · hasn&apos;t chosen yet</span>}
            </p>
          )}
        </section>

        <form action={saveAction} className="mt-4 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <ClientFields defaults={client} />
          {saveState && !saveState.ok && <p className="text-sm text-red-700">{saveState.error}</p>}
          {saveState?.ok && <p className="text-sm text-emerald-700">Saved ✓</p>}
          <button disabled={saving} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            {saving ? "Saving…" : "Save details"}
          </button>
        </form>

        <button
          disabled={busy}
          onClick={toggleArchived}
          className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-medium ${
            client.archived ? "bg-indigo-600 text-white" : "bg-white text-red-600 ring-1 ring-slate-200"
          }`}
        >
          {client.archived ? "Unarchive client" : "Archive client"}
        </button>
      </div>
    </div>
  );
}
