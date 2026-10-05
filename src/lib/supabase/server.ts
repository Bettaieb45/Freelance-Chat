import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { CLIENT_AUTH_COOKIE } from "./cookies";

async function create(cookieName?: string) {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy (src/proxy.ts) refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

/** Supabase client acting as the signed-in freelancer (RLS applies). */
export const createFreelancerServerClient = () => create();

/** Supabase client acting as the client device's anonymous session (RLS applies). */
export const createClientDeviceServerClient = () => create(CLIENT_AUTH_COOKIE);
