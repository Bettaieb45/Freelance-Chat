import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { CLIENT_AUTH_COOKIE } from "./cookies";

export function createFreelancerBrowserClient() {
  return createBrowserClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY());
}

export function createClientDeviceBrowserClient() {
  return createBrowserClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    cookieOptions: { name: CLIENT_AUTH_COOKIE },
    isSingleton: false,
  });
}
