import { embedText } from "@/modules/bot/infrastructure/embeddings/client";
import { matchDocuments } from "@/modules/bot/infrastructure/retrieval/match-documents-repository";
import type { RetrievalResult } from "@/modules/bot/domain/types";

// Tuned empirically against the acceptance scenarios in specs/00-product-spec.md — see
// specs/02-rag-pipeline.md's calibration note. Off-topic queries score ~0.05-0.06 cosine
// similarity against this KB; on-topic queries start around 0.35+. 0.75 (the original starting
// guess) was far too strict and excluded genuinely relevant chunks.
const MATCH_THRESHOLD = 0.35;
const MATCH_COUNT = 4;

// Query scope is the latest user message only (no multi-turn history) — accepted v1 limitation,
// see README trade-off table.
export async function retrieveContext(query: string): Promise<RetrievalResult> {
  const embedding = await embedText(query);
  const chunks = await matchDocuments(embedding, MATCH_THRESHOLD, MATCH_COUNT);

  return { chunks, hasGroundedContext: chunks.length > 0 };
}
