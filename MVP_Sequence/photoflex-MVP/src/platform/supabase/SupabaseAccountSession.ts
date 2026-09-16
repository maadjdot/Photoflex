import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
import { err, ok, type AccountError, type AccountSession, type AccountUser, type Result } from "../../contracts";

const toUser = (user: User): AccountUser => ({ id: user.id, ...(user.email ? { email: user.email } : {}) });

function toAccountError(error: AuthError): AccountError {
  if (error.code === "invalid_credentials") return { kind: "invalid-credentials" };
  if (error.code === "email_not_confirmed") return { kind: "email-not-confirmed" };
  if (error.code === "user_already_exists" || error.code === "email_exists") return { kind: "already-registered" };
  if (error.code === "weak_password") return { kind: "weak-password" };
  return { kind: "unavailable", retryable: error.status === 0 || (error.status !== undefined && error.status >= 500) };
}

export class SupabaseAccountSession implements AccountSession {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentUser(): Promise<Result<AccountUser | null, AccountError>> {
    const { data, error } = await this.client.auth.getUser();
    if (error) {
      if (error.code === "session_not_found") return ok(null);
      return err(toAccountError(error));
    }
    return ok(data.user ? toUser(data.user) : null);
  }

  subscribe(listener: (user: AccountUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(session?.user ? toUser(session.user) : null));
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<Result<AccountUser, AccountError>> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    return error ? err(toAccountError(error)) : ok(toUser(data.user));
  }

  async signUp(email: string, password: string, profile?: { readonly fullName?: string }): Promise<Result<{ readonly user: AccountUser; readonly confirmationRequired: boolean }, AccountError>> {
    const fullName = profile?.fullName?.trim();
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      ...(fullName ? { options: { data: { full_name: fullName } } } : {}),
    });
    if (error) return err(toAccountError(error));
    if (!data.user) return err({ kind: "unavailable", retryable: false });
    return ok({ user: toUser(data.user), confirmationRequired: !data.session });
  }

  async signInWithGoogle(): Promise<Result<void, AccountError>> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error ? err(toAccountError(error)) : ok(undefined);
  }

  async signOut(): Promise<Result<void, AccountError>> {
    const { error } = await this.client.auth.signOut();
    return error ? err(toAccountError(error)) : ok(undefined);
  }
}
