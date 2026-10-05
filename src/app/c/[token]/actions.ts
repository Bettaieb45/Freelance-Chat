"use server";

import { randomBytes } from "node:crypto";
import { loadClientForDevice } from "@/lib/client-device";
import { botUsername, telegramConfigured } from "@/lib/telegram/bot";
import { MAX_PASSCODE_ATTEMPTS, PASSCODE_LENGTH, PASSCODE_LOCK_MINUTES, normalizePasscode, verifyPasscode } from "@/lib/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientDeviceServerClient } from "@/lib/supabase/server";

export type UnlockResult = { ok: true } | { ok: false; error: string };

/**
 * Checks the passcode for a client link. On success, links this browser's
 * anonymous session to the client, so it can read and send messages (RLS).
 */
export async function unlockAction(token: string, rawPasscode: string): Promise<UnlockResult> {
  const passcode = normalizePasscode(rawPasscode);
  if (passcode.length !== PASSCODE_LENGTH) return { ok: false, error: `Enter the ${PASSCODE_LENGTH}-digit passcode.` };

  const device = await createClientDeviceServerClient();
  const { data: auth } = await device.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your browser session expired. Please reload the page." };

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, archived, client_access(passcode_hash, locked_until)")
    .eq("magic_token", token)
    .maybeSingle();
  const access = Array.isArray(client?.client_access) ? client.client_access[0] : client?.client_access;
  if (!client || client.archived || !access) return { ok: false, error: "This link is no longer active." };

  if (access.locked_until && new Date(access.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(access.locked_until).getTime() - Date.now()) / 60_000);
    return { ok: false, error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  if (!(await verifyPasscode(passcode, access.passcode_hash))) {
    const { data: left } = await admin.rpc("record_passcode_failure", {
      p_client_id: client.id,
      p_max: MAX_PASSCODE_ATTEMPTS,
      p_lock_minutes: PASSCODE_LOCK_MINUTES,
    });
    if (left === 0) {
      return { ok: false, error: `Too many wrong attempts. Try again in ${PASSCODE_LOCK_MINUTES} minutes.` };
    }
    return { ok: false, error: `That passcode isn't right. ${left} attempt${left === 1 ? "" : "s"} left.` };
  }

  await admin.from("client_access").update({ failed_attempts: 0, locked_until: null }).eq("client_id", client.id);
  const { error } = await admin
    .from("client_sessions")
    .upsert({ auth_user_id: auth.user.id, client_id: client.id }, { ignoreDuplicates: true });
  if (error) return { ok: false, error: "Something went wrong. Please try again." };
  return { ok: true };
}

const TELEGRAM_CODE_MINUTES = 30;

/**
 * Creates a one-time Telegram deep link for an unlocked browser. The client
 * taps it, Telegram opens the bot, and "/start <code>" links their chat.
 */
export async function createTelegramLinkAction(token: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!telegramConfigured()) return { ok: false, error: "Telegram isn't available yet." };
  const result = await loadClientForDevice(token);
  if (!result?.unlocked) return { ok: false, error: "Please reload the page and enter your passcode." };

  // Telegram allows up to 64 chars of [A-Za-z0-9_-] in a start parameter.
  const code = randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const { error } = await admin.from("telegram_link_codes").insert({
    code,
    client_id: result.client.id,
    expires_at: new Date(Date.now() + TELEGRAM_CODE_MINUTES * 60_000).toISOString(),
  });
  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  try {
    return { ok: true, url: `https://t.me/${await botUsername()}?start=${code}` };
  } catch {
    return { ok: false, error: "Telegram isn't reachable right now. Please try again later." };
  }
}
