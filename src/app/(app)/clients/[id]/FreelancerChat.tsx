"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Composer, ConnectionBanner, MessageList } from "@/components/Chat";
import { useThread } from "@/components/useThread";
import { initials } from "@/lib/format";
import { createFreelancerBrowserClient } from "@/lib/supabase/browser";
import type { ClientRow, Message } from "@/lib/types";
import { ClientDetails } from "./ClientDetails";

export function FreelancerChat({
  client,
  link,
  initialMessages,
}: {
  client: ClientRow;
  link: string;
  initialMessages: Message[];
}) {
  const supabase = useMemo(() => createFreelancerBrowserClient(), []);
  const { messages, add, connected } = useThread(supabase, client.id, "freelancer", initialMessages);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: string) {
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ client_id: client.id, sender: "freelancer", body })
      .select()
      .single();
    if (error) {
      setError("Message not sent. Check your connection and try again.");
      return false;
    }
    add(data as Message);
    return true;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <Link href="/" className="rounded-full p-2 text-slate-600" aria-label="Back to inbox">
          ←
        </Link>
        <button onClick={() => setShowDetails(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initials(client.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{client.name}</span>
            <span className="block text-xs text-slate-500">{client.archived ? "Archived" : "Tap for link & settings"}</span>
          </span>
        </button>
      </header>
      <ConnectionBanner connected={connected} />
      <MessageList
        messages={messages}
        viewer="freelancer"
        emptyText="No messages yet. Say hi, or share the invite from the settings."
      />
      {error && <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">{error}</p>}
      {client.archived ? (
        <p className="pb-safe border-t border-slate-200 bg-white px-4 pt-3 text-center text-sm text-slate-500">
          This client is archived. Unarchive in settings to chat again.
        </p>
      ) : (
        <Composer onSend={send} placeholder={`Message ${client.name}`} />
      )}
      {showDetails && <ClientDetails client={client} link={link} onClose={() => setShowDetails(false)} />}
    </div>
  );
}
