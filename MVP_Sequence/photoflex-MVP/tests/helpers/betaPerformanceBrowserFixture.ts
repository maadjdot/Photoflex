import { err, ok, type CloudProjectSnapshot, type ProjectCloud, type ProjectId, type SourceId, type LayoutId, type LayoutObjectId, type LayoutPageId, type SequenceId, type SequenceItemId, type ReadingUnitId, type SequenceRevision, type VersionId, type SequenceDocument, type SequenceVersion } from "../../src/contracts";
import { createEmptyLayout } from "../../src/modules/layout/layoutDocument";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { STORE_NAMES } from "../../src/platform/browser/indexedDbSchema";
import { CloudBackedProjectStore } from "../../src/platform/cloudbase/CloudBackedProjectStore";
import { createProjectWriteCoordinator } from "../../src/app/projectWriteCoordinator";
import { MemoryPhotoSource } from "../../src/platform/memory/MemoryPhotoSource";
import { BrowserPhotoSource } from "../../src/platform/browser/BrowserPhotoSource";
import { createEmptyWorktable, createWorktableEditor } from "../../src/modules/worktable";

export async function seedPerformanceWorkspace() {
  const projectId = "performance-project" as ProjectId, sequenceId = "performance-sequence" as SequenceId, layoutId = "performance-layout" as LayoutId;
  const store = IndexedDbProjectStore.open(), createdAt = "2026-10-07", versionId = "performance-version" as VersionId;
  try {
    const workspace = await store.createProject({ id: projectId, name: "Performance", createdAt }); if (!workspace.ok) throw Error("project fixture failed");
    const itemId = "performance-blank" as SequenceItemId;
    const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Performance", items: [{ id: itemId, kind: "blank" }], segments: [],
      readingUnits: [{ id: "performance-unit" as ReadingUnitId, kind: "blank", itemId }], currentVersionId: versionId, revision: 0 as SequenceRevision, createdAt, updatedAt: createdAt };
    const version: SequenceVersion = { ...sequence, id: versionId, sequenceId, itemCount: 1 };
    const saved = await store.createSequence(projectId, workspace.value.revision, sequence, version, workspace.value.worktableDraft); if (!saved.ok) throw Error("sequence fixture failed");
    const base = createEmptyLayout({ id: layoutId, projectId, sequenceId, pageId: "performance-page" as LayoutPageId, name: "Performance", createdAt });
    const layout = { ...base, pages: [{ ...base.pages[0], objects: [{ kind: "text-box" as const, id: "performance-text" as LayoutObjectId,
      rect: { x: 30, y: 30, width: 300, height: 80 }, text: "Cold cache caption", style: { fontFamily: "courier-prime" as const, fontSizePt: 16, lineHeight: 1.2, color: "#171513", align: "left" as const } }] }] };
    if (!(await store.createLayout(projectId, saved.value.revision, layout)).ok) throw Error("Layout fixture failed");
    return { projectId, sequenceId, layoutId };
  } finally { await store.close(); }
}

export async function measureSmallProjectSync() {
  const databaseName = "indexeddb-performance-" + crypto.randomUUID(), local = IndexedDbProjectStore.open({ databaseName });
  const id = "small-benchmark-project" as ProjectId, sourceId = "small-source" as SourceId;
  let row: CloudProjectSnapshot | undefined, uploads = 0;
  const cloud: ProjectCloud = {
    list: async () => ok([]), pull: async () => row ? ok(row) : err({ kind: "not-found", projectId: id }),
    push: async (input) => {
      uploads++;
      row = { ...input, document: structuredClone(input.document), cloudRevision: (row?.cloudRevision ?? -1) + 1, updatedAt: "2026-10-07" };
      return ok(row);
    }, delete: async () => ok(undefined),
  };
  const store = new CloudBackedProjectStore(local, cloud, localStorage, databaseName);
  await store.createProject({ id, name: "Small", createdAt: "2026-10-07", initialSource: { id: sourceId, displayName: "Small", createdAt: "2026-10-07" } });
  const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); });
  const counts = [0, 25_000], samples: { accountPhotos: number; captureMs: number[]; bytes: number; manifestPhotos: number }[] = [];
  try {
    for (const foreign of counts) {
      const tx = db.transaction(STORE_NAMES.photoIndex, "readwrite"), photos = tx.objectStore(STORE_NAMES.photoIndex);
      for (let index = 0; index < 30 + foreign; index++) photos.put({ id: `benchmark-photo-${index}`, sourceId: index < 30 ? sourceId : "foreign-source",
        relativePath: `${index}.jpg`, width: 4000, height: 3000 });
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
      const captureMs: number[] = []; let bytes = 0, manifestPhotos = 0;
      for (let sample = 0; sample < 7; sample++) {
        const start = performance.now(), backup = await local.exportBackup(id); if (!backup.ok) throw Error("snapshot failed");
        captureMs.push(performance.now() - start); bytes = backup.value.byteLength;
        manifestPhotos = JSON.parse(new TextDecoder().decode(backup.value)).photoManifest.length;
      }
      samples.push({ accountPhotos: 30 + foreign, captureMs, bytes, manifestPhotos });
    }
    await store.flushPending(); uploads = 0;
    const coordinator = createProjectWriteCoordinator({ projectStore: store, photoSource: new MemoryPhotoSource() }, id); await coordinator.load();
    const initial = coordinator.getSnapshot().workspace!;
    const started = performance.now();
    const edits = await Promise.all(Array.from({ length: 100 }, (_, index) => coordinator.saveWorktable({ ...initial.worktableDraft,
      memos: [{ id: "burst", text: String(index), x: 0, y: 0, z: 1, width: 200, height: 100, fontSize: 16, photoIds: [] }] })));
    if (edits.some((result) => !result.ok)) throw Error("burst failed");
    await coordinator.flushAll(); const flushed = await store.flushPending();
    const saved = await local.loadWorkspace(id); coordinator.dispose();
    return { samples, edits: 100, uploads, burstMs: performance.now() - started, flushed,
      finalText: saved.ok && saved.value.worktableDraft.memos?.[0].text, metric: store.getLastUploadMetric(id) };
  } finally { db.close(); store.dispose(); await local.close(); }
}

export async function measurePreviewSession() {
  const canvas = document.createElement("canvas"); canvas.width = 2560; canvas.height = 1600;
  const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
  let random = 7;
  for (let index = 0; index < pixels.data.length; index += 4) {
    random = (random * 1664525 + 1013904223) >>> 0;
    pixels.data[index] = random & 255; pixels.data[index + 1] = (random >>> 8) & 255; pixels.data[index + 2] = (random >>> 16) & 255; pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const jpeg = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg", .95)); canvas.width = canvas.height = 0;
  const file = new File([jpeg], "large.jpg", { type: "image/jpeg" }); Object.defineProperty(file, "webkitRelativePath", { value: "Large/large.jpg" });
  const source = new BrowserPhotoSource({ databaseName: "preview-session-" + crypto.randomUUID(), filePicker: async () => [file] });
  const grant = await source.chooseFolder([]); if (!grant.ok) throw Error("folder unavailable");
  for await (const result of source.scan(grant.value.sourceId)) if (!result.ok) throw Error("scan failed");
  const photos = await source.listPhotos(grant.value.sourceId); if (!photos.ok) throw Error("photo unavailable");
  const photo = photos.value.items[0], sourceCache = source as unknown as { urlCache: Map<string, { blob: Blob; references: number }> };
  let maximumRetainedBytes = 0, sampledJsHeapMaximum = 0;
  const image = document.createElement("img"); image.style.cssText = "position:fixed;inset:50px;max-width:80vw;max-height:80vh;z-index:500"; document.body.append(image);
  const started = performance.now();
  for (let visit = 0; visit < 30; visit++) {
    const preview = await source.preview(photo.id); if (!preview.ok) throw Error("preview failed");
    image.src = preview.value.url; await image.decode();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    maximumRetainedBytes = Math.max(maximumRetainedBytes, [...sourceCache.urlCache.values()].reduce((sum, entry) => sum + entry.blob.size, 0));
    sampledJsHeapMaximum = Math.max(sampledJsHeapMaximum, (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    preview.value.release(); image.removeAttribute("src");
  }
  image.remove();
  const originalUrlsAfterRelease = [...sourceCache.urlCache.keys()].filter((key) => key.startsWith("preview:")).length;
  const editor = createWorktableEditor(createEmptyWorktable("history-benchmark" as ProjectId));
  editor.execute({ type: "place", items: [{ photoId: photo.id, width: photo.width, height: photo.height, filename: file.name }] });
  for (let index = 0; index < 500; index++) editor.execute({ type: "move", photoIds: [photo.id], by: { x: 1, y: 0 } });
  let undoSteps = 0; while (editor.canUndo()) { editor.undo(); undoSteps++; }
  while (editor.canRedo()) editor.redo();
  const durationMs = performance.now() - started;
  await source.close();
  return { jpegBytes: jpeg.size, visits: 30, maximumRetainedBytes, sampledJsHeapMaximum, originalUrlsAfterRelease, urlsAfterClose: sourceCache.urlCache.size, undoSteps, edits: 500, durationMs };
}
