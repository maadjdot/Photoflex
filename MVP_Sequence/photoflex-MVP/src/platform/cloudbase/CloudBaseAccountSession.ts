import type { SignInRes } from "@cloudbase/js-sdk/auth";
import { err, ok, type AccountError, type AccountSession, type AccountUser, type Result } from "../../contracts";
import type { CloudBaseClient } from "./client";
import type { Analytics } from "../analytics/analytics";

type AuthFailure = { readonly code?: string; readonly status?: string | number; readonly message?: string };

const toUser = (user: { readonly id: unknown; readonly email?: unknown }): AccountUser => ({
  id: String(user.id),
  ...(typeof user.email === "string" ? { email: user.email } : {}),
});

export function toAccountError(error: AuthFailure): AccountError {
  const code = error.code?.toLowerCase();
  if (code === "invalid_credentials" || code === "invalid_grant" || code === "invalid_password") return { kind: "invalid-credentials" };
  if (code === "email_not_confirmed" || code === "email_unverified") return { kind: "email-not-confirmed" };
  if (code === "already_exists" || code === "user_already_exists" || code === "email_exists") return { kind: "already-registered" };
  if (code === "password_too_weak" || code === "weak_password") return { kind: "weak-password" };
  const status = Number(error.status);
  return { kind: "unavailable", retryable: error.status === undefined || status === 0 || status >= 500 };
}

export class CloudBaseAccountSession implements AccountSession {
  private pendingVerification?: (params: { token: string }) => Promise<SignInRes>;
  private authChangeVersion = 0;

  constructor(private readonly client: CloudBaseClient, private readonly analytics?: Analytics) {}

  async getCurrentUser(): Promise<Result<AccountUser | null, AccountError>> {
    const observedVersion = this.authChangeVersion;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) return err(toAccountError(error));
      const user = data.session?.user?.id ? toUser(data.session.user) : null;
      if (observedVersion === this.authChangeVersion) this.analytics?.setUser(user?.id ?? null);
      return ok(user);
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  subscribe(listener: (user: AccountUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.authChangeVersion++;
      const user = session?.user?.id ? toUser(session.user) : null;
      this.analytics?.setUser(user?.id ?? null);
      listener(user);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<Result<AccountUser, AccountError>> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) return err(toAccountError(error));
      const user = data.user ?? data.session?.user;
      if (!user?.id) return err({ kind: "unavailable", retryable: false });
      this.analytics?.setUser(String(user.id));
      return ok(toUser(user));
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async signUp(email: string, password: string, profile?: { readonly fullName?: string }): Promise<Result<{ readonly user?: AccountUser; readonly confirmationRequired: boolean }, AccountError>> {
    try {
      const name = profile?.fullName?.trim();
      const { data, error } = await this.client.auth.signUp({ email, password, ...(name ? { name } : {}) });
      if (error) return err(toAccountError(error));
      this.pendingVerification = data.verifyOtp;
      const registeredUser = data.user ?? data.session?.user;
      const user = registeredUser?.id ? toUser(registeredUser) : undefined;
      if (!data.session && !this.pendingVerification) return err({ kind: "unavailable", retryable: false });
      if (data.session && user) { this.analytics?.setUser(user.id); this.analytics?.track("signup_completed", "account"); }
      return ok({ ...(user ? { user } : {}), confirmationRequired: !data.session });
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async verifySignUp(code: string): Promise<Result<AccountUser, AccountError>> {
    if (!this.pendingVerification) return err({ kind: "unavailable", retryable: false });
    try {
      const { data, error } = await this.pendingVerification({ token: code.trim() });
      if (error) return err(toAccountError(error));
      const user = data.user ?? data.session?.user;
      if (!user?.id) return err({ kind: "unavailable", retryable: false });
      this.pendingVerification = undefined;
      this.analytics?.setUser(String(user.id));
      this.analytics?.track("signup_completed", "account");
      return ok(toUser(user));
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async signOut(): Promise<Result<void, AccountError>> {
    try {
      const response = await this.client.auth.signOut();
      if (!response || !("error" in response) || !response.error) this.analytics?.setUser(null);
      return response && "error" in response && response.error ? err(toAccountError(response.error)) : ok(undefined);
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }
}
