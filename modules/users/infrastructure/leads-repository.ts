import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Lead } from "@/modules/users/domain/types";

export async function insertLead(params: {
  conversationId: string | null;
  question: string;
  email?: string;
}): Promise<Lead> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("leads")
    .insert({
      conversation_id: params.conversationId,
      question: params.question,
      email: params.email ?? null,
    })
    .select("id, conversation_id, question, email, status")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    conversationId: data.conversation_id,
    question: data.question,
    email: data.email,
    status: data.status,
  };
}
