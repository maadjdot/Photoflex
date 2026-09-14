import { describe, expect, it } from "vitest";
import {
  migrateToV1,
  migrateToV2,
  migrateToV3,
  migrateToV6,
  migrateToV8,
  openPhotoFlexDatabase,
  STORE_NAMES,
} from "../../src/platform/browser/indexedDbSchema";

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionResult = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

describe("IndexedDB schema 0 → 1", () => {
  it("创建架构要求的四个 object store", async () => {
    const databaseName = `photoflex-migration-${crypto.randomUUID()}`;
    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    expect([...opened.value.objectStoreNames]).toEqual(Object.values(STORE_NAMES).sort());
    const transaction = opened.value.transaction(STORE_NAMES.versions, "readonly");
    expect([...transaction.objectStore(STORE_NAMES.versions).indexNames]).toContain("by-project-id");
    const photoTransaction = opened.value.transaction(STORE_NAMES.photoIndex, "readonly");
    expect([...photoTransaction.objectStore(STORE_NAMES.photoIndex).indexNames]).toContain("by-source-path");
    opened.value.close();
    await deleteDatabase(databaseName);
  });

  it("把旧 workspace 从 schema 1 迁移到当前数据库结构", async () => {
    const databaseName = `photoflex-legacy-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => migrateToV1(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = legacy.transaction(STORE_NAMES.projects, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).put({
      schemaVersion: 1,
      projectId: "legacy-project",
      name: "Legacy",
      sources: [{ id: "source-1", displayName: "Photos", status: "ready" }],
      poolPhotoIds: ["legacy-photo-a", "legacy-photo-b"],
      sequenceDraft: { projectId: "legacy-project", items: [] },
      versionIds: [],
      revision: 3,
      createdAt: "2026-08-26T08:00:00.000Z",
      updatedAt: "2026-08-26T08:10:00.000Z",
    });
    await transactionResult(transaction);
    legacy.close();

    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const migrated = await requestValue<Record<string, unknown>>(
      opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).get("legacy-project"),
    );
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.memo).toBe("");
    expect(migrated.expectedPhotoCount).toBeNull();
    expect(migrated.lastOpenedAt).toBe("2026-08-26T08:10:00.000Z");
    expect(migrated.sources).toEqual([
      { id: "source-1", displayName: "Photos", createdAt: "2026-08-26T08:00:00.000Z", kind: "folder" },
    ]);
    expect(migrated).not.toHaveProperty("poolPhotoIds");
    expect(migrated.photoStates).toEqual({});
    expect(migrated.worktableDraft).toMatchObject({
      projectId: "legacy-project",
      entryOrder: ["legacy-photo-a", "legacy-photo-b"],
      placements: {
        "legacy-photo-a": { id: "legacy-photo-a", x: 64, y: 64, width: 235, height: 175 },
        "legacy-photo-b": { id: "legacy-photo-b", x: 347, y: 64, width: 235, height: 175 },
      },
      groups: [],
      links: [],
      pileOrder: [],
      pilePlacements: {},
    });
    expect(migrated.sequenceIds).toEqual([]);
    opened.value.close();
    await deleteDatabase(databaseName);
  });

  it("升级已有 v3 Worktable 时保留照片坐标，只补关系集合", async () => {
    const databaseName = `photoflex-v3-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 4);
      request.onupgradeneeded = () => migrateToV1(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = legacy.transaction(STORE_NAMES.projects, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).put({
      schemaVersion: 3,
      projectId: "v3-project",
      name: "V3 table",
      memo: "",
      expectedPhotoCount: null,
      sources: [],
      photoStates: {},
      worktableDraft: {
        projectId: "v3-project",
        entryOrder: ["photo-a"],
        placements: { "photo-a": { photoId: "photo-a", x: 321, y: 654, z: 3, width: 235, height: 175, filename: "A.jpg" } },
      },
      sequenceDraft: { projectId: "v3-project", items: [] },
      versionIds: [], revision: 0,
      createdAt: "2026-08-26T08:00:00.000Z", updatedAt: "2026-08-26T08:00:00.000Z", lastOpenedAt: "2026-08-26T08:00:00.000Z",
    });
    await transactionResult(transaction);
    legacy.close();

    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const migrated = await requestValue<Record<string, unknown>>(
      opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).get("v3-project"),
    );
    expect(migrated.worktableDraft).toMatchObject({
      placements: { "photo-a": { x: 321, y: 654 } }, groups: [], links: [], pileOrder: [], pilePlacements: {},
    });
    opened.value.close();
    await deleteDatabase(databaseName);
  });

  it("把 v6 Sequence 升级为 photo items、Singles 与唯一 Initial Version", async () => {
    const databaseName = `photoflex-sequence-v6-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 6);
      request.onupgradeneeded = () => {
        migrateToV1(request.result);
        migrateToV2(request.result, request.transaction!);
        migrateToV3(request.transaction!);
        migrateToV6(request.result, request.transaction!);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = legacy.transaction([STORE_NAMES.projects, STORE_NAMES.sequences], "readwrite");
    transaction.objectStore(STORE_NAMES.projects).put({ schemaVersion: 5, projectId: "sequence-project", name: "Project", memo: "", expectedPhotoCount: null, sources: [], photoStates: {}, worktableDraft: { projectId: "sequence-project", entryOrder: [], placements: {}, groups: [], links: [], pileOrder: ["sequence-a"], pilePlacements: { "sequence-a": { sequenceId: "sequence-a", x: 0, y: 0, z: 1, width: 190, height: 118 } } }, sequenceIds: ["sequence-a"], versionIds: [], revision: 0, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastOpenedAt: "2026-09-01T00:00:00.000Z" });
    transaction.objectStore(STORE_NAMES.sequences).put({ id: "sequence-a", projectId: "sequence-project", name: "Street Edit", items: [{ id: "item-a", photoId: "photo-a" }, { id: "item-b", photoId: "photo-a" }], revision: 2, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:10:00.000Z" });
    await transactionResult(transaction); legacy.close();

    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const upgraded = await requestValue<Record<string, unknown>>(opened.value.transaction(STORE_NAMES.sequences, "readonly").objectStore(STORE_NAMES.sequences).get("sequence-a"));
    expect(upgraded.items).toMatchObject([{ kind: "photo", photoId: "photo-a" }, { kind: "photo", photoId: "photo-a" }]);
    expect(upgraded.readingUnits).toMatchObject([{ kind: "single", itemId: "item-a" }, { kind: "single", itemId: "item-b" }]);
    const currentVersionId = String(upgraded.currentVersionId);
    const version = await requestValue<Record<string, unknown>>(opened.value.transaction(STORE_NAMES.versions, "readonly").objectStore(STORE_NAMES.versions).get(currentVersionId));
    expect(version).toMatchObject({ name: "Initial · Street Edit", sequenceId: "sequence-a" });
    const workspace = await requestValue<Record<string, unknown>>(opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).get("sequence-project"));
    expect(workspace).toMatchObject({ schemaVersion: 8, versionIds: [currentVersionId] });
    opened.value.close(); await deleteDatabase(databaseName);
  });
});

describe("IndexedDB schema 8 → 10", () => {
  it("upgrades schema 6 workspaces for persistent deletion recovery", async () => {
    const databaseName = `photoflex-deletion-recovery-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 8);
      request.onupgradeneeded = () => {
        migrateToV1(request.result);
        migrateToV2(request.result, request.transaction!);
        migrateToV3(request.transaction!);
        migrateToV6(request.result, request.transaction!);
        migrateToV8(request.result);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = legacy.transaction(STORE_NAMES.projects, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).put({
      schemaVersion: 6,
      projectId: "pending-deletion-project",
      name: "Pending deletion",
      memo: "",
      expectedPhotoCount: null,
      sources: [],
      photoStates: {},
      worktableDraft: { projectId: "pending-deletion-project", entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {} },
      sequenceIds: [],
      versionIds: [],
      revision: 0,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
      lastOpenedAt: "2026-09-07T00:00:00.000Z",
    });
    await transactionResult(transaction);
    legacy.close();

    const opened = await openPhotoFlexDatabase({ databaseName });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const migrated = await requestValue<Record<string, unknown>>(
      opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).get("pending-deletion-project"),
    );
    expect(migrated.schemaVersion).toBe(8);
    expect(opened.value.objectStoreNames.contains(STORE_NAMES.photoFileHandles)).toBe(true);
    expect(migrated).not.toHaveProperty("deletionPendingAt");
    opened.value.close();
    await deleteDatabase(databaseName);
  });
});
