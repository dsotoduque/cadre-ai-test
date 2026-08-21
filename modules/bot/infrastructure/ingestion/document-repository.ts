import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { KnowledgeDocument } from "@/modules/bot/domain/types";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface ChunkToWrite {
  content: string;
  chunkIndex: number;
  embedding: number[];
}

// Matched by title (the KB file's stable H1), not content_hash: content_hash changes whenever
// the file is edited, so it can't be the identity key — it's only used to detect whether a
// re-ingested document actually changed, to skip re-chunking/re-embedding unchanged content.
export async function upsertDocument(
  doc: KnowledgeDocument
): Promise<{ id: string; changed: boolean }> {
  const supabase = createSupabaseServiceClient();
  const contentHash = hashContent(doc.content);

  const { data: existing, error: findError } = await supabase
    .from("documents")
    .select("id, content_hash")
    .eq("title", doc.title)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    if (existing.content_hash === contentHash) {
      return { id: existing.id, changed: false };
    }
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content: doc.content,
        content_hash: contentHash,
        source_url: doc.sourceUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return { id: existing.id, changed: true };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      title: doc.title,
      source_url: doc.sourceUrl ?? null,
      content: doc.content,
      content_hash: contentHash,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  return { id: inserted.id, changed: true };
}

// Full delete + reinsert per document rather than a chunk-level upsert: it's the only way to
// correctly drop stale chunks when the source content shrinks or is restructured.
export async function replaceChunks(documentId: string, chunks: ChunkToWrite[]): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const { error: deleteError } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) throw deleteError;

  if (chunks.length === 0) return;

  const rows = chunks.map((chunk) => ({
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    content_hash: hashContent(`${documentId}:${chunk.chunkIndex}:${chunk.content}`),
    embedding: chunk.embedding,
  }));

  const { error: insertError } = await supabase.from("document_chunks").insert(rows);
  if (insertError) throw insertError;
}
