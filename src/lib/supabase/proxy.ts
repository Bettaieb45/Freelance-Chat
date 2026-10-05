import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

/** Refreshes the auth session cookie (if any) before the page renders. */
export async function refreshSession(request: NextRequest, cookieName?: string) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Don't put code between client creation and this call (Supabase SSR guidance).
  await supabase.auth.getClaims();
  persistAuthCookies(request, response, cookieName);
  return response;
}

const DEFAULT_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const MAX_AGE = 400 * 24 * 60 * 60; // Same as @supabase/ssr's default.

/**
 * Safari (ITP) caps cookies written by JavaScript to 7 days. The browser
 * Supabase client writes the session cookie that way, so a client who didn't
 * come back within a week would be asked for the passcode again. Re-sending
 * the same cookies from the server on every visit lifts that cap.
 */
function persistAuthCookies(request: NextRequest, response: NextResponse, cookieName?: string) {
  const isAuthCookie = (name: string) =>
    cookieName ? name === cookieName || name.startsWith(`${cookieName}.`) : DEFAULT_AUTH_COOKIE.test(name);
  for (const { name, value } of request.cookies.getAll()) {
    if (!isAuthCookie(name) || response.cookies.has(name)) continue;
    response.cookies.set(name, value, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: request.nextUrl.protocol === "https:",
      maxAge: MAX_AGE,
    });
  }
}
