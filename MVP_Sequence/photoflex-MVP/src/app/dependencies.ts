import type { AccountSession, PhotoSource, ProjectCloud, ProjectId, ProjectStore } from "../contracts";
import { BrowserPhotoSource } from "../platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../platform/browser/IndexedDbProjectStore";
import { createCloudBaseClient, readCloudBaseConfiguration } from "../platform/cloudbase/client";
import { CloudBaseAccountSession } from "../platform/cloudbase/CloudBaseAccountSession";
import { CloudBaseProjectCloud } from "../platform/cloudbase/CloudBaseProjectCloud";
import { CloudBackedProjectStore, type CloudSaveStatus } from "../platform/cloudbase/CloudBackedProjectStore";
import { onSharedScanCompleted } from "./ProjectSourceMonitor";

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
  readonly cloudSave?: { subscribe(listener: () => void): () => void; getStatus(projectId: ProjectId): CloudSaveStatus; hasPending?(): boolean };
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
  const configuration = readCloudBaseConfiguration(import.meta.env);
  const cloudbase = configuration ? createCloudBaseClient(configuration) : undefined;
  const local = createLocalWorkspace();
  const accountSession = cloudbase ? new CloudBaseAccountSession(cloudbase) : undefined;
  const projectCloud = cloudbase ? new CloudBaseProjectCloud(cloudbase, accountSession!) : undefined;
  return {
    projectStore: local.projectStore,
    photoSource: local.photoSource,
    ...(accountSession && projectCloud ? {
      accountSession,
      projectCloud,
      accountWorkspaces: {
        open(userId: string): AccountWorkspace {
          const scoped = createLocalWorkspace(databaseNameForAccount(userId));
          const synced = new CloudBackedProjectStore(scoped.projectStore as IndexedDbProjectStore, projectCloud, window.localStorage, `photoflex:cloud-auto:${configuration!.envId}:${userId}`);
          const unsubscribeScan = onSharedScanCompleted(scoped.photoSource, (sourceId) => { void synced.photoIndexChanged(sourceId); });
          return {
            dependencies: {
              projectStore: synced,
              photoSource: scoped.photoSource,
              accountSession,
              projectCloud,
              cloudSave: synced,
            },
            close: async () => { unsubscribeScan(); synced.dispose(); await scoped.close(); },
          };
        },
      },
    } : {}),
    ...(import.meta.env.DEV ? { diagnostics: { report: (event: AppDiagnosticEvent) => console.warn("[PhotoFlex]", event) } } : {}),
  };
}
