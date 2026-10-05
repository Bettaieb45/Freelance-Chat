import "server-only";
import { redirect } from "next/navigation";
import { createFreelancerServerClient } from "@/lib/supabase/server";

export function isAllowedEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

/** For freelancer pages and actions: returns the signed-in freelancer or redirects to /login. */
export async function requireFreelancer() {
  const supabase = await createFreelancerServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous) redirect("/login");
  const { data: freelancer } = await supabase
    .from("freelancers")
    .select("id, name, email")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!freelancer) redirect("/login?error=not_allowed");
  return { supabase, freelancer };
}
