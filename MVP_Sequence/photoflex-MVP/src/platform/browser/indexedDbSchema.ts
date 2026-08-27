import {
  err,
  INDEXED_DB_SCHEMA_VERSION,
  ok,
  type Result,
  type StorageAccessError,
} from "../../contracts";

export const STORE_NAMES = {
  projects: "projects",
  versions: "versions",
  photoIndex: "photo-index",
  sourceGrants: "source-grants",
  photoThumbnails: "photo-thumbnails",
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

  const projects = transaction.objectStore(STORE_NAMES.projects);
  const cursorRequest = projects.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const workspace = cursor.value as Record<string, unknown>;
    const sources = Array.isArray(workspace.sources)
      ? workspace.sources.map((source) => {
          if (!source || typeof source !== "object") return source;
          const oldSource = source as Record<string, unknown>;
          const nextSource = { ...oldSource };
          delete nextSource.status;
          nextSource.createdAt =
            typeof oldSource.createdAt === "string" ? oldSource.createdAt : workspace.createdAt;
          return nextSource;
        })
      : [];
    cursor.update({
      ...workspace,
      schemaVersion: 2,
      memo: typeof workspace.memo === "string" ? workspace.memo : "",
      expectedPhotoCount: null,
      sources,
      lastOpenedAt:
        typeof workspace.lastOpenedAt === "string" ? workspace.lastOpenedAt : workspace.updatedAt,
    });
    cursor.continue();
  };
}

export function migrateToV3(transaction: IDBTransaction): void {
  const photos = transaction.objectStore(STORE_NAMES.photoIndex);
  if (!photos.indexNames.contains("by-source-path")) {
    // The compound key keeps every Source grouped while ordering its photos by path.
    photos.createIndex("by-source-path", ["sourceId", "relativePath"]);
  }
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
