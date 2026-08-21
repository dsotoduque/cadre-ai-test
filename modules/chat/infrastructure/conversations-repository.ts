import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Conversation, ConversationStatus } from "@/modules/chat/domain/types";

export async function createConversation(): Promise<Conversation> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("conversations")
    .insert({})
    .select("id, status")
    .single();
  if (error) throw error;

  return { id: data.id, status: data.status };
}

export async function findConversation(id: string): Promise<Conversation | null> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return { id: data.id, status: data.status };
}

export async function updateConversationStatus(
  id: string,
  status: ConversationStatus
): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const { error } = await supabase.from("conversations").update({ status }).eq("id", id);
  if (error) throw error;
}
