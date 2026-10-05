"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, Sender } from "@/lib/types";

function upsert(list: Message[], m: Message): Message[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i === -1) return [...list, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const next = list.slice();
  next[i] = m;
  return next;
}

/**
 * Live message list for one conversation, for either side.
 * - Subscribes to inserts/updates (new messages, read receipts) via Supabase Realtime.
 * - Re-fetches after reconnecting, so nothing is missed while the phone slept.
 * - Marks the other side's messages as read while the page is visible.
 */
export function useThread(
  supabase: SupabaseClient,
  clientId: string,
  viewer: Sender,
  initial: Message[],
) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [connected, setConnected] = useState(true);
  const markingRef = useRef(false);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) setMessages((data as Message[]).reverse());
  }, [supabase, clientId]);

  useEffect(() => {
    let subscribedOnce = false;
    const channel = supabase
      .channel(`thread:${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setMessages((list) => upsert(list, payload.new as Message));
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          if (subscribedOnce) refetch();
          subscribedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, clientId, refetch]);

  // Read receipts: only while the tab is actually visible.
  const hasUnreadFromOther = messages.some((m) => m.sender !== viewer && !m.read_at);
  useEffect(() => {
    async function markIfVisible() {
      if (!hasUnreadFromOther || markingRef.current || document.visibilityState !== "visible") return;
      markingRef.current = true;
      await supabase.rpc("mark_read", { p_client_id: clientId });
      markingRef.current = false;
    }
    markIfVisible();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refetch();
        markIfVisible();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [supabase, clientId, hasUnreadFromOther, refetch]);

  const add = useCallback((m: Message) => setMessages((list) => upsert(list, m)), []);

  return { messages, add, connected };
}
