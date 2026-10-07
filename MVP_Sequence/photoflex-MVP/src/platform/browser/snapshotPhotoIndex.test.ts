import { afterEach, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, SourceId } from "../../contracts";
import { IndexedDbProjectStore } from "./IndexedDbProjectStore";
import { STORE_NAMES } from "./indexedDbSchema";

afterEach(() => vi.restoreAllMocks());
it("reads only source-index photos in the same backup transaction and preserves its durable revision", async () => {
  const databaseName = `source-snapshot-${crypto.randomUUID()}`, store = IndexedDbProjectStore.open({ databaseName });
  const id = "small-project" as ProjectId, sourceId = "small-source" as SourceId;
  const created = await store.createProject({ id, name: "Small", createdAt: "2026-10-07", initialSource: { id: sourceId, displayName: "Small", createdAt: "2026-10-07" } });
  if (!created.ok) throw Error("fixture failed");
  await store.saveWorkspace({ ...created.value, sources: [...created.value.sources, { id: "second-source" as SourceId, displayName: "Second", createdAt: "2026-10-07" }] }, created.value.revision);
  await store.readCloudSyncState(id, { revision: 0, pending: false });
  const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); });
  try {
    const tx = db.transaction(STORE_NAMES.photoIndex, "readwrite"), photos = tx.objectStore(STORE_NAMES.photoIndex);
    for (let index = 0; index < 1000; index++) photos.put({ id: `foreign-${index}` as PhotoId, sourceId: "other-source", relativePath: `${index}.jpg`, width: 100, height: 100 });
    photos.put({ id: "own-photo" as PhotoId, sourceId, relativePath: "own.jpg", width: 100, height: 100 });
    photos.put({ id: "a-second-photo" as PhotoId, sourceId: "second-source", relativePath: "second.jpg", width: 100, height: 100 });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === STORE_NAMES.photoIndex) throw Error("Account photo scan is forbidden for this snapshot");
      return getAll.apply(this, args);
    });
    const original = IDBIndex.prototype.getAll, reads: { name: string; key: unknown; transaction: IDBTransaction }[] = [];
    vi.spyOn(IDBIndex.prototype, "getAll").mockImplementation(function (this: IDBIndex, ...args) {
      if (this.objectStore.name === STORE_NAMES.photoIndex) reads.push({ name: this.name, key: args[0], transaction: this.objectStore.transaction });
      return original.apply(this, args);
    });
    const snapshot = await store.captureCloudSnapshot(id);
    expect(snapshot).toMatchObject({ ok: true, value: { sync: { localRevision: 0 }, document: { photoManifest: [{ photoId: "a-second-photo" }, { photoId: "own-photo" }] } } });
    expect(reads).toHaveLength(2); expect(reads[0].name).toBe("by-source-id"); expect(reads[0].key).toBe(sourceId);
    expect([...reads[0].transaction.objectStoreNames]).toContain(STORE_NAMES.cloudSync);
  } finally { db.close(); await store.close(); }
});
