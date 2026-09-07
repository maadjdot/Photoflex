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

export interface AppDependencies {
  readonly projectStore: ProjectStore;
  readonly photoSource: PhotoSource;
  readonly diagnostics?: { report(event: AppDiagnosticEvent): void };
}

export function createBrowserDependencies(): AppDependencies {
  return {
    projectStore: IndexedDbProjectStore.open(),
    photoSource: new BrowserPhotoSource(),
    ...(import.meta.env.DEV ? { diagnostics: { report: (event: AppDiagnosticEvent) => console.warn("[PhotoFlex]", event) } } : {}),
  };
}
