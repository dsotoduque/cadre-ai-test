function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get openrouterApiKey() {
    return requireEnv("OPENROUTER_API_KEY");
  },
  get adminSecret() {
    return requireEnv("ADMIN_SECRET");
  },
};
