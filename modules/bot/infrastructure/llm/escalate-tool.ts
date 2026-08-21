import type OpenAI from "openai";

export const ESCALATE_TOOL_NAME = "escalate_to_human";

export const escalateToHumanTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: ESCALATE_TOOL_NAME,
    description:
      "Log the user's question for the Cadre AI team when it can't be answered from the knowledge base, or when the user explicitly asks for a human.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The user's question, summarized if needed" },
        email: { type: "string", description: "User's email, if they provided one" },
      },
      required: ["question"],
    },
  },
};
