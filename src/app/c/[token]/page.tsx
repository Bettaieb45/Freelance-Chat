import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadClientForDevice } from "@/lib/client-device";
import { emailConfigured } from "@/lib/email/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { telegramConfigured } from "@/lib/telegram/bot";
import type { Message } from "@/lib/types";
import { ClientChat } from "./ClientChat";
import { PasscodeForm } from "./PasscodeForm";

export const metadata: Metadata = { title: "Private chat", referrer: "no-referrer" };

export default async function ClientPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const result = await loadClientForDevice(token);
  if (!result) notFound();
  const { client, unlocked } = result;

  if (!unlocked) return <PasscodeForm token={token} freelancerName={client.freelancerName} />;

  const { data: messages } = await createAdminClient()
    .from("messages")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <ClientChat
      token={token}
      client={client}
      telegramAvailable={telegramConfigured()}
      emailAvailable={emailConfigured()}
      initialMessages={((messages ?? []) as Message[]).reverse()}
    />
  );
}
