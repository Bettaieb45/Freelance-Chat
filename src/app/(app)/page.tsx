import Link from "next/link";
import { requireFreelancer } from "@/lib/auth";
import { formatShortTime, initials } from "@/lib/format";
import type { ClientRow } from "@/lib/types";
import { InboxLive } from "./InboxLive";

export default async function InboxPage({ searchParams }: PageProps<"/">) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const { supabase, freelancer } = await requireFreelancer();

  const [{ data: clients }, { data: unread }, { count: archivedCount }] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("archived", showArchived)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("messages").select("client_id").eq("sender", "client").is("read_at", null).limit(1000),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", true),
  ]);

  const unreadBy = new Map<string, number>();
  for (const m of unread ?? []) unreadBy.set(m.client_id, (unreadBy.get(m.client_id) ?? 0) + 1);
  const list = (clients ?? []) as ClientRow[];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1">
      <InboxLive freelancerId={freelancer.id} />
      <header className="sticky top-0 z-10 flex items-center justify-between bg-slate-50/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {showArchived && (
            <Link href="/" className="-ml-2 rounded-full p-2 text-slate-600" aria-label="Back to inbox">
              ←
            </Link>
          )}
          <h1 className="text-xl font-semibold">{showArchived ? "Archived" : "Inbox"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="rounded-full px-3 py-2 text-sm text-slate-500">
            Settings
          </Link>
          {!showArchived && (
            <Link href="/clients/new" className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              + Add client
            </Link>
          )}
        </div>
      </header>

      {list.length === 0 ? (
        <div className="px-6 py-20 text-center text-slate-500">
          {showArchived ? (
            "No archived clients."
          ) : (
            <>
              <p className="font-medium text-slate-700">No clients yet</p>
              <p className="mt-1 text-sm">Add a client to get their private chat link and passcode.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200/70">
          {list.map((c) => {
            const count = unreadBy.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-100">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${count ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                      {c.last_message_at && (
                        <span className={`shrink-0 text-xs ${count ? "font-medium text-indigo-600" : "text-slate-400"}`}>
                          {formatShortTime(c.last_message_at)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${count ? "text-slate-800" : "text-slate-500"}`}>
                        {c.last_message_preview
                          ? `${c.last_message_sender === "freelancer" ? "You: " : ""}${c.last_message_preview}`
                          : "No messages yet"}
                      </span>
                      {count > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white">
                          {count}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!showArchived && !!archivedCount && (
        <Link href="/?archived=1" className="block px-4 py-6 text-center text-sm text-slate-500">
          Archived ({archivedCount})
        </Link>
      )}
    </main>
  );
}
