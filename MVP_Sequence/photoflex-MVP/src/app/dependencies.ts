import type { PhotoSource, ProjectId, ProjectStore } from "../contracts";
import { BrowserPhotoSource } from "../platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../platform/browser/IndexedDbProjectStore";

export interface AppDiagnosticEvent {
  readonly name: "write-failure";
  readonly projectId: ProjectId;
  readonly scope: string;
  readonly workspaceRevision?: number;
  readonly sequenceRevision?: number;
  readonly errorKind: string;
}

/** Browser-only dependencies. Projects and photo indexes stay on this device. */
export interface AppDependencies {
  readonly projectStore: ProjectStore;
  readonly photoSource: PhotoSource;
  readonly diagnostics?: { report(event: AppDiagnosticEvent): void };
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
  const local = createLocalWorkspace();
  return {
    projectStore: local.projectStore,
    photoSource: local.photoSource,
    ...(import.meta.env.DEV ? { diagnostics: { report: (event: AppDiagnosticEvent) => console.warn("[PhotoFlex]", event) } } : {}),
  };
}
