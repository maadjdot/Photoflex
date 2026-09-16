import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

type SupabaseEnvironment = Readonly<Record<string, string | boolean | undefined>>;

export function readSupabaseConfiguration(environment: SupabaseEnvironment): SupabaseConfiguration | undefined {
  const url = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== "string" || typeof publishableKey !== "string" || !url.trim() || !publishableKey.trim()) return undefined;
  return { url: url.trim(), publishableKey: publishableKey.trim() };
}

export function createSupabaseClient(configuration: SupabaseConfiguration): SupabaseClient {
  return createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
