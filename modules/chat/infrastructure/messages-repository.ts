import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { Message, MessageRole } from "@/modules/chat/domain/types";

export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<Message> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content })
    .select("id, conversation_id, role, content")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    conversationId: data.conversation_id,
    role: data.role,
    content: data.content,
  };
}

// Returns the most recent `limit` messages in chronological (oldest-first) order, ready to feed
// straight into the model's message history.
export async function getRecentMessages(
  conversationId: string,
  limit: number
): Promise<Message[]> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
    }))
    .reverse();
}
