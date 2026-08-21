import OpenAI from "openai";
import { env } from "@/lib/env";

// Routed through OpenRouter, not the Anthropic SDK directly — verified working with tool-calling
// via OpenAI-compatible chat.completions, same underlying Claude Haiku 4.5 model.
const MODEL = "anthropic/claude-haiku-4.5";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 1024;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.openrouterApiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}

export async function callChatModel(params: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
}): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "system", content: params.system }, ...params.messages],
    tools: params.tools,
  });

  return response.choices[0].message;
}
