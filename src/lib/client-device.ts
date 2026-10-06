import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientDeviceServerClient } from "@/lib/supabase/server";
import type { Channel, TelegramLink } from "@/lib/types";

export type ClientPageData = {
  id: string;
  name: string;
  driveLink: string | null;
  email: string | null;
  preferredChannel: Channel;
  channelChosenAt: string | null;
  freelancerName: string;
  telegram: TelegramLink | null;
};

/**
 * Looks up the client behind a magic link and whether this browser has
 * unlocked it with the passcode. Returns null if the link is not active.
 */
export async function loadClientForDevice(
  token: string,
): Promise<{ client: ClientPageData; unlocked: boolean } | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("clients")
    .select(
      "id, name, email, drive_link, archived, preferred_channel, channel_chosen_at, freelancers(name), telegram_links(telegram_username, telegram_name)",
    )
    .eq("magic_token", token)
    .maybeSingle();
  if (!row || row.archived) return null;

  const freelancer = Array.isArray(row.freelancers) ? row.freelancers[0] : row.freelancers;
  const telegram = Array.isArray(row.telegram_links) ? row.telegram_links[0] : row.telegram_links;
  const client: ClientPageData = {
    id: row.id,
    name: row.name,
    driveLink: row.drive_link,
    email: row.email,
    preferredChannel: row.preferred_channel,
    channelChosenAt: row.channel_chosen_at,
    freelancerName: freelancer?.name ?? "your freelancer",
    telegram: telegram ?? null,
  };

  const device = await createClientDeviceServerClient();
  const { data: auth } = await device.auth.getUser();
  if (!auth.user) return { client, unlocked: false };
  const { data: session } = await admin
    .from("client_sessions")
    .select("client_id")
    .eq("auth_user_id", auth.user.id)
    .eq("client_id", client.id)
    .maybeSingle();
  return { client, unlocked: !!session };
}
