import { describe, expect, it } from "vitest";
import { readSupabaseConfiguration } from "./client";

describe("readSupabaseConfiguration", () => {
  it("enables Supabase only when both public values exist", () => {
    expect(readSupabaseConfiguration({ VITE_SUPABASE_URL: "https://example.supabase.co" })).toBeUndefined();
    expect(readSupabaseConfiguration({
      VITE_SUPABASE_URL: " https://example.supabase.co ",
      VITE_SUPABASE_PUBLISHABLE_KEY: " publishable-key ",
    })).toEqual({ url: "https://example.supabase.co", publishableKey: "publishable-key" });
  });
});
