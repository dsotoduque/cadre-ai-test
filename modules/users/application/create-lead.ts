import { insertLead } from "@/modules/users/infrastructure/leads-repository";
import type { Lead } from "@/modules/users/domain/types";

export async function createLead(params: {
  conversationId: string | null;
  question: string;
  email?: string;
}): Promise<Lead> {
  return insertLead(params);
}
