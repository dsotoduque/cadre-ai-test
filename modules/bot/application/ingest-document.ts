import { chunkMarkdown } from "@/modules/bot/infrastructure/chunking/recursive-splitter";
import { embedTexts } from "@/modules/bot/infrastructure/embeddings/client";
import {
  upsertDocument,
  replaceChunks,
} from "@/modules/bot/infrastructure/ingestion/document-repository";
import type { KnowledgeDocument } from "@/modules/bot/domain/types";

export interface IngestResult {
  documentId: string;
  chunksWritten: number;
  skipped: boolean;
}

export async function ingestDocument(doc: KnowledgeDocument): Promise<IngestResult> {
  const { id: documentId, changed } = await upsertDocument(doc);

  if (!changed) {
    return { documentId, chunksWritten: 0, skipped: true };
  }

  const chunkTexts = chunkMarkdown(doc.content);
  const embeddings = await embedTexts(chunkTexts);

  const chunks = chunkTexts.map((content, index) => ({
    content,
    chunkIndex: index,
    embedding: embeddings[index],
  }));

  await replaceChunks(documentId, chunks);

  return { documentId, chunksWritten: chunks.length, skipped: false };
}
