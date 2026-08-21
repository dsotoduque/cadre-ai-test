import { readKbFiles } from "@/modules/bot/infrastructure/ingestion/kb-files";
import { ingestDocument } from "@/modules/bot/application/ingest-document";

export interface KbIngestSummary {
  fileName: string;
  documentId: string;
  chunksWritten: number;
  skipped: boolean;
}

export async function ingestKnowledgeBase(): Promise<KbIngestSummary[]> {
  const files = await readKbFiles();
  const summaries: KbIngestSummary[] = [];

  for (const file of files) {
    const result = await ingestDocument({ title: file.title, content: file.content });
    summaries.push({ fileName: file.fileName, ...result });
  }

  return summaries;
}
