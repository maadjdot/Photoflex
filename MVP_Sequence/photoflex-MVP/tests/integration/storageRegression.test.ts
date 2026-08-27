import { describe, expect, it } from "vitest";
import { INDEXED_DB_SCHEMA_VERSION, type VersionId } from "../../src/contracts";
import { BrowserPhotoSource } from "../../src/platform/browser/BrowserPhotoSource";
import { openPhotoFlexDatabase } from "../../src/platform/browser/indexedDbSchema";
import { createWorkspace, isWorkspace } from "../../src/platform/projectStoreData";
import { MemoryProjectStore, createMemoryProjectDatabase } from "../../src/platform/memory/MemoryProjectStore";
import { PROJECT_ID, PROJECT_INPUT } from "../helpers/fixtures";

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

describe("存储回归行为", () => {
  it("版本 ID 缺失时返回 corrupt-data，而不是抛出或 unavailable", async () => {
    const database = createMemoryProjectDatabase();
    const store = new MemoryProjectStore(database);
    const created = await store.createProject(PROJECT_INPUT);
    if (!created.ok) throw new Error("测试项目未创建");

    database.projects.set(PROJECT_ID, {
      ...created.value,
      versionIds: ["missing-version" as VersionId],
    });

    expect(await store.listVersions(PROJECT_ID)).toEqual({
      ok: false,
      error: { kind: "corrupt-data", entityId: "missing-version" },
    });
  });

  it("新授权与 session 内恢复使用不同的 restored 语义", async () => {
    let handle!: FileSystemDirectoryHandle;
    const rawHandle = {
      name: "Photos",
      isSameEntry: async (other: FileSystemDirectoryHandle) => other === handle,
    } as unknown as FileSystemDirectoryHandle;
    handle = rawHandle;
    const source = new BrowserPhotoSource({ picker: async () => handle });

    const chosen = await source.chooseFolder([]);
    if (!chosen.ok) throw new Error("文件夹未授权");
    expect(chosen.value.restored).toBe(false);

    const restored = await source.restoreFolder(chosen.value.sourceId);
    expect(restored.ok && restored.value.restored).toBe(true);
  });

  it("workspace 结构校验会拒绝无效 source 与 sequence item", () => {
    const workspace = createWorkspace(PROJECT_INPUT);
    expect(isWorkspace(workspace)).toBe(true);
    expect(
      isWorkspace({
        ...workspace,
        sources: [{ id: "source", displayName: "Photos", status: "invalid" }],
      }),
    ).toBe(false);
    expect(
      isWorkspace({
        ...workspace,
        sequenceDraft: { ...workspace.sequenceDraft, items: [{ id: "item" }] },
      }),
    ).toBe(false);
  });

  it("打开已有高版本数据库时报告实际版本号", async () => {
    const databaseName = `photoflex-version-${crypto.randomUUID()}`;
    const created = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 5);
      request.onupgradeneeded = () => request.result.createObjectStore("legacy");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    created.close();

    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened).toEqual({
      ok: false,
      error: { kind: "unsupported-storage-schema", found: 5, supported: [INDEXED_DB_SCHEMA_VERSION] },
    });
    await deleteDatabase(databaseName);
  });
});
