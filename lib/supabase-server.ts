import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { env } from "@/lib/env";

// Node 20 (this project's runtime) has no global WebSocket; supabase-js always constructs a
// Realtime client internally even though this app never uses Realtime features, so it needs the
// `ws` polyfill or client construction throws.
export function createSupabaseServiceClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
}
