import { notFound } from "next/navigation";
import { requireFreelancer } from "@/lib/auth";
import { clientPageUrl } from "@/lib/site-url";
import type { ClientRow, Message } from "@/lib/types";
import { FreelancerChat } from "./FreelancerChat";

export default async function ClientChatPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const { supabase } = await requireFreelancer();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();

  // Newest 500, shown oldest-first.
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <FreelancerChat
      client={client as ClientRow}
      link={await clientPageUrl(client.magic_token)}
      initialMessages={((messages ?? []) as Message[]).reverse()}
    />
  );
}
