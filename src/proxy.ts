import type { NextRequest } from "next/server";
import { CLIENT_AUTH_COOKIE } from "@/lib/supabase/cookies";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const isClientPage = request.nextUrl.pathname.startsWith("/c/");
  return refreshSession(request, isClientPage ? CLIENT_AUTH_COOKIE : undefined);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/).*)"],
};
