import { describe, expect, it } from "vitest";
import { databaseNameForAccount, LEGACY_ACCOUNT_OWNER_KEY } from "./dependencies";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("databaseNameForAccount", () => {
  it("lets the first account retain legacy local data and isolates every other account", () => {
    const storage = new MemoryStorage();
    expect(databaseNameForAccount("account-a", storage)).toBe("photoflex-mvp");
    expect(storage.getItem(LEGACY_ACCOUNT_OWNER_KEY)).toBe("account-a");
    expect(databaseNameForAccount("account-a", storage)).toBe("photoflex-mvp");
    expect(databaseNameForAccount("account-b", storage)).toBe("photoflex-mvp-account-account-b");
  });
});
