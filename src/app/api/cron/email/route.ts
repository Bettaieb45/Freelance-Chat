import { timingSafeEqual } from "node:crypto";
import { emailConfigured } from "@/lib/email/config";
import { syncInbox } from "@/lib/email/inbound";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called every minute by Supabase pg_cron (see README) to pick up email replies.
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  if (!emailConfigured()) return Response.json({ skipped: "email not configured" });
  try {
    return Response.json(await syncInbox());
  } catch (err) {
    console.error("email sync failed", err);
    return Response.json({ error: "sync failed" }, { status: 500 });
  }
}
