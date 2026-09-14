import {
  err,
  INDEXED_DB_SCHEMA_VERSION,
  ok,
  WORKSPACE_SCHEMA_VERSION,
  type Result,
  type StorageAccessError,
} from "../../contracts";
import { createInitialVersion, legacySequenceFromWorkspace, migrateWorkspaceV2ToV3, migrateWorkspaceV3ToV4, migrateWorkspaceV4ToV5, migrateWorkspaceV7ToV8, upgradeSequenceDocument } from "../projectStoreData";

export const STORE_NAMES = {
  projects: "projects",
  versions: "versions",
  sequences: "sequences",
  photoIndex: "photo-index",
  sourceGrants: "source-grants",
  photoThumbnails: "photo-thumbnails",
  photoDerivedPreviews: "photo-derived-previews",
  photoFileHandles: "photo-file-handles",
} as const;

interface OpenDatabaseOptions {
  readonly indexedDB?: IDBFactory;
  readonly databaseName?: string;
  readonly onBlocked?: () => void;
  readonly onVersionChange?: () => void;
}

export function migrateToV1(database: IDBDatabase): void {
  const projects = database.createObjectStore(STORE_NAMES.projects, { keyPath: "projectId" });
  projects.createIndex("by-updated-at", "updatedAt");

  const versions = database.createObjectStore(STORE_NAMES.versions, { keyPath: "id" });
  versions.createIndex("by-project-id", "projectId");

  const photos = database.createObjectStore(STORE_NAMES.photoIndex, { keyPath: "id" });
  photos.createIndex("by-source-id", "sourceId");

  database.createObjectStore(STORE_NAMES.sourceGrants, { keyPath: "sourceId" });
}

export function migrateToV2(database: IDBDatabase, transaction: IDBTransaction): void {
  if (!database.objectStoreNames.contains(STORE_NAMES.photoThumbnails)) {
    database.createObjectStore(STORE_NAMES.photoThumbnails, { keyPath: "photoId" });
  }
  // Project rows are normalized once by migrateToV4. Keeping this step to
  // object-store creation avoids two concurrent cursors rewriting the same row.
  void transaction;
}

export function migrateToV3(transaction: IDBTransaction): void {
  const photos = transaction.objectStore(STORE_NAMES.photoIndex);
  if (!photos.indexNames.contains("by-source-path")) {
    // The compound key keeps every Source grouped while ordering its photos by path.
    photos.createIndex("by-source-path", ["sourceId", "relativePath"]);
  }
}

export function migrateToV4(transaction: IDBTransaction): void {
  const projects = transaction.objectStore(STORE_NAMES.projects);
  const cursorRequest = projects.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.update(migrateWorkspaceV2ToV3(cursor.value as Record<string, unknown>));
    cursor.continue();
  };
}

export function migrateToV5(transaction: IDBTransaction): void {
  const projects = transaction.objectStore(STORE_NAMES.projects);
  const cursorRequest = projects.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const value = cursor.value as Record<string, unknown>;
    // v3 already owns a fully positioned Worktable. Only pre-v3 records need
    // the Pool conversion; v3 merely receives empty relationship collections.
    const normalized = Number(value.schemaVersion) >= 3 ? value : migrateWorkspaceV2ToV3(value);
    cursor.update(migrateWorkspaceV3ToV4(normalized));
    cursor.continue();
  };
}

export function migrateToV6(database: IDBDatabase, transaction: IDBTransaction): void {
  const sequences = database.objectStoreNames.contains(STORE_NAMES.sequences)
    ? transaction.objectStore(STORE_NAMES.sequences)
    : database.createObjectStore(STORE_NAMES.sequences, { keyPath: "id" });
  if (!sequences.indexNames.contains("by-project-id")) sequences.createIndex("by-project-id", "projectId");
  const projects = transaction.objectStore(STORE_NAMES.projects);
  const versions = transaction.objectStore(STORE_NAMES.versions);
  const cursorRequest = projects.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const value = cursor.value as Record<string, unknown>;
    const normalizedV3 = Number(value.schemaVersion) >= 3 ? value : migrateWorkspaceV2ToV3(value);
    const normalizedV4 = Number(normalizedV3.schemaVersion) >= 4 ? normalizedV3 : migrateWorkspaceV3ToV4(normalizedV3);
    const legacy = legacySequenceFromWorkspace(normalizedV4);
    const workspace = migrateWorkspaceV4ToV5(normalizedV4);
    if (legacy) {
      const initial = createInitialVersion(legacy);
      sequences.put(legacy);
      versions.put(initial);
      workspace.versionIds = [...(Array.isArray(workspace.versionIds) ? workspace.versionIds : []), initial.id];
    }
    cursor.update(migrateWorkspaceV7ToV8(workspace));
    cursor.continue();
  };
}

export function migrateToV7(transaction: IDBTransaction, workspaceSchemaVersion: number = 6): void {
  const sequences = transaction.objectStore(STORE_NAMES.sequences);
  const versions = transaction.objectStore(STORE_NAMES.versions);
  const projects = transaction.objectStore(STORE_NAMES.projects);
  const workspaceCursor = projects.openCursor();
  workspaceCursor.onsuccess = () => {
    const cursor = workspaceCursor.result;
    if (!cursor) return;
    cursor.update(migrateWorkspaceV7ToV8({ ...(cursor.value as Record<string, unknown>), schemaVersion: workspaceSchemaVersion }));
    cursor.continue();
  };
  const versionCursor = versions.openCursor();
  versionCursor.onsuccess = () => {
    const cursor = versionCursor.result;
    if (!cursor) return;
    const value = cursor.value as Record<string, unknown>;
    const normalizedUpdatedAt = typeof value.updatedAt === "string" ? value.updatedAt : (typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString());
    if (typeof value.sequenceId !== "string" && typeof value.projectId === "string") {
      const items = Array.isArray(value.items) ? value.items.map((raw) => {
        const item = raw as Record<string, unknown>;
        return item.kind === "blank" ? { id: item.id, kind: "blank" } : { id: item.id, kind: "photo", photoId: item.photoId };
      }) : [];
      cursor.update({
        ...value,
        updatedAt: normalizedUpdatedAt,
        sequenceId: `sequence-${value.projectId}-legacy`,
        items,
        segments: [],
        readingUnits: items.map((item) => ({ id: `unit-${item.id}`, kind: item.kind === "blank" ? "blank" : "single", itemId: item.id })),
      });
    }
    else if (value.updatedAt !== normalizedUpdatedAt) cursor.update({ ...value, updatedAt: normalizedUpdatedAt });
    cursor.continue();
  };
  const sequenceCursor = sequences.openCursor();
  sequenceCursor.onsuccess = () => {
    const cursor = sequenceCursor.result;
    if (!cursor) return;
    const upgraded = upgradeSequenceDocument(cursor.value as Record<string, unknown>);
    if (!upgraded) { cursor.continue(); return; }
    cursor.update(upgraded);
    const initial = createInitialVersion(upgraded);
    versions.put(initial);
    const projectRequest = projects.get(upgraded.projectId);
    projectRequest.onsuccess = () => {
      const workspace = projectRequest.result as Record<string, unknown> | undefined;
      if (workspace) projects.put({ ...workspace, schemaVersion: workspaceSchemaVersion, versionIds: [...new Set([...(Array.isArray(workspace.versionIds) ? workspace.versionIds : []), initial.id])] });
      cursor.continue();
    };
  };
}

export function migrateToV8(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_NAMES.photoDerivedPreviews)) {
    database.createObjectStore(STORE_NAMES.photoDerivedPreviews, { keyPath: ["photoId", "maxEdge"] });
  }
}

export function migrateToV9(transaction: IDBTransaction): void {
  const projects = transaction.objectStore(STORE_NAMES.projects);
  const cursorRequest = projects.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.update({ ...(cursor.value as Record<string, unknown>), schemaVersion: 7 });
    cursor.continue();
  };
}

export function migrateToV10(database: IDBDatabase, transaction: IDBTransaction, migrateProjects = true): void {
  if (!database.objectStoreNames.contains(STORE_NAMES.photoFileHandles)) {
    database.createObjectStore(STORE_NAMES.photoFileHandles, { keyPath: "photoId" });
  }
  if (migrateProjects) {
    const projects = transaction.objectStore(STORE_NAMES.projects);
    const cursorRequest = projects.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      cursor.update(migrateWorkspaceV7ToV8(cursor.value as Record<string, unknown>));
      cursor.continue();
    };
  }
  const photos = transaction.objectStore(STORE_NAMES.photoIndex);
  const photoCursor = photos.openCursor();
  photoCursor.onsuccess = () => {
    const cursor = photoCursor.result;
    if (!cursor) return;
    cursor.update({ locationKind: "folder-relative", ...(cursor.value as Record<string, unknown>) });
    cursor.continue();
  };
}

export function openPhotoFlexDatabase(
  options: OpenDatabaseOptions = {},
): Promise<Result<IDBDatabase, StorageAccessError>> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return Promise.resolve(err({ kind: "unavailable", retryable: false }));

  const databaseName = options.databaseName ?? "photoflex-mvp";

  return new Promise((resolve) => {
    const inspect = factory.open(databaseName);
    let inspectCreated = false;

    inspect.onupgradeneeded = () => {
      inspectCreated = true;
      try {
        migrateToV1(inspect.result);
      } catch {
        inspect.transaction?.abort();
      }
    };
    inspect.onblocked = () => options.onBlocked?.();
    inspect.onerror = () => resolve(err({ kind: "unavailable", retryable: true }));
    inspect.onsuccess = () => {
      const existing = inspect.result;
      const found = existing.version;
      existing.close();

      if (!inspectCreated && found > INDEXED_DB_SCHEMA_VERSION) {
        resolve(
          err({
            kind: "unsupported-storage-schema",
            found,
            supported: [INDEXED_DB_SCHEMA_VERSION],
          }),
        );
        return;
      }

      const request = factory.open(databaseName, INDEXED_DB_SCHEMA_VERSION);
      let migrationFailed = false;
      let migrationFrom = found;
      request.onupgradeneeded = (event) => {
        migrationFrom = (event as IDBVersionChangeEvent).oldVersion;
        try {
          if (migrationFrom === 0) migrateToV1(request.result);
          if (migrationFrom < 2) migrateToV2(request.result, request.transaction!);
          if (migrationFrom < 3) migrateToV3(request.transaction!);
          // v6 performs the complete row normalization in one cursor pass.
          if (migrationFrom < 6) migrateToV6(request.result, request.transaction!);
          else if (migrationFrom < 7) migrateToV7(request.transaction!, WORKSPACE_SCHEMA_VERSION);
          if (migrationFrom < 8) migrateToV8(request.result);
          // v6/v7 already own the project-row cursor for older databases. Let
          // them finish the workspace normalization so v10 cannot overwrite a
          // richer migrated row with a concurrent cursor update.
          if (migrationFrom < 10) migrateToV10(request.result, request.transaction!, migrationFrom >= 7);
        } catch {
          migrationFailed = true;
          request.transaction?.abort();
        }
      };
      request.onblocked = () => options.onBlocked?.();
      request.onerror = () => {
        if (migrationFailed) {
          resolve(err({ kind: "migration-failed", from: migrationFrom, to: INDEXED_DB_SCHEMA_VERSION }));
          return;
        }
        resolve(err({ kind: "unavailable", retryable: request.error?.name !== "VersionError" }));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (database.version !== INDEXED_DB_SCHEMA_VERSION) {
          database.close();
          resolve(
            err({
              kind: "unsupported-storage-schema",
              found: database.version,
              supported: [INDEXED_DB_SCHEMA_VERSION],
            }),
          );
          return;
        }
        database.onversionchange = () => {
          database.close();
          options.onVersionChange?.();
        };
        resolve(ok(database));
      };
    };
  });
}
