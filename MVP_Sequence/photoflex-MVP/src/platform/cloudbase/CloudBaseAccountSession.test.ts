import { describe, expect, it, vi } from "vitest";
import { CloudBaseAccountSession } from "./CloudBaseAccountSession";
import type { CloudBaseClient } from "./client";

describe("CloudBaseAccountSession", () => {
  it("requires email verification before opening a newly registered account", async () => {
    const verifyOtp = vi.fn(async ({ token }: { token: string }) => ({
      data: { user: { id: "cloudbase-user", email: "photo@example.com" }, session: { user: { id: "cloudbase-user", email: "photo@example.com" } } },
      error: null,
      token,
    }));
    const signUp = vi.fn(async () => ({ data: { user: null, session: null, verifyOtp }, error: null }));
    const account = new CloudBaseAccountSession({ auth: { signUp } } as unknown as CloudBaseClient);
    expect(await account.signUp("photo@example.com", "password123", { fullName: "Photo User" })).toEqual({
      ok: true,
      value: { confirmationRequired: true },
    });
    expect(signUp).toHaveBeenCalledWith({ email: "photo@example.com", password: "password123", name: "Photo User" });
    expect(await account.verifySignUp(" 123456 ")).toEqual({
      ok: true,
      value: { id: "cloudbase-user", email: "photo@example.com" },
    });
    expect(verifyOtp).toHaveBeenCalledWith({ token: "123456" });
    expect(await account.verifySignUp("123456")).toMatchObject({ ok: false });
  });
});
