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
    .select("id, conversation_id, question, email, status, created_at")
    .single();
  if (error) throw error;

  return toLead(data);
}

export async function findAllLeads(): Promise<Lead[]> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, conversation_id, question, email, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map(toLead);
}

function toLead(row: {
  id: string;
  conversation_id: string | null;
  question: string;
  email: string | null;
  status: "new" | "contacted";
  created_at: string;
}): Lead {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    question: row.question,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
  };
}
