"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Composer, ConnectionBanner, MessageList } from "@/components/Chat";
import { useThread } from "@/components/useThread";
import { initials } from "@/lib/format";
import { createClientDeviceBrowserClient } from "@/lib/supabase/browser";
import type { Message } from "@/lib/types";

export function ClientChat({
  clientId,
  freelancerName,
  driveLink,
  initialMessages,
}: {
  clientId: string;
  freelancerName: string;
  driveLink: string | null;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClientDeviceBrowserClient(), []);
  const { messages, add, connected } = useThread(supabase, clientId, "client", initialMessages);
  const [error, setError] = useState<string | null>(null);

  async function send(body: string) {
    setError(null);
    const { data, error } = await supabase.rpc("client_send_message", { p_client_id: clientId, p_body: body });
    if (error) {
      if (error.code === "42501") {
        // Access was revoked (new passcode/link, or archived): show the passcode screen again.
        router.refresh();
        return false;
      }
      setError("Message not sent. Check your connection and try again.");
      return false;
    }
    add(data as Message);
    return true;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials(freelancerName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{freelancerName}</span>
            <span className="block text-xs text-slate-500">Private chat</span>
          </span>
        </div>
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto mt-3 flex max-w-2xl items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm"
          >
            <span aria-hidden>📁</span>
            <span className="flex-1 font-medium">Shared files (Google Drive)</span>
            <span aria-hidden className="text-slate-400">↗</span>
          </a>
        )}
      </header>
      <ConnectionBanner connected={connected} />
      <MessageList messages={messages} viewer="client" emptyText={`Send ${freelancerName} a message to get started.`} />
      {error && <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">{error}</p>}
      <Composer onSend={send} placeholder={`Message ${freelancerName}`} />
    </div>
  );
}
