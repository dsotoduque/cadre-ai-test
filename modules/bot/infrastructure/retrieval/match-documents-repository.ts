import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { RetrievedChunk } from "@/modules/bot/domain/types";

export async function matchDocuments(
  embedding: number[],
  matchThreshold: number,
  matchCount: number
): Promise<RetrievedChunk[]> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });
  if (error) throw error;

  return (data ?? []).map((row: { id: string; document_id: string; content: string; similarity: number }) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    similarity: row.similarity,
  }));
}
