import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceId } from "../../contracts";
import { BrowserPhotoSource } from "./BrowserPhotoSource";
import { IndexedDbProjectStore } from "./IndexedDbProjectStore";
import { backupBytes } from "../../../tests/helpers/projectBackup";

const databases: BrowserPhotoSource[] = [];

afterEach(async () => {
  for (const source of databases.splice(0)) {
    await source.close();
  }
  vi.unstubAllGlobals();
});

interface TestDirectory {
  readonly handle: FileSystemDirectoryHandle;
  readonly files: Map<string, File>;
  fileHandle(name: string): FileSystemFileHandle;
  getFileReadCount(): number;
  setPermission(permission: PermissionState): void;
}

function createDirectory(identity: string, displayName: string, names: readonly string[]): TestDirectory {
  const files = new Map(names.map((name) => [name, new File([name], name, { type: "image/jpeg" })]));
  let permission: PermissionState = "granted";
  let fileReadCount = 0;
  const makeFileHandle = (name: string): FileSystemFileHandle => ({
    kind: "file",
    name,
    identity: `${identity}/${name}`,
    async isSameEntry(other: FileSystemHandle) {
      return (other as FileSystemHandle & { identity?: string }).identity === `${identity}/${name}`;
    },
    getFile: async () => {
      fileReadCount += 1;
      const file = files.get(name);
      if (!file) throw new DOMException("File not found", "NotFoundError");
      return file;
    },
  } as unknown as FileSystemFileHandle);
  const directory = {
    kind: "directory" as const,
    name: displayName,
    identity,
    async isSameEntry(other: FileSystemHandle) {
      return (other as FileSystemHandle & { identity?: string }).identity === identity;
    },
    async queryPermission() {
      return permission;
    },
    async requestPermission() {
      permission = "granted";
      return permission;
    },
    async *entries() {
      for (const name of files.keys()) yield [name, makeFileHandle(name)] as [string, FileSystemFileHandle];
    },
    async resolve(candidate: FileSystemHandle) {
      const candidateIdentity = (candidate as FileSystemHandle & { identity?: string }).identity;
      const prefix = `${identity}/`;
      return candidateIdentity?.startsWith(prefix) ? [candidateIdentity.slice(prefix.length)] : null;
    },
    async getDirectoryHandle() {
      throw new DOMException("Directory not found", "NotFoundError");
    },
    async getFileHandle(name: string) {
      fileReadCount += 1;
      if (!files.has(name)) throw new DOMException("File not found", "NotFoundError");
      return makeFileHandle(name);
    },
  };
  return {
    files,
    handle: directory as unknown as FileSystemDirectoryHandle,
    fileHandle: makeFileHandle,
    getFileReadCount: () => fileReadCount,
    setPermission(next) {
      permission = next;
    },
  };
}

async function scanToEnd(source: BrowserPhotoSource, sourceId: SourceId) {
  const events = [];
  for await (const result of source.scan(sourceId)) events.push(result);
  return events;
}

function selectedFile(relativePath: string): File {
  const name = relativePath.split("/").at(-1)!;
  const file = new File([name], name, { type: "image/jpeg" });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

describe("BrowserPhotoSource", () => {
  it("prefers the native directory picker when the browser provides it", async () => {
    const directory = createDirectory("native", "Native Photos", ["one.jpg"]);
    const nativePicker = vi.fn(async () => directory.handle);
    vi.stubGlobal("showDirectoryPicker", nativePicker);
    const source = new BrowserPhotoSource({ databaseName: `native-picker-${crypto.randomUUID()}` });
    databases.push(source);
    expect(await source.chooseFolder([])).toMatchObject({ ok: true, value: { displayName: "Native Photos" } });
    expect(nativePicker).toHaveBeenCalledOnce();
  });
  it("imports an external JPEG once and reuses its source photo on a later drop", async () => {
    const sourceId = "external-source" as SourceId;
    const identity = "external-file-a";
    const handle = {
      kind: "file" as const,
      name: "outside.jpg",
      identity,
      async isSameEntry(other: FileSystemHandle) { return (other as FileSystemHandle & { identity?: string }).identity === identity; },
      async queryPermission() { return "granted" as PermissionState; },
      async getFile() { return new File(["jpeg"], "outside.jpg", { type: "image/jpeg", lastModified: 12 }); },
    } as unknown as FileSystemFileHandle;
    const source = new BrowserPhotoSource({ databaseName: `external-${crypto.randomUUID()}` });
    databases.push(source);

    const first = await source.ingestDroppedFiles([handle], [], sourceId);
    const second = await source.ingestDroppedFiles([handle], [], sourceId);

    expect(first.ok && first.value.items[0].status).toBe("created");
    expect(second.ok && second.value.items[0].status).toBe("reused");
    expect(first.ok && second.ok && first.value.items[0].photo.id).toBe(second.ok ? second.value.items[0].photo.id : undefined);
    expect(first.ok && first.value.items[0].photo).toMatchObject({ sourceId, locationKind: "file-handle" });
  });

  it("rebinds a reused external photo to the newly dropped authorized handle", async () => {
    const sourceId = "external-source" as SourceId;
    let oldPermission: PermissionState = "granted";
    const makeHandle = (permission: () => PermissionState) => ({
      kind: "file" as const,
      name: "recover.jpg",
      identity: "recover-original",
      async isSameEntry(other: FileSystemHandle) {
        return (other as FileSystemHandle & { identity?: string }).identity === "recover-original";
      },
      async queryPermission() { return permission(); },
      async getFile() { return new File(["jpeg"], "recover.jpg", { type: "image/jpeg" }); },
    } as unknown as FileSystemFileHandle);
    const source = new BrowserPhotoSource({ databaseName: `external-rebind-${crypto.randomUUID()}` });
    databases.push(source);
    const first = await source.ingestDroppedFiles([makeHandle(() => oldPermission)], [], sourceId);
    if (!first.ok) throw Error("first import failed");
    oldPermission = "denied";
    expect(await source.preview(first.value.items[0].photo.id)).toMatchObject({ ok: false, error: { kind: "permission-lost" } });

    const rebound = await source.ingestDroppedFiles([makeHandle(() => "granted")], [], sourceId);

    expect(rebound).toMatchObject({ ok: true, value: { items: [{ status: "reused", photo: { id: first.value.items[0].photo.id } }] } });
    expect((await source.preview(first.value.items[0].photo.id)).ok).toBe(true);
  });

  it("reuses a photo already indexed under an authorized folder source", async () => {
    const directory = createDirectory("folder-drop", "Folder", ["inside.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `folder-drop-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);
    const grant = await source.chooseFolder([]);
    if (!grant.ok) throw Error("folder grant failed");
    await scanToEnd(source, grant.value.sourceId);
    const indexed = await source.listPhotos(grant.value.sourceId);
    if (!indexed.ok) throw Error("folder index failed");

    const dropped = await source.ingestDroppedFiles(
      [directory.fileHandle("inside.jpg")],
      [{ id: grant.value.sourceId, displayName: "Folder", createdAt: new Date(0).toISOString(), kind: "folder" }],
      "external-source" as SourceId,
    );

    expect(dropped.ok && dropped.value.items[0]).toMatchObject({
      status: "reused",
      photo: { id: indexed.value.items[0].id, sourceId: grant.value.sourceId, relativePath: "inside.jpg" },
    });
  });

  it("reconnects an imported folder without changing restored photo IDs and rejects an unrelated folder", async () => {
    const databaseName = `restore-folder-${crypto.randomUUID()}`;
    const store = IndexedDbProjectStore.open({ databaseName });
    const imported = await store.importBackup(backupBytes());
    if (!imported.ok) throw Error(JSON.stringify(imported));
    const workspace = await store.loadWorkspace(imported.value);
    if (!workspace.ok) throw Error("project missing");
    const sourceId = workspace.value.sources[0].id;
    const photoId = workspace.value.worktableDraft.entryOrder.map((id) => workspace.value.worktableDraft.placements[id].photoId)[0];
    let directory = createDirectory("wrong", "Unrelated", ["other.jpg"]);
    const source = new BrowserPhotoSource({ databaseName, picker: async () => directory.handle });
    databases.push(source);
    expect(await source.getSourceState(sourceId)).toMatchObject({ ok: true, value: { status: "offline", indexedCount: 2 } });
    expect((await source.preview(photoId)).ok).toBe(false);
    expect(await source.restoreFolder(sourceId)).toMatchObject({ ok: false, error: { kind: "folder-mismatch" } });
    directory = createDirectory("right", "Photos", ["one.jpg", "two.jpg"]);
    expect(await source.restoreFolder(sourceId)).toMatchObject({ ok: true, value: { sourceId } });
    await scanToEnd(source, sourceId);
    const page = await source.listPhotos(sourceId);
    expect(page.ok && page.value.items.map((p) => p.id)).toEqual(
      workspace.value.worktableDraft.entryOrder.map((id) => workspace.value.worktableDraft.placements[id].photoId),
    );
    expect(page.ok && page.value.items.map((p) => p.relativePath)).toEqual(["one.jpg", "two.jpg"]);
    const preview = await source.preview(photoId);
    expect(preview.ok).toBe(true);
    if (preview.ok) preview.value.release();
    await store.close();
  });
  it("uses selected directory files when native directory access is unavailable", async () => {
    const databaseName = `webkit-folder-${crypto.randomUUID()}`;
    const store = IndexedDbProjectStore.open({ databaseName });
    const imported = await store.importBackup(backupBytes());
    if (!imported.ok) throw Error(JSON.stringify(imported));
    const workspace = await store.loadWorkspace(imported.value);
    if (!workspace.ok) throw Error("project missing");
    const sourceId = workspace.value.sources[0].id;
    const expectedPhotoIds = workspace.value.worktableDraft.entryOrder.map((id) => workspace.value.worktableDraft.placements[id].photoId);
    let files = [selectedFile("Wrong/other.jpg")];
    const first = new BrowserPhotoSource({ databaseName, filePicker: async () => files });
    databases.push(first);
    expect(await first.restoreFolder(sourceId)).toMatchObject({ ok: false, error: { kind: "folder-mismatch" } });
    files = [selectedFile("Photos/one.jpg"), selectedFile("Photos/two.jpg")];
    expect(await first.restoreFolder(sourceId)).toMatchObject({ ok: true, value: { displayName: "Photos" } });
    await scanToEnd(first, sourceId);
    const page = await first.listPhotos(sourceId);
    expect(page.ok && page.value.items.map((photo) => photo.id)).toEqual(expectedPhotoIds);
    const preview = await first.preview(expectedPhotoIds[0]);
    expect(preview.ok).toBe(true);
    if (preview.ok) preview.value.release();

    await first.close();
    const reopened = new BrowserPhotoSource({ databaseName, filePicker: async () => files });
    databases.push(reopened);
    expect(await reopened.getSourceState(sourceId)).toMatchObject({ ok: true, value: { status: "offline", indexedCount: 2 } });
    expect((await reopened.preview(expectedPhotoIds[0])).ok).toBe(false);
    expect((await reopened.restoreFolder(sourceId)).ok).toBe(true);
    expect((await reopened.preview(expectedPhotoIds[0])).ok).toBe(true);
    await store.close();
  });
  it("scans nested paths from a directory file selection", async () => {
    const source = new BrowserPhotoSource({
      databaseName: `webkit-nested-${crypto.randomUUID()}`,
      filePicker: async () => [selectedFile("Photos/Nested/image.jpg")],
    });
    databases.push(source);
    const grant = await source.chooseFolder([]);
    if (!grant.ok) throw Error(JSON.stringify(grant));
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok && page.value.items.map((photo) => photo.relativePath)).toEqual(["Nested/image.jpg"]);
    if (page.ok) {
      const preview = await source.preview(page.value.items[0].id);
      expect(preview.ok).toBe(true);
      if (preview.ok) preview.value.release();
    }
  });
  it("按相对路径稳定排列分页照片", async () => {
    const directory = createDirectory("ordered", "Ordered", ["Z.JPG", "A.JPG", "M.JPG"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);

    const firstPage = await source.listPhotos(grant.value.sourceId, "0", 2);
    expect(firstPage.ok && firstPage.value.items.map((photo) => photo.relativePath)).toEqual(["A.JPG", "M.JPG"]);
    expect(firstPage.ok && firstPage.value.nextCursor).toBe("M.JPG");
    if (!firstPage.ok || !firstPage.value.nextCursor) return;

    const secondPage = await source.listPhotos(grant.value.sourceId, firstPage.value.nextCursor, 2);
    expect(secondPage.ok && secondPage.value.items.map((photo) => photo.relativePath)).toEqual(["Z.JPG"]);
    expect(secondPage.ok && secondPage.value.nextCursor).toBeNull();
  });

  it("移除 Source 时一并清除授权与派生照片索引", async () => {
    const directory = createDirectory("removed", "Removed", ["one.jpg", "two.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;

    const removed = await source.removeSource(grant.value.sourceId);
    expect(removed).toEqual({ ok: true, value: { photoIds: page.value.items.map((photo) => photo.id) } });
    expect(await source.getSourceState(grant.value.sourceId)).toEqual({
      ok: false,
      error: { kind: "source-not-found", sourceId: grant.value.sourceId },
    });
    expect(await source.listPhotos(grant.value.sourceId)).toMatchObject({ ok: true, value: { items: [] } });
    expect(await source.removeSource(grant.value.sourceId)).toEqual({ ok: true, value: { photoIds: [] } });
  });

  it("扫描 JPEG、复用同一目录，并隔离不同目录的同名文件", async () => {
    const firstDirectory = createDirectory("first", "First", ["A.JPG", "notes.txt"]);
    const secondDirectory = createDirectory("second", "Second", ["A.JPG"]);
    let picked = firstDirectory.handle;
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => picked,
    });
    databases.push(source);

    const firstGrant = await source.chooseFolder([]);
    expect(firstGrant.ok && firstGrant.value.restored).toBe(false);
    if (!firstGrant.ok) return;
    const firstId = firstGrant.value.sourceId;

    await scanToEnd(source, firstId);
    const firstPage = await source.listPhotos(firstId);
    expect(firstPage.ok && firstPage.value.items).toHaveLength(1);

    const duplicate = await source.chooseFolder([firstId]);
    expect(duplicate.ok && duplicate.value.sourceId).toBe(firstId);

    picked = secondDirectory.handle;
    const secondGrant = await source.chooseFolder([firstId]);
    expect(secondGrant.ok).toBe(true);
    if (!secondGrant.ok) return;
    expect(secondGrant.value.sourceId).not.toBe(firstId);
    await scanToEnd(source, secondGrant.value.sourceId);
    const secondPage = await source.listPhotos(secondGrant.value.sourceId);
    expect(secondPage.ok && secondPage.value.items).toHaveLength(1);
    if (!firstPage.ok || !secondPage.ok) return;
    expect(firstPage.value.items[0].id).not.toBe(secondPage.value.items[0].id);
  });

  it("listPhotos 只读索引，文件移动由 thumbnail 返回 photo-not-found", async () => {
    const directory = createDirectory("moving", "Moving", ["move.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const indexed = await source.listPhotos(grant.value.sourceId);
    expect(indexed.ok && indexed.value.items).toHaveLength(1);
    if (!indexed.ok) return;
    directory.files.delete("move.jpg");

    const fileReadsBeforeList = directory.getFileReadCount();
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.items).toHaveLength(1);
    expect(page.value.issues).toEqual([]);
    expect(directory.getFileReadCount()).toBe(fileReadsBeforeList);
    expect(await source.thumbnail(page.value.items[0].id)).toEqual({
      ok: false,
      error: { kind: "photo-not-found", photoId: page.value.items[0].id },
    });
  });

  it("重扫后按源文件版本隔离旧缩略图缓存", async () => {
    const directory = createDirectory("versioned-thumbnail", "Versioned thumbnail", ["same.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;

    const first = await source.thumbnail(page.value.items[0].id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstText = await (await fetch(first.value.url)).text();
    directory.files.set("same.jpg", new File(["updated"], "same.jpg", { type: "image/jpeg", lastModified: 2 }));
    await scanToEnd(source, grant.value.sourceId);
    const second = await source.thumbnail(page.value.items[0].id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondText = await (await fetch(second.value.url)).text();
    expect(firstText).not.toBe(secondText);
    expect(second.value.url).not.toBe(first.value.url);
    first.value.release();
    second.value.release();
  });

  it("刷新后需要重新授权时不会把仍存在的照片误报为 missing-file", async () => {
    const directory = createDirectory("refresh", "Refresh", ["still-here.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);

    directory.setPermission("prompt");
    const state = await source.getSourceState(grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);

    expect(state.ok && state.value.status).toBe("permission-lost");
    expect(page.ok && page.value.issues).toEqual([]);

    const restored = await source.restoreFolder(grant.value.sourceId);
    expect(restored.ok).toBe(true);
  });

  it("deduplicates concurrent thumbnail generation for the same photo", async () => {
    const directory = createDirectory("thumbnail-dedupe", "Thumbnail dedupe", ["same.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const readsBefore = directory.getFileReadCount();

    const results = await Promise.all([
      source.thumbnail(page.value.items[0].id),
      source.thumbnail(page.value.items[0].id),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(directory.getFileReadCount() - readsBefore).toBe(2);
    results.forEach((result) => { if (result.ok) result.value.release(); });
  });

  it("deduplicates and caches size-tiered derived previews", async () => {
    const directory = createDirectory("sequence-preview", "Sequence preview", ["same.jpg"]);
    const source = new BrowserPhotoSource({
      databaseName: `photoflex-source-${crypto.randomUUID()}`,
      picker: async () => directory.handle,
    });
    databases.push(source);
    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const readsBefore = directory.getFileReadCount();
    const results = await Promise.all([
      source.derivedPreview(page.value.items[0].id, 1536),
      source.derivedPreview(page.value.items[0].id, 1536),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(directory.getFileReadCount() - readsBefore).toBe(2);
    if (results[0].ok && results[1].ok) expect(results[0].value.url).toBe(results[1].value.url);
    results.forEach((result) => { if (result.ok) result.value.release(); });
    const cached = await source.derivedPreview(page.value.items[0].id, 1536);
    expect(cached.ok).toBe(true);
    expect(directory.getFileReadCount() - readsBefore).toBe(2);
    if (cached.ok) cached.value.release();
  });

  it("persists derived previews beyond the in-memory cache", async () => {
    const directory = createDirectory("persistent-preview", "Persistent preview", ["same.jpg"]);
    const databaseName = `photoflex-source-${crypto.randomUUID()}`;
    const source = new BrowserPhotoSource({ databaseName, picker: async () => directory.handle });
    databases.push(source);

    const grant = await source.chooseFolder([]);
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;

    const first = await source.derivedPreview(page.value.items[0].id, 768);
    expect(first.ok).toBe(true);
    if (first.ok) first.value.release();
    const readsAfterGeneration = directory.getFileReadCount();
    (source as unknown as { derivedPreviewCache: Map<string, unknown> }).derivedPreviewCache.clear();
    const cached = await source.derivedPreview(page.value.items[0].id, 768);
    expect(cached.ok).toBe(true);
    expect(directory.getFileReadCount()).toBe(readsAfterGeneration);
    if (cached.ok) cached.value.release();
  });
});
