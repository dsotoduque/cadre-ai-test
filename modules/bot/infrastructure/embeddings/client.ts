import OpenAI from "openai";
import { env } from "@/lib/env";

// Routed through OpenRouter (one of Cadre AI's own key partners for model access) rather than
// calling OpenAI directly — verified to proxy this endpoint correctly, same 1536-dim output.
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.openrouterApiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
