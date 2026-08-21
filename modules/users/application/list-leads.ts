import { findAllLeads } from "@/modules/users/infrastructure/leads-repository";
import type { Lead } from "@/modules/users/domain/types";

export async function listLeads(): Promise<Lead[]> {
  return findAllLeads();
}
