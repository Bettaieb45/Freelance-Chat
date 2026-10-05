"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { createFreelancerBrowserClient } from "@/lib/supabase/browser";

/** Re-renders the inbox whenever a message arrives or a client changes. */
export function InboxLive({ freelancerId }: { freelancerId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createFreelancerBrowserClient(), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients", filter: `freelancer_id=eq.${freelancerId}` }, refresh)
      // RLS limits these to this freelancer's threads; catches read-receipt changes to unread counts.
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, freelancerId, router]);

  return null;
}
