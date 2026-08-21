import {
  createConversation,
  findConversation,
  updateConversationStatus,
} from "@/modules/chat/infrastructure/conversations-repository";
import { addMessage, getRecentMessages } from "@/modules/chat/infrastructure/messages-repository";
import { generateAnswer } from "@/modules/bot/application/generate-answer";
import { createLead } from "@/modules/users/application/create-lead";

const HISTORY_LIMIT = 3;

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation not found: ${id}`);
  }
}

export interface SendMessageResult {
  conversationId: string;
  message: { role: "assistant"; content: string };
  escalated: boolean;
}

export async function sendMessage(params: {
  conversationId?: string;
  message: string;
}): Promise<SendMessageResult> {
  const conversation = params.conversationId
    ? await findConversation(params.conversationId)
    : await createConversation();

  if (!conversation) {
    throw new ConversationNotFoundError(params.conversationId!);
  }

  const history = await getRecentMessages(conversation.id, HISTORY_LIMIT);
  await addMessage(conversation.id, "user", params.message);

  const answer = await generateAnswer(
    params.message,
    history.map((m) => ({ role: m.role, content: m.content }))
  );

  if (answer.type === "escalate") {
    await updateConversationStatus(conversation.id, "escalated");
    await createLead({
      conversationId: conversation.id,
      question: answer.question,
      email: answer.email,
    });
    await addMessage(conversation.id, "assistant", answer.acknowledgment);

    return {
      conversationId: conversation.id,
      message: { role: "assistant", content: answer.acknowledgment },
      escalated: true,
    };
  }

  await addMessage(conversation.id, "assistant", answer.text);

  return {
    conversationId: conversation.id,
    message: { role: "assistant", content: answer.text },
    escalated: false,
  };
}
