import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientDeviceServerClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";
import { ClientChat } from "./ClientChat";
import { PasscodeForm } from "./PasscodeForm";

export const metadata: Metadata = { title: "Private chat", referrer: "no-referrer" };

export default async function ClientPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, name, drive_link, archived, freelancers(name)")
    .eq("magic_token", token)
    .maybeSingle();
  if (!client || client.archived) notFound();

  const freelancer = Array.isArray(client.freelancers) ? client.freelancers[0] : client.freelancers;
  const freelancerName = freelancer?.name ?? "your freelancer";

  const device = await createClientDeviceServerClient();
  const { data: auth } = await device.auth.getUser();
  const { data: session } = auth.user
    ? await admin
        .from("client_sessions")
        .select("client_id")
        .eq("auth_user_id", auth.user.id)
        .eq("client_id", client.id)
        .maybeSingle()
    : { data: null };

  if (!session) return <PasscodeForm token={token} freelancerName={freelancerName} />;

  const { data: messages } = await admin
    .from("messages")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <ClientChat
      clientId={client.id}
      freelancerName={freelancerName}
      driveLink={client.drive_link}
      initialMessages={((messages ?? []) as Message[]).reverse()}
    />
  );
}
