import type { PhotoSource, ProjectStore } from "../contracts";
import { BrowserPhotoSource } from "../platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../platform/browser/IndexedDbProjectStore";

export interface AppDependencies {
  readonly projectStore: ProjectStore;
  readonly photoSource: PhotoSource;
}

export function createBrowserDependencies(): AppDependencies {
  return {
    projectStore: IndexedDbProjectStore.open(),
    photoSource: new BrowserPhotoSource(),
  };
}
