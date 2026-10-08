import type { AccountSession, BackupError, LoadError, PhotoSource, ProjectCloud, ProjectId, ProjectStore, Result } from "../contracts";
import { BrowserPhotoSource } from "../platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../platform/browser/IndexedDbProjectStore";
import { createCloudBaseClient, readCloudBaseConfiguration } from "../platform/cloudbase/client";
import { CloudBaseAccountSession } from "../platform/cloudbase/CloudBaseAccountSession";
import { CloudBaseProjectCloud } from "../platform/cloudbase/CloudBaseProjectCloud";
import { CloudBackedProjectStore, type CloudSaveStatus } from "../platform/cloudbase/CloudBackedProjectStore";
import { onSharedScanCompleted } from "./ProjectSourceMonitor";
import { createAnalytics, type Analytics } from "../platform/analytics/analytics";
import { instrumentPhotoSource, instrumentProjectStore } from "../platform/analytics/instrumentDependencies";
import { cloudbaseAnalyticsApi } from "../platform/analytics/cloudbaseTransport";

export interface AppDiagnosticEvent {
  readonly name: "write-failure";
  readonly projectId: ProjectId;
  readonly scope: string;
  readonly workspaceRevision?: number;
  readonly sequenceRevision?: number;
  readonly errorKind: string;
}

export interface AppDependencies {
  readonly analytics?: Analytics;
  readonly analyticsAdmin?: { stats(from: string, to: string): Promise<unknown> };
  readonly projectStore: ProjectStore;
  readonly photoSource: PhotoSource;
  readonly accountSession?: AccountSession;
  readonly projectCloud?: ProjectCloud;
  readonly cloudSave?: {
    subscribe(listener: () => void): () => void;
    getStatus(projectId: ProjectId): CloudSaveStatus;
    getProjectListVersion?(): number;
    getProjectIssue?(projectId: ProjectId): LoadError | undefined;
    retryProject?(projectId: ProjectId): Promise<Result<void, LoadError>>;
    hasPending?(): boolean;
    getConflictProjectIds?(): readonly ProjectId[];
    saveConflictCopy?(projectId: ProjectId): Promise<Result<ProjectId, LoadError | BackupError>>;
    resolveConflict?(projectId: ProjectId): Promise<Result<ProjectId, LoadError | BackupError>>;
  };
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
  const analyticsUrl = import.meta.env.VITE_ANALYTICS_URL;
  const analyticsApi = cloudbase && analyticsUrl ? cloudbaseAnalyticsApi(analyticsUrl, cloudbase) : undefined;
  let analytics: ReturnType<typeof createAnalytics> | undefined;
  if (analyticsApi) {
    try {
      let storage: Storage | undefined;
      try { storage = window.localStorage; } catch { /* Storage is optional for telemetry. */ }
      analytics = createAnalytics(analyticsApi.deliver, __SITE_VERSION__, storage);
    } catch { /* Analytics initialization cannot block opening the application. */ }
  }
  if (analytics) {
    window.addEventListener("pagehide", () => { void analytics.flush(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void analytics.flush(); });
  }
  const accountSession = cloudbase ? new CloudBaseAccountSession(cloudbase, analytics) : undefined;
  const projectCloud = cloudbase ? new CloudBaseProjectCloud(cloudbase, accountSession!) : undefined;
  return {
    projectStore: instrumentProjectStore(local.projectStore, analytics),
    photoSource: instrumentPhotoSource(local.photoSource, analytics),
    analytics,
    analyticsAdmin: analyticsApi,
    ...(accountSession && projectCloud ? {
      accountSession,
      projectCloud,
      accountWorkspaces: {
        open(userId: string): AccountWorkspace {
          const scoped = createLocalWorkspace(databaseNameForAccount(userId));
          const synced = new CloudBackedProjectStore(scoped.projectStore as IndexedDbProjectStore, projectCloud, window.localStorage, `photoflex:cloud-auto:${configuration!.envId}:${userId}`);
          const photoSource = instrumentPhotoSource(scoped.photoSource, analytics);
          const unsubscribeScan = onSharedScanCompleted(photoSource, (sourceId) => { void synced.photoIndexChanged(sourceId); });
          return {
            dependencies: {
              projectStore: instrumentProjectStore(synced, analytics),
              photoSource,
              analytics,
              analyticsAdmin: analyticsApi,
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
