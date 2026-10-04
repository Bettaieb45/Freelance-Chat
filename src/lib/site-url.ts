import "server-only";
import { headers } from "next/headers";

/** Origin of the current request, so links work on localhost, previews and production. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function clientPageUrl(token: string): Promise<string> {
  return `${await siteOrigin()}/c/${token}`;
}
