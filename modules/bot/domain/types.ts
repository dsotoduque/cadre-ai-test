export interface KnowledgeDocument {
  title: string;
  sourceUrl?: string;
  content: string;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  hasGroundedContext: boolean;
}

export type BotAnswer =
  | { type: "answer"; text: string }
  | { type: "escalate"; question: string; email?: string };
