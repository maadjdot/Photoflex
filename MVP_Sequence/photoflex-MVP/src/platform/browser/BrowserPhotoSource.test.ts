import { afterEach, describe, expect, it } from "vitest";
import type { SourceId } from "../../contracts";
import { BrowserPhotoSource } from "./BrowserPhotoSource";

const databases: BrowserPhotoSource[] = [];

afterEach(async () => {
  for (const source of databases.splice(0)) {
    await source.close();
  }
});

interface TestDirectory {
  readonly handle: FileSystemDirectoryHandle;
  readonly files: Map<string, File>;
  setPermission(permission: PermissionState): void;
}

function createDirectory(identity: string, displayName: string, names: readonly string[]): TestDirectory {
  const files = new Map(names.map((name) => [name, new File([name], name, { type: "image/jpeg" })]));
  let permission: PermissionState = "granted";
  const makeFileHandle = (name: string): FileSystemFileHandle => ({
    kind: "file",
    name,
    getFile: async () => {
      const file = files.get(name);
      if (!file) throw new DOMException("File not found", "NotFoundError");
      return file;
    },
  } as FileSystemFileHandle);
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
    async getDirectoryHandle() {
      throw new DOMException("Directory not found", "NotFoundError");
    },
    async getFileHandle(name: string) {
      if (!files.has(name)) throw new DOMException("File not found", "NotFoundError");
      return makeFileHandle(name);
    },
  };
  return {
    files,
    handle: directory as unknown as FileSystemDirectoryHandle,
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

describe("BrowserPhotoSource", () => {
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

  it("文件移动后保留 PhotoRef 并返回 missing-file", async () => {
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
    directory.files.delete("move.jpg");

    await scanToEnd(source, grant.value.sourceId);
    const page = await source.listPhotos(grant.value.sourceId);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.items).toHaveLength(1);
    expect(page.value.issues).toEqual([
      {
        kind: "missing-file",
        photoId: page.value.items[0].id,
        relativePath: "move.jpg",
      },
    ]);
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
});
