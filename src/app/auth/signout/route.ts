import { NextResponse, type NextRequest } from "next/server";
import { createFreelancerServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createFreelancerServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 303 });
}
