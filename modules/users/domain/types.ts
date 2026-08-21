export interface Lead {
  id: string;
  conversationId: string | null;
  question: string;
  email: string | null;
  status: "new" | "contacted";
  createdAt: string;
}
