import type { ProjectBackupV1 } from "./backup";
import type { ProjectId, Result } from "./ids";

export interface AccountUser {
  readonly id: string;
  readonly email?: string;
}

export type AccountError =
  | { readonly kind: "invalid-credentials" }
  | { readonly kind: "email-not-confirmed" }
  | { readonly kind: "already-registered" }
  | { readonly kind: "weak-password" }
  | { readonly kind: "unavailable"; readonly retryable: boolean };

export interface AccountSession {
  getCurrentUser(): Promise<Result<AccountUser | null, AccountError>>;
  subscribe(listener: (user: AccountUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<Result<AccountUser, AccountError>>;
  signUp(email: string, password: string, profile?: { readonly fullName?: string }): Promise<Result<{ readonly user?: AccountUser; readonly confirmationRequired: boolean }, AccountError>>;
  verifySignUp?(code: string): Promise<Result<AccountUser, AccountError>>;
  signInWithGoogle?(): Promise<Result<void, AccountError>>;
  signOut(): Promise<Result<void, AccountError>>;
}

export interface CloudProjectSummary {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly schemaVersion: number;
  readonly cloudRevision: number;
  readonly updatedAt: string;
}

export interface CloudProjectSnapshot extends CloudProjectSummary {
  readonly document: ProjectBackupV1;
}

export type CloudProjectError =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "not-found"; readonly projectId: ProjectId }
  | { readonly kind: "conflict"; readonly expectedRevision: number | null; readonly actualRevision: number }
  | { readonly kind: "invalid-snapshot" }
  | { readonly kind: "unavailable"; readonly retryable: boolean };

export interface PushCloudProjectInput {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly schemaVersion: number;
  readonly document: ProjectBackupV1;
  /** Null creates the first cloud snapshot; a number performs compare-and-swap. */
  readonly expectedCloudRevision: number | null;
}

export interface ProjectCloud {
  list(): Promise<Result<readonly CloudProjectSummary[], CloudProjectError>>;
  pull(projectId: ProjectId): Promise<Result<CloudProjectSnapshot, CloudProjectError>>;
  push(input: PushCloudProjectInput): Promise<Result<CloudProjectSnapshot, CloudProjectError>>;
  delete(projectId: ProjectId, expectedCloudRevision: number): Promise<Result<void, CloudProjectError>>;
}
