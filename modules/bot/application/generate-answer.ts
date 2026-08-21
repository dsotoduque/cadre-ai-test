import { z } from "zod";
import { callChatModel } from "@/modules/bot/infrastructure/llm/client";
import { buildSystemPrompt } from "@/modules/bot/infrastructure/llm/system-prompt";
import { escalateToHumanTool, ESCALATE_TOOL_NAME } from "@/modules/bot/infrastructure/llm/escalate-tool";
import { retrieveContext } from "@/modules/bot/application/retrieve-context";
import type { BotAnswer, ChatHistoryMessage } from "@/modules/bot/domain/types";

const escalateInputSchema = z.object({
  question: z.string().min(1),
  email: z.string().email().optional(),
});

// Used when the deterministic gate fires — no model call happens in that path, so there is no
// model-generated text to show the user instead.
const GATE_ACKNOWLEDGMENT =
  "I don't have grounded information to answer that confidently. I've logged your question so the Cadre AI team can follow up.";

export async function generateAnswer(
  userMessage: string,
  history: ChatHistoryMessage[] = []
): Promise<BotAnswer> {
  const retrieval = await retrieveContext(userMessage);

  // Deterministic gate: no grounded content clears the similarity threshold, so don't even ask
  // the model to answer — escalate directly rather than risk a fabricated response.
  if (!retrieval.hasGroundedContext) {
    return { type: "escalate", question: userMessage, acknowledgment: GATE_ACKNOWLEDGMENT };
  }

  const system = buildSystemPrompt(retrieval.chunks);
  const message = await callChatModel({
    system,
    messages: [...history, { role: "user", content: userMessage }],
    tools: [escalateToHumanTool],
  });

  const toolCall = message.tool_calls?.find(
    (call) => call.type === "function" && call.function.name === ESCALATE_TOOL_NAME
  );

  if (toolCall && toolCall.type === "function") {
    const rawArgs = safeJsonParse(toolCall.function.arguments);
    const parsed = escalateInputSchema.safeParse(rawArgs);
    const acknowledgment = message.content?.trim() || GATE_ACKNOWLEDGMENT;

    if (parsed.success) {
      return {
        type: "escalate",
        question: parsed.data.question,
        email: parsed.data.email,
        acknowledgment,
      };
    }
    return { type: "escalate", question: userMessage, acknowledgment };
  }

  return { type: "answer", text: message.content ?? "" };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
