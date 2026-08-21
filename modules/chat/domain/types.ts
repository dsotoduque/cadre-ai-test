export type ConversationStatus = "open" | "escalated" | "closed";

export interface Conversation {
  id: string;
  status: ConversationStatus;
}

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
}
