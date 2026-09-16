import type { AccountSession, PhotoSource, ProjectCloud, ProjectId, ProjectStore } from "../contracts";
import { BrowserPhotoSource } from "../platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../platform/browser/IndexedDbProjectStore";
import { createSupabaseClient, readSupabaseConfiguration } from "../platform/supabase/client";
import { SupabaseAccountSession } from "../platform/supabase/SupabaseAccountSession";
import { SupabaseProjectCloud } from "../platform/supabase/SupabaseProjectCloud";

export interface AppDiagnosticEvent {
  readonly name: "write-failure";
  readonly projectId: ProjectId;
  readonly scope: string;
  readonly workspaceRevision?: number;
  readonly sequenceRevision?: number;
  readonly errorKind: string;
}

export interface AppDependencies {
  readonly projectStore: ProjectStore;
  readonly photoSource: PhotoSource;
  readonly accountSession?: AccountSession;
  readonly projectCloud?: ProjectCloud;
  readonly accountWorkspaces?: AccountWorkspaceFactory;
  readonly diagnostics?: { report(event: AppDiagnosticEvent): void };
}

export interface AccountWorkspace {
  readonly dependencies: AppDependencies;
  close(): Promise<void>;
}

export interface AccountWorkspaceFactory {
  open(userId: string): AccountWorkspace;
}

export const LEGACY_ACCOUNT_OWNER_KEY = "photoflex:legacy-account-owner";

export function databaseNameForAccount(userId: string, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): string {
  const owner = storage.getItem(LEGACY_ACCOUNT_OWNER_KEY);
  if (!owner) {
    storage.setItem(LEGACY_ACCOUNT_OWNER_KEY, userId);
    return "photoflex-mvp";
  }
  return owner === userId ? "photoflex-mvp" : `photoflex-mvp-account-${userId}`;
}

function createLocalWorkspace(databaseName = "photoflex-mvp"): Pick<AppDependencies, "projectStore" | "photoSource"> & { close(): Promise<void> } {
  const projectStore = IndexedDbProjectStore.open({ databaseName });
  const photoSource = new BrowserPhotoSource({ databaseName });
  return {
    projectStore,
    photoSource,
    close: async () => { await Promise.all([projectStore.close(), photoSource.close()]); },
  };
}

export function createBrowserDependencies(): AppDependencies {
  const configuration = readSupabaseConfiguration(import.meta.env);
  const supabase = configuration ? createSupabaseClient(configuration) : undefined;
  const local = createLocalWorkspace();
  const accountSession = supabase ? new SupabaseAccountSession(supabase) : undefined;
  const projectCloud = supabase ? new SupabaseProjectCloud(supabase) : undefined;
  return {
    projectStore: local.projectStore,
    photoSource: local.photoSource,
    ...(accountSession && projectCloud ? {
      accountSession,
      projectCloud,
      accountWorkspaces: {
        open(userId: string): AccountWorkspace {
          const scoped = createLocalWorkspace(databaseNameForAccount(userId));
          return {
            dependencies: {
              projectStore: scoped.projectStore,
              photoSource: scoped.photoSource,
              accountSession,
              projectCloud,
            },
            close: scoped.close,
          };
        },
      },
    } : {}),
    ...(import.meta.env.DEV ? { diagnostics: { report: (event: AppDiagnosticEvent) => console.warn("[PhotoFlex]", event) } } : {}),
  };
}
