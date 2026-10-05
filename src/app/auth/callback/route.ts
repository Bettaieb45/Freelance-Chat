import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFreelancerServerClient } from "@/lib/supabase/server";

// Google OAuth lands here. Only ALLOWED_EMAIL may become the freelancer.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createFreelancerServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth`);

  const user = data.user;
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  const admin = createAdminClient();
  const meta = user.user_metadata as { full_name?: string; name?: string };
  const { error: upsertError } = await admin.from("freelancers").upsert(
    {
      auth_user_id: user.id,
      email: user.email!,
      name: meta.full_name ?? meta.name ?? user.email!.split("@")[0],
    },
    { onConflict: "auth_user_id", ignoreDuplicates: true },
  );
  if (upsertError) return NextResponse.redirect(`${origin}/login?error=setup`);

  return NextResponse.redirect(`${origin}/`);
}
