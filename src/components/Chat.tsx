"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { formatMessageTime } from "@/lib/format";
import type { Message, Sender } from "@/lib/types";

const CHANNEL_LABEL = { web: "", telegram: "via Telegram", email: "via email" } as const;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function Status({ m }: { m: Message }) {
  if (m.read_at) return <span className="text-sky-200" title="Seen">✓✓</span>;
  if (m.delivered_at) {
    const where = m.delivered_via === "telegram" ? " to Telegram" : m.delivered_via === "email" ? " by email" : "";
    return <span title={`Delivered${where}`}>✓✓</span>;
  }
  return <span title="Sent">✓</span>;
}

export function MessageList({
  messages,
  viewer,
  emptyText,
}: {
  messages: Message[];
  viewer: Sender;
  emptyText: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastSeenId = [...messages].reverse().find((m) => m.sender === viewer && m.read_at)?.id;

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {messages.length === 0 && <p className="mt-16 text-center text-sm text-slate-400">{emptyText}</p>}
      <ol className="mx-auto flex max-w-2xl flex-col gap-1">
        {messages.map((m, i) => {
          const mine = m.sender === viewer;
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const grouped = prev && !newDay && prev.sender === m.sender;
          return (
            <li key={m.id} className="flex flex-col">
              {newDay && (
                <span className="my-3 self-center rounded-full bg-slate-200/70 px-3 py-0.5 text-xs text-slate-600">
                  {dayLabel(m.created_at)}
                </span>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                  grouped ? "" : "mt-2"
                } ${mine ? "self-end rounded-br-md bg-indigo-600 text-white" : "self-start rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200"}`}
              >
                {m.body}
                <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[11px] ${mine ? "text-indigo-200" : "text-slate-400"}`}>
                  {CHANNEL_LABEL[m.channel] && <span>{CHANNEL_LABEL[m.channel]}</span>}
                  {formatMessageTime(m.created_at)}
                  {mine && <Status m={m} />}
                </span>
              </div>
              {m.id === lastSeenId && <span className="mt-0.5 self-end pr-1 text-[11px] text-slate-400">Seen</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Composer({
  onSend,
  disabled,
  placeholder = "Message",
}: {
  onSend: (body: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) setBody("");
    ref.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on devices with a real keyboard; on touch screens Enter is a new line.
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="pb-safe border-t border-slate-200 bg-white px-3 pt-3">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={5000}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || sending || !body.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z" />
          </svg>
        </button>
      </div>
    </form>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return <div className="bg-amber-100 px-3 py-1 text-center text-xs text-amber-800">Reconnecting…</div>;
}
