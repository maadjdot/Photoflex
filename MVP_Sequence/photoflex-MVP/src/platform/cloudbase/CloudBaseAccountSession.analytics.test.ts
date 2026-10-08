import { expect, it, vi } from "vitest";
import { CloudBaseAccountSession } from "./CloudBaseAccountSession";
import type { CloudBaseClient } from "./client";
it("records registration only after OTP confirmation and clears telemetry identity after sign out", async () => {
  const analytics = { track: vi.fn(), setUser: vi.fn() };
  const verifyOtp = vi.fn().mockResolvedValueOnce({ data: {}, error: { code: "invalid_credentials" } }).mockResolvedValueOnce({ data: { user: { id: "a", email: "private@example.com" } }, error: null });
  const account = new CloudBaseAccountSession({ auth: { signUp: async () => ({ data: { verifyOtp }, error: null }), signOut: async () => ({ error: null }) } } as unknown as CloudBaseClient, analytics);
  await account.signUp("private@example.com", "private-password");
  expect(analytics.track).not.toHaveBeenCalled();
  expect((await account.verifySignUp("wrong-code")).ok).toBe(false); expect(analytics.track).not.toHaveBeenCalled();
  expect((await account.verifySignUp("good-code")).ok).toBe(true);
  expect(analytics.setUser).toHaveBeenLastCalledWith("a"); expect(analytics.track).toHaveBeenCalledWith("signup_completed", "account");
  await account.signOut(); expect(analytics.setUser).toHaveBeenLastCalledWith(null);
  expect(JSON.stringify(analytics.track.mock.calls)).not.toContain("private");
});
it("uses the username credential for the administrator account", async () => {
  const signInWithPassword = vi.fn(async () => ({ data: { user: { id: "admin-id" } }, error: null }));
  const account = new CloudBaseAccountSession({ auth: { signInWithPassword } } as unknown as CloudBaseClient);
  expect((await account.signIn("administrator", "test-password")).ok).toBe(true);
  expect(signInWithPassword).toHaveBeenCalledWith({ username: "administrator", password: "test-password" });
});
