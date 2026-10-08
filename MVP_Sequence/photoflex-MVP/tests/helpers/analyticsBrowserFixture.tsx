import { createRoot } from "react-dom/client";
import { App } from "../../src/app/App";
import { LocaleProvider } from "../../src/app/locale";
import { SequencePdfExportButton } from "../../src/app/SequencePdfExportButton";
import { BrowserPhotoSource } from "../../src/platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { createAnalytics, type AnalyticsEvent } from "../../src/platform/analytics/analytics";
import { instrumentPhotoSource, instrumentProjectStore } from "../../src/platform/analytics/instrumentDependencies";
import { createInitialSequenceBundle } from "../../src/modules/sequence";
import type { ProjectId } from "../../src/contracts";

export async function mountAnalyticsFixture() {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
  canvas.getContext("2d")!.fillRect(0, 0, 96, 64);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob(value => resolve(value!), "image/png"));
  const file = new File([blob], "private-original.png", { type: "image/png" });
  Object.defineProperty(file, "webkitRelativePath", { value: "private-folder/private-original.png" });
  const events = new Map<string, AnalyticsEvent>();
  let offline = false;
  const analytics = createAnalytics(async (batch) => { batch.forEach(event => events.set(event.event_id, event)); if (offline) throw new Error("offline"); return true; }, "test-version");
  analytics.setUser("test-account");
  const databaseName = `analytics-${crypto.randomUUID()}`;
  const store = instrumentProjectStore(IndexedDbProjectStore.open({ databaseName }), analytics);
  const source = instrumentPhotoSource(new BrowserPhotoSource({ databaseName, filePicker: async () => [file] }), analytics);
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div"); host.id = "analytics-fixture"; document.body.append(host);
  createRoot(host).render(<App dependencies={{ projectStore: store, photoSource: source, analytics }} />);
  return {
    async events() { await analytics.flush(); return [...events.values()]; },
    setOffline(value: boolean) { offline = value; },
    async saveAndMountPdf() {
      const list = await store.listProjects(); if (!list.ok || !list.value.length) throw new Error("missing project");
      const projectId = list.value[0].id as ProjectId;
      const loaded = await store.loadWorkspace(projectId); if (!loaded.ok) throw new Error("missing workspace");
      const photos = await source.listPhotos(loaded.value.sources[0].id); if (!photos.ok) throw new Error("missing photos");
      const bundle = createInitialSequenceBundle({ projectId, name: "private-sequence-name", content: { kind: "photos", photoIds: photos.value.items.map(photo => photo.id) } });
      const result = await store.createSequence(projectId, loaded.value.revision, bundle.sequence, bundle.initialVersion, loaded.value.worktableDraft);
      if (!result.ok) throw new Error("sequence not saved");
      const exportHost = document.createElement("div"); exportHost.id = "analytics-export"; exportHost.style.cssText = "position:fixed;top:0;right:0;z-index:1000;background:white;padding:20px"; document.body.append(exportHost);
      createRoot(exportHost).render(<LocaleProvider><SequencePdfExportButton sequence={bundle.sequence} photoSource={source} /></LocaleProvider>);
      // Restored scans must not report a second import.
      for await (const result of source.scan(loaded.value.sources[0].id)) if (!result.ok) throw new Error("rescan failed");
    },
  };
}
