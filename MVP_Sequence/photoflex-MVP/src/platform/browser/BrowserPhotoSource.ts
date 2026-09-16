import {
  err,
  ok,
  type DerivedPreviewMaxEdge,
  type DroppedPhotoIngestResult,
  type PhotoId,
  type PhotoPage,
  type PhotoRef,
  type PhotoSource,
  type PreviewLease,
  type Result,
  type RemovedSourceData,
  type SourceError,
  type SourceGrant,
  type SourceId,
  type SourceRecord,
  type SourceRuntimeState,
  type SourceScanEvent,
} from "../../contracts";
import { openPhotoFlexDatabase, STORE_NAMES } from "./indexedDbSchema";
import { pickWebkitDirectory } from "./webkitDirectoryPicker";

type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>;

type DirectoryHandleLike = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  resolve?(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
};

type FileHandleLike = FileSystemFileHandle & {
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};

interface BrowserPhotoSourceOptions {
  readonly picker?: DirectoryPicker;
  readonly filePicker?: () => Promise<readonly File[]>;
  readonly databaseName?: string;
  readonly indexedDB?: IDBFactory;
}

interface StoredGrant {
  readonly sourceId: SourceId;
  readonly displayName: string;
  readonly handle: FileSystemDirectoryHandle;
  readonly state: SourceRuntimeState;
}

interface StoredThumbnail {
  readonly photoId: PhotoId;
  readonly blob: Blob;
  readonly maxEdge?: number;
  readonly sourceVersion?: string;
}

interface StoredDerivedPreview {
  readonly photoId: PhotoId;
  readonly maxEdge: DerivedPreviewMaxEdge;
  readonly sourceVersion: string;
  readonly blob: Blob;
}

interface StoredFileHandle {
  readonly photoId: PhotoId;
  readonly handle: FileSystemFileHandle;
}

interface CachedUrl {
  readonly key: string;
  readonly url: string;
  readonly blob: Blob;
  references: number;
  lastUsed: number;
}

interface CachedDerivedPreview {
  readonly blob: Blob;
  readonly sourceVersion: string;
  lastUsed: number;
}

const PAGE_SIZE = 100;
const THUMBNAIL_GENERATION_CONCURRENCY = 4;
// A 512 px edge remains compact while rendering the default 235 px Table card
// crisply on common high-density displays.
const THUMBNAIL_MAX_EDGE = 512;
// Sequence cards are larger than Table cards, but still use a derived image so
// the canvas never needs to decode the original file for every mounted card.
// 1536px keeps high-DPI canvas cards crisp while remaining much cheaper than
// retaining original-file blobs for every visible item.
const DERIVED_PREVIEW_CACHE_LIMIT = 64;
const URL_CACHE_LIMIT = 72;

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionResult = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });

const initialState = (sourceId: SourceId, status: SourceRuntimeState["status"]): SourceRuntimeState => ({
  sourceId,
  status,
  scanRevision: 0,
  discoveredCount: 0,
  indexedCount: 0,
  skippedCount: 0,
  failedCount: 0,
});

const isJpeg = (name: string): boolean => /\.(jpe?g)$/i.test(name);

const photoVersion = (photo: PhotoRef): string => [
  photo.relativePath,
  photo.width,
  photo.height,
  photo.fileSize ?? "unknown-size",
  photo.fileLastModified ?? "unknown-mtime",
].join("|");

const toSourceError = (): SourceError => ({ kind: "io", retryable: true });

export class BrowserPhotoSource implements PhotoSource {
  private readonly handles = new Map<SourceId, FileSystemDirectoryHandle>();
  private readonly states = new Map<SourceId, SourceRuntimeState>();
  private readonly photoVersions = new Map<PhotoId, string>();
  private readonly fileHandles = new Map<PhotoId, FileSystemFileHandle>();
  private readonly urlCache = new Map<string, CachedUrl>();
  private readonly thumbnailJobs = new Map<string, Promise<Result<Blob, SourceError>>>();
  private readonly derivedPreviewJobs = new Map<string, Promise<Result<Blob, SourceError>>>();
  private readonly derivedPreviewCache = new Map<string, CachedDerivedPreview>();
  private readonly thumbnailWaiters: Array<() => void> = [];
  private activeThumbnailJobs = 0;
  private urlClock = 0;
  private readonly picker: DirectoryPicker;
  private readonly database: Promise<Result<IDBDatabase, unknown>>;

  constructor(options: BrowserPhotoSourceOptions = {}) {
    const nativePicker = (globalThis as typeof globalThis & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    this.picker = options.picker ?? (options.filePicker
      ? () => pickWebkitDirectory(options.filePicker)
      : typeof nativePicker === "function"
        ? () => nativePicker.call(globalThis)
        : () => pickWebkitDirectory());
    this.database = openPhotoFlexDatabase({
      databaseName: options.databaseName,
      indexedDB: options.indexedDB,
    });
  }

  async close(): Promise<void> {
    const opened = await this.database;
    if (opened.ok) opened.value.close();
    for (const cached of this.urlCache.values()) URL.revokeObjectURL(cached.url);
    this.urlCache.clear();
    this.derivedPreviewCache.clear();
    this.photoVersions.clear();
    this.fileHandles.clear();
  }

  async chooseFolder(
    existingSourceIds: readonly SourceId[],
  ): Promise<Result<SourceGrant, SourceError>> {
    try {
      const handle = await this.picker();
      const opened = await this.database;
      if (!opened.ok) return err(toSourceError());

      for (const sourceId of existingSourceIds) {
        const existing = await this.loadHandle(sourceId, opened.value);
        if (existing && (await existing.isSameEntry(handle))) {
          this.handles.set(sourceId, existing);
          const state = this.states.get(sourceId) ?? initialState(sourceId, "ready");
          this.states.set(sourceId, state);
          await this.saveGrant(opened.value, {
            sourceId,
            displayName: existing.name,
            handle: existing,
            state,
          });
          return ok(this.toGrant(sourceId, existing, false));
        }
      }

      const sourceId = crypto.randomUUID() as SourceId;
      const state = initialState(sourceId, "ready");
      this.handles.set(sourceId, handle);
      this.states.set(sourceId, state);
      await this.saveGrant(opened.value, {
        sourceId,
        displayName: handle.name,
        handle,
        state,
      });
      return ok(this.toGrant(sourceId, handle, false));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return err({ kind: "cancelled" });
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        return err({ kind: "permission-denied" });
      }
      return err({ kind: "io", retryable: false });
    }
  }

  async restoreFolder(sourceId: SourceId): Promise<Result<SourceGrant, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const sourceRecord = await this.findSourceRecord(opened.value, sourceId);
    if (sourceRecord?.kind === "external-files") {
      const photos = await this.readSourcePhotos(opened.value, sourceId);
      let permissionLost = false;
      for (const photo of photos) {
        const handle = await this.readFileHandle(opened.value, photo.id);
        if (!handle) { permissionLost = true; continue; }
        const fileHandle = handle as FileHandleLike;
        let permission = await fileHandle.queryPermission?.({ mode: "read" });
        if (permission !== "granted" && fileHandle.requestPermission) permission = await fileHandle.requestPermission({ mode: "read" });
        if (permission && permission !== "granted") permissionLost = true;
      }
      const status = permissionLost ? "permission-lost" as const : photos.length ? "ready" as const : "empty" as const;
      this.states.set(sourceId, { ...initialState(sourceId, status), discoveredCount: photos.length, indexedCount: photos.length });
      return permissionLost
        ? err({ kind: "permission-lost", sourceId })
        : ok({ sourceId, displayName: sourceRecord.displayName, status, restored: true });
    }
    let handle = await this.loadHandle(sourceId, opened.value);
    if (!handle) {
      // Backups contain paths and stable photo references, never directory grants.
      const projects = await requestValue<import("../../contracts").ProjectWorkspace[]>(opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).getAll());
      if (!projects.some((p) => p.sources.some((s) => s.id === sourceId))) return err({ kind: "source-not-found", sourceId });
      try {
        handle = await this.picker();
        const photos = await this.readSourcePhotos(opened.value, sourceId);
        if (photos.length) {
          let matched = false;
          for (const photo of photos) {
            try {
              let directory = handle;
              const parts = photo.relativePath.split("/");
              for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
              await directory.getFileHandle(parts.at(-1)!);
              matched = true;
              break;
            } catch { /* A moved/deleted image must not prevent partial recovery. */ }
          }
          if (!matched) return err({ kind: "folder-mismatch", sourceId });
        }
      } catch (error) {
        return err(error instanceof DOMException && error.name === "AbortError" ? { kind: "cancelled" } : { kind: "permission-denied", sourceId });
      }
    }

    const directory = handle as DirectoryHandleLike;
    let permission = await directory.queryPermission?.({ mode: "read" });

    // A stored directory handle may return "prompt" after a refresh. Reconnect is
    // called from a user action, so this is the right place to ask for access again.
    if (permission !== "granted" && directory.requestPermission) {
      permission = await directory.requestPermission({ mode: "read" });
    }
    if (permission && permission !== "granted") {
      const state = {
        ...(this.states.get(sourceId) ?? initialState(sourceId, "ready")),
        status: "permission-lost" as const,
      };
      this.states.set(sourceId, state);
      return err({ kind: "permission-lost", sourceId });
    }

    this.handles.set(sourceId, handle);
    const previous = this.states.get(sourceId) ?? initialState(sourceId, "ready");
    const state = { ...previous, status: previous.indexedCount ? ("ready" as const) : previous.status };
    this.states.set(sourceId, state);
    await this.saveGrant(opened.value, {
      sourceId,
      displayName: handle.name,
      handle,
      state,
    });
    return ok(this.toGrant(sourceId, handle, true));
  }

  async removeSource(sourceId: SourceId): Promise<Result<RemovedSourceData, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    try {
      const photos = await this.readSourcePhotos(opened.value, sourceId);
      const transaction = opened.value.transaction(
        [STORE_NAMES.sourceGrants, STORE_NAMES.photoIndex, STORE_NAMES.photoThumbnails, STORE_NAMES.photoDerivedPreviews, STORE_NAMES.photoFileHandles],
        "readwrite",
      );
      transaction.objectStore(STORE_NAMES.sourceGrants).delete(sourceId);
      const photoStore = transaction.objectStore(STORE_NAMES.photoIndex);
      const thumbnailStore = transaction.objectStore(STORE_NAMES.photoThumbnails);
      const derivedStore = transaction.objectStore(STORE_NAMES.photoDerivedPreviews);
      const fileHandleStore = transaction.objectStore(STORE_NAMES.photoFileHandles);
      for (const photo of photos) {
        photoStore.delete(photo.id);
        thumbnailStore.delete(photo.id);
        fileHandleStore.delete(photo.id);
        for (const maxEdge of [768, 1536, 2048] as const) derivedStore.delete([photo.id, maxEdge]);
      }
      await transactionResult(transaction);
      this.handles.delete(sourceId);
      this.states.delete(sourceId);
      for (const photo of photos) {
        this.photoVersions.delete(photo.id);
        this.fileHandles.delete(photo.id);
        this.dropCachedUrls(`thumbnail:${photo.id}:`);
        this.dropCachedUrls(`preview:${photo.id}:`);
        for (const jobKey of this.thumbnailJobs.keys()) {
          if (jobKey.startsWith(`${photo.id}:`)) this.thumbnailJobs.delete(jobKey);
        }
        for (const maxEdge of [768, 1536, 2048] as const) {
          const prefix = `derived:${maxEdge}:${photo.id}:`;
          for (const cacheKey of this.derivedPreviewCache.keys()) {
            if (cacheKey.startsWith(prefix)) this.derivedPreviewCache.delete(cacheKey);
          }
          for (const jobKey of this.derivedPreviewJobs.keys()) {
            if (jobKey.startsWith(prefix)) this.derivedPreviewJobs.delete(jobKey);
          }
        }
      }
      return ok({ photoIds: photos.map((photo) => photo.id) });
    } catch {
      return err(toSourceError());
    }
  }

  async *scan(
    sourceId: SourceId,
    signal?: AbortSignal,
  ): AsyncIterable<Result<SourceScanEvent, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) {
      yield err(toSourceError());
      return;
    }
    const source = await this.findSourceRecord(opened.value, sourceId);
    if (source?.kind === "external-files") {
      const photos = await this.readSourcePhotos(opened.value, sourceId);
      let permissionLost = false;
      for (const photo of photos) {
        const fileHandle = await this.readFileHandle(opened.value, photo.id) as FileHandleLike | undefined;
        const permission = await fileHandle?.queryPermission?.({ mode: "read" });
        if (!fileHandle || (permission && permission !== "granted")) permissionLost = true;
      }
      const state = {
        ...initialState(sourceId, permissionLost ? "permission-lost" : photos.length ? "ready" : "empty"),
        discoveredCount: photos.length,
        indexedCount: photos.length,
      };
      this.states.set(sourceId, state);
      yield ok({ kind: "completed", state });
      return;
    }
    const handle = await this.loadHandle(sourceId, opened.value);
    if (!handle) {
      const photos = await this.readSourcePhotos(opened.value, sourceId);
      const state = { ...initialState(sourceId, "offline"), indexedCount: photos.length };
      this.states.set(sourceId, state);
      yield ok({ kind: "completed", state });
      return;
    }

    const existing = await this.readSourcePhotos(opened.value, sourceId);
    const byPath = new Map(existing.map((photo) => [photo.relativePath, photo]));
    const previousState = this.states.get(sourceId) ?? initialState(sourceId, "ready");
    let state: SourceRuntimeState = {
      ...previousState,
      status: "loading" as const,
      scanRevision: (previousState.scanRevision ?? 0) + 1,
      discoveredCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errorMessage: undefined,
    };
    this.states.set(sourceId, state);
    await this.saveState(opened.value, sourceId, state, handle);
    yield ok({ kind: "progress", state });

    const batch: PhotoRef[] = [];
    try {
      for await (const entry of walkDirectory(handle)) {
        if (signal?.aborted) {
          state = { ...state, status: state.indexedCount ? "partial" : "empty" };
          this.states.set(sourceId, state);
          await this.saveState(opened.value, sourceId, state, handle);
          yield ok({ kind: "completed", state });
          return;
        }
        if (!isJpeg(entry.relativePath)) {
          state = { ...state, skippedCount: state.skippedCount + 1 };
          continue;
        }
        state = { ...state, discoveredCount: state.discoveredCount + 1 };
        try {
          const file = await entry.handle.getFile();
          const dimensions = await readDimensions(file);
          const previous = byPath.get(entry.relativePath);
          const indexedPhoto: PhotoRef = {
            id: previous?.id ?? (crypto.randomUUID() as PhotoId),
            sourceId,
            relativePath: entry.relativePath,
            width: dimensions.width,
            height: dimensions.height,
            fileSize: file.size,
            fileLastModified: file.lastModified,
          };
          batch.push(indexedPhoto);
          this.photoVersions.set(indexedPhoto.id, photoVersion(indexedPhoto));
        } catch {
          state = { ...state, failedCount: state.failedCount + 1 };
        }
        if (batch.length >= PAGE_SIZE) {
          const count = batch.length;
          await this.writePhotos(opened.value, batch.splice(0));
          state = { ...state, indexedCount: state.indexedCount + count };
          this.states.set(sourceId, state);
          await this.saveState(opened.value, sourceId, state, handle);
          yield ok({ kind: "progress", state });
          await Promise.resolve();
        }
      }
      if (batch.length) {
        const count = batch.length;
        await this.writePhotos(opened.value, batch.splice(0));
        state = { ...state, indexedCount: state.indexedCount + count };
      }
      state = {
        ...state,
        status: state.indexedCount === 0 ? "empty" : state.failedCount ? "partial" : "ready",
      };
      this.states.set(sourceId, state);
      await this.saveState(opened.value, sourceId, state, handle);
      yield ok({ kind: "completed", state });
    } catch {
      state = { ...state, status: state.indexedCount ? "partial" : "error", errorMessage: "扫描失败，请重试。" };
      this.states.set(sourceId, state);
      await this.saveState(opened.value, sourceId, state, handle);
      yield err({ kind: "io", retryable: true });
    }
  }

  async getSourceState(sourceId: SourceId): Promise<Result<SourceRuntimeState, SourceError>> {
    const cached = this.states.get(sourceId);
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const grant = await requestValue<StoredGrant | undefined>(
      opened.value
        .transaction(STORE_NAMES.sourceGrants, "readonly")
        .objectStore(STORE_NAMES.sourceGrants)
        .get(sourceId),
    ).catch(() => undefined);
    const storedState = grant?.state ?? cached;
    if (!storedState) {
      const projects = await requestValue<import("../../contracts").ProjectWorkspace[]>(opened.value.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).getAll());
      const source = projects.flatMap((p) => p.sources).find((s) => s.id === sourceId);
      if (!source) return err({ kind: "source-not-found", sourceId });
      const photos = await this.readSourcePhotos(opened.value, sourceId);
      if (source.kind === "external-files") {
        let permissionLost = false;
        for (const photo of photos) {
          const handle = await this.readFileHandle(opened.value, photo.id);
          const permission = await (handle as FileHandleLike | undefined)?.queryPermission?.({ mode: "read" });
          if (!handle || (permission && permission !== "granted")) permissionLost = true;
        }
        return ok({
          ...initialState(sourceId, permissionLost ? "permission-lost" : photos.length ? "ready" : "empty"),
          discoveredCount: photos.length,
          indexedCount: photos.length,
        });
      }
      return ok({ ...initialState(sourceId, "offline"), indexedCount: photos.length });
    }
    const handle = await this.loadHandle(sourceId, opened.value);
    if (handle) {
      const permission = await (handle as DirectoryHandleLike).queryPermission?.({ mode: "read" });
      if (permission && permission !== "granted") {
        const state = { ...storedState, status: "permission-lost" as const };
        this.states.set(sourceId, state);
        return ok({ ...state });
      }
    }
    this.states.set(sourceId, storedState);
    return ok({ ...storedState });
  }

  async listPhotos(
    sourceId: SourceId,
    cursor = "0",
    limit = PAGE_SIZE,
  ): Promise<Result<PhotoPage, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    try {
      const pageLimit = Math.min(PAGE_SIZE, Math.max(1, Math.floor(limit) || PAGE_SIZE));
      const page = await this.readPhotoPage(opened.value, sourceId, cursor === "0" ? undefined : cursor, pageLimit + 1);
      const items = page.slice(0, pageLimit);
      return ok({
        items,
        nextCursor: page.length > pageLimit ? items.at(-1)!.relativePath : null,
        // File existence is checked only when a visible thumbnail or preview is
        // requested. Keeping pagination index-only removes up to 100 serial FS reads.
        issues: [],
      });
    } catch {
      return err(toSourceError());
    }
  }

  async getPhoto(photoId: PhotoId): Promise<Result<PhotoRef, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    try {
      const photo = await this.readStoredPhoto(opened.value, photoId);
      return photo ? ok(photo) : err({ kind: "photo-not-found", photoId });
    } catch {
      return err(toSourceError());
    }
  }

  async ingestDroppedFiles(
    handles: readonly FileSystemHandle[],
    sources: readonly SourceRecord[],
    externalSourceId: SourceId,
  ): Promise<Result<DroppedPhotoIngestResult, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const database = opened.value;
    const items: DroppedPhotoIngestResult["items"][number][] = [];
    const skipped: DroppedPhotoIngestResult["skipped"][number][] = [];
    const accepted: FileSystemFileHandle[] = [];
    try {
      for (const handle of handles) {
        if (handle.kind !== "file" || !isJpeg(handle.name)) {
          skipped.push({ kind: "unsupported-file", relativePath: handle.name });
          continue;
        }
        const fileHandle = handle as FileSystemFileHandle;
        let repeatedInBatch = false;
        for (const previous of accepted) {
          if (await previous.isSameEntry(fileHandle)) { repeatedInBatch = true; break; }
        }
        if (repeatedInBatch) continue;
        accepted.push(fileHandle);

        let resolvedSourceId: SourceId | undefined;
        let resolvedPath: string | undefined;
        for (const source of sources) {
          if (source.removedAt || source.kind === "external-files") continue;
          const directory = await this.loadHandle(source.id, database) as DirectoryHandleLike | undefined;
          if (!directory?.resolve) continue;
          const parts = await directory.resolve(fileHandle).catch(() => null);
          if (parts?.length) {
            resolvedSourceId = source.id;
            resolvedPath = parts.join("/");
            break;
          }
        }

        if (resolvedSourceId && resolvedPath) {
          const previous = await this.readPhotoBySourcePath(database, resolvedSourceId, resolvedPath);
          if (previous) {
            items.push({ photo: previous, status: "reused" });
            continue;
          }
          const file = await fileHandle.getFile();
          const dimensions = await readDimensions(file);
          const photo: PhotoRef = {
            id: crypto.randomUUID() as PhotoId,
            sourceId: resolvedSourceId,
            relativePath: resolvedPath,
            locationKind: "folder-relative",
            width: dimensions.width,
            height: dimensions.height,
            fileSize: file.size,
            fileLastModified: file.lastModified,
          };
          await this.writePhotos(database, [photo]);
          this.photoVersions.set(photo.id, photoVersion(photo));
          items.push({ photo, status: "created" });
          continue;
        }

        const externalPhotos = await this.readSourcePhotos(database, externalSourceId);
        let matched: PhotoRef | undefined;
        for (const photo of externalPhotos) {
          const stored = await this.readFileHandle(database, photo.id);
          if (stored && await stored.isSameEntry(fileHandle)) { matched = photo; break; }
        }
        if (matched) {
          // A fresh user drop is also the recovery path for a persisted handle
          // whose read permission was lost. Keep the PhotoId, replace only the
          // capability used to reach its original file.
          await this.saveFileHandle(database, matched.id, fileHandle);
          items.push({ photo: matched, status: "reused" });
          continue;
        }
        const file = await fileHandle.getFile();
        const dimensions = await readDimensions(file);
        const id = crypto.randomUUID() as PhotoId;
        const photo: PhotoRef = {
          id,
          sourceId: externalSourceId,
          relativePath: `_external/${id}/${file.name}`,
          locationKind: "file-handle",
          width: dimensions.width,
          height: dimensions.height,
          fileSize: file.size,
          fileLastModified: file.lastModified,
        };
        await this.writePhotos(database, [photo]);
        await this.saveFileHandle(database, id, fileHandle);
        this.photoVersions.set(id, photoVersion(photo));
        items.push({ photo, status: "created" });
      }
      const externalPhotos = await this.readSourcePhotos(database, externalSourceId);
      this.states.set(externalSourceId, {
        ...initialState(externalSourceId, externalPhotos.length ? "ready" : "empty"),
        discoveredCount: externalPhotos.length,
        indexedCount: externalPhotos.length,
        skippedCount: skipped.length,
      });
      return ok({ items, skipped });
    } catch (error) {
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        return err({ kind: "permission-denied" });
      }
      return err(toSourceError());
    }
  }

  async thumbnail(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const sourceVersion = await this.getPhotoVersion(opened.value, photoId);
    if (!sourceVersion) return err({ kind: "photo-not-found", photoId });
    const cacheKey = `thumbnail:${photoId}:${sourceVersion}`;
    const stored = await requestValue<StoredThumbnail | undefined>(
      opened.value
        .transaction(STORE_NAMES.photoThumbnails, "readonly")
        .objectStore(STORE_NAMES.photoThumbnails)
        .get(photoId),
    ).catch(() => undefined);
    if (stored?.maxEdge === THUMBNAIL_MAX_EDGE && stored.sourceVersion === sourceVersion) {
      return ok(this.createLease(cacheKey, stored.blob));
    }

    const jobKey = `${photoId}:${sourceVersion}`;
    let job = this.thumbnailJobs.get(jobKey);
    if (!job) {
      job = this.generateThumbnail(opened.value, photoId, sourceVersion);
      this.thumbnailJobs.set(jobKey, job);
      void job.finally(() => {
        if (this.thumbnailJobs.get(jobKey) === job) this.thumbnailJobs.delete(jobKey);
      });
    }
    const generated = await job;
    return generated.ok
      ? ok(this.createLease(cacheKey, generated.value))
      : generated;
  }

  async preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const sourceVersion = await this.getPhotoVersion(opened.value, photoId);
    if (!sourceVersion) return err({ kind: "photo-not-found", photoId });
    const file = await this.readPhotoFile(opened.value, photoId);
    return file.ok ? ok(this.createLease(`preview:${photoId}:${sourceVersion}`, file.value)) : err(file.error);
  }

  async derivedPreview(photoId: PhotoId, maxEdge: DerivedPreviewMaxEdge): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const sourceVersion = await this.getPhotoVersion(opened.value, photoId);
    if (!sourceVersion) return err({ kind: "photo-not-found", photoId });
    const key = `derived:${maxEdge}:${photoId}:${sourceVersion}`;
    const cached = this.derivedPreviewCache.get(key);
    if (cached?.sourceVersion === sourceVersion) {
      cached.lastUsed = ++this.urlClock;
      return ok(this.createLease(key, cached.blob));
    }
    if (cached) this.derivedPreviewCache.delete(key);

    const stored = maxEdge === 768
      ? await requestValue<StoredDerivedPreview | undefined>(
        opened.value
          .transaction(STORE_NAMES.photoDerivedPreviews, "readonly")
          .objectStore(STORE_NAMES.photoDerivedPreviews)
          .get([photoId, maxEdge]),
      ).catch(() => undefined)
      : undefined;
    if (stored?.sourceVersion === sourceVersion) {
      this.derivedPreviewCache.set(key, { blob: stored.blob, sourceVersion, lastUsed: ++this.urlClock });
      this.trimDerivedPreviewCache();
      return ok(this.createLease(key, stored.blob));
    }

    const jobKey = `${key}:${sourceVersion}`;
    let job = this.derivedPreviewJobs.get(jobKey);
    if (!job) {
      job = this.generateDerivedPreview(opened.value, photoId, maxEdge, sourceVersion);
      this.derivedPreviewJobs.set(jobKey, job);
      void job.finally(() => {
        if (this.derivedPreviewJobs.get(jobKey) === job) this.derivedPreviewJobs.delete(jobKey);
      });
    }
    const generated = await job;
    if (!generated.ok) return generated;
    this.derivedPreviewCache.set(key, { blob: generated.value, sourceVersion, lastUsed: ++this.urlClock });
    this.trimDerivedPreviewCache();
    return ok(this.createLease(key, generated.value));
  }

  private trimDerivedPreviewCache(): void {
    while (this.derivedPreviewCache.size > DERIVED_PREVIEW_CACHE_LIMIT) {
      const oldest = [...this.derivedPreviewCache.entries()].sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      if (!oldest) return;
      this.derivedPreviewCache.delete(oldest[0]);
    }
  }

  private async generateThumbnail(database: IDBDatabase, photoId: PhotoId, sourceVersion: string): Promise<Result<Blob, SourceError>> {
    await this.acquireThumbnailSlot();
    try {
      const file = await this.readPhotoFile(database, photoId);
      if (!file.ok) return file;
      const blob = await createThumbnail(file.value);
      const transaction = database.transaction(STORE_NAMES.photoThumbnails, "readwrite");
      transaction.objectStore(STORE_NAMES.photoThumbnails).put({ photoId, blob, maxEdge: THUMBNAIL_MAX_EDGE, sourceVersion } satisfies StoredThumbnail);
      await transactionResult(transaction);
      return ok(blob);
    } catch {
      return err({ kind: "preview-unavailable", photoId });
    } finally {
      this.releaseThumbnailSlot();
    }
  }

  private async generateDerivedPreview(database: IDBDatabase, photoId: PhotoId, maxEdge: DerivedPreviewMaxEdge, sourceVersion: string): Promise<Result<Blob, SourceError>> {
    await this.acquireThumbnailSlot();
    try {
      const file = await this.readPhotoFile(database, photoId);
      if (!file.ok) return file;
      const blob = await createResizedPreview(file.value, maxEdge);
      // Persistence is best effort: a full disk must not turn an otherwise
      // usable preview into a visible loading error.
      if (maxEdge === 768) await this.persistDerivedPreview(database, { photoId, maxEdge, sourceVersion, blob });
      return ok(blob);
    } catch {
      return err({ kind: "preview-unavailable", photoId });
    } finally {
      this.releaseThumbnailSlot();
    }
  }

  private acquireThumbnailSlot(): Promise<void> {
    if (this.activeThumbnailJobs < THUMBNAIL_GENERATION_CONCURRENCY) {
      this.activeThumbnailJobs += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.thumbnailWaiters.push(resolve));
  }

  private releaseThumbnailSlot(): void {
    const next = this.thumbnailWaiters.shift();
    if (next) next();
    else this.activeThumbnailJobs -= 1;
  }

  private async readStoredPhoto(database: IDBDatabase, photoId: PhotoId): Promise<PhotoRef | undefined> {
    return requestValue<PhotoRef | undefined>(
      database.transaction(STORE_NAMES.photoIndex, "readonly").objectStore(STORE_NAMES.photoIndex).get(photoId),
    );
  }

  private async readPhotoBySourcePath(database: IDBDatabase, sourceId: SourceId, relativePath: string): Promise<PhotoRef | undefined> {
    return requestValue<PhotoRef | undefined>(
      database.transaction(STORE_NAMES.photoIndex, "readonly").objectStore(STORE_NAMES.photoIndex).index("by-source-path").get([sourceId, relativePath]),
    );
  }

  private async readFileHandle(database: IDBDatabase, photoId: PhotoId): Promise<FileSystemFileHandle | undefined> {
    const cached = this.fileHandles.get(photoId);
    if (cached) return cached;
    const stored = await requestValue<StoredFileHandle | undefined>(
      database.transaction(STORE_NAMES.photoFileHandles, "readonly").objectStore(STORE_NAMES.photoFileHandles).get(photoId),
    ).catch(() => undefined);
    if (stored?.handle) this.fileHandles.set(photoId, stored.handle);
    return stored?.handle;
  }

  private async saveFileHandle(database: IDBDatabase, photoId: PhotoId, handle: FileSystemFileHandle): Promise<void> {
    this.fileHandles.set(photoId, handle);
    try {
      const transaction = database.transaction(STORE_NAMES.photoFileHandles, "readwrite");
      transaction.objectStore(STORE_NAMES.photoFileHandles).put({ photoId, handle } satisfies StoredFileHandle);
      await transactionResult(transaction);
    } catch (error) {
      // fake-indexeddb cannot clone method-bearing test handles; native handles are cloneable.
      if (error instanceof DOMException && error.name === "DataCloneError") return;
      throw error;
    }
  }

  private async getPhotoVersion(database: IDBDatabase, photoId: PhotoId): Promise<string | undefined> {
    const cached = this.photoVersions.get(photoId);
    if (cached) return cached;
    const photo = await this.readStoredPhoto(database, photoId).catch(() => undefined);
    if (!photo) return undefined;
    const version = photoVersion(photo);
    this.photoVersions.set(photoId, version);
    return version;
  }

  private async persistDerivedPreview(database: IDBDatabase, preview: StoredDerivedPreview): Promise<void> {
    try {
      const transaction = database.transaction(STORE_NAMES.photoDerivedPreviews, "readwrite");
      transaction.objectStore(STORE_NAMES.photoDerivedPreviews).put(preview);
      await transactionResult(transaction);
    } catch {
      // Browser quota and private-mode failures should not block the preview.
    }
  }

  private async loadHandle(sourceId: SourceId, database: IDBDatabase): Promise<FileSystemDirectoryHandle | undefined> {
    const cached = this.handles.get(sourceId);
    if (cached) return cached;
    const grant = await requestValue<StoredGrant | undefined>(
      database.transaction(STORE_NAMES.sourceGrants, "readonly").objectStore(STORE_NAMES.sourceGrants).get(sourceId),
    ).catch(() => undefined);
    if (grant?.handle) this.handles.set(sourceId, grant.handle);
    if (grant?.state) this.states.set(sourceId, grant.state);
    return grant?.handle;
  }

  private async findSourceRecord(database: IDBDatabase, sourceId: SourceId): Promise<SourceRecord | undefined> {
    const projects = await requestValue<import("../../contracts").ProjectWorkspace[]>(
      database.transaction(STORE_NAMES.projects, "readonly").objectStore(STORE_NAMES.projects).getAll(),
    );
    return projects.flatMap((project) => project.sources).find((source) => source.id === sourceId);
  }

  private async saveGrant(database: IDBDatabase, grant: StoredGrant): Promise<void> {
    try {
      const transaction = database.transaction(STORE_NAMES.sourceGrants, "readwrite");
      transaction.objectStore(STORE_NAMES.sourceGrants).put(grant);
      await transactionResult(transaction);
    } catch (error) {
      // Native FileSystemDirectoryHandle values are cloneable. Test doubles are
      // plain objects with methods, so fake-indexeddb raises DataCloneError.
      if (error instanceof DOMException && error.name === "DataCloneError") return;
      throw error;
    }
  }

  private async saveState(
    database: IDBDatabase,
    sourceId: SourceId,
    state: SourceRuntimeState,
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    await this.saveGrant(database, { sourceId, displayName: handle.name, handle, state });
  }

  private toGrant(sourceId: SourceId, handle: FileSystemDirectoryHandle, restored: boolean): SourceGrant {
    return {
      sourceId,
      displayName: handle.name,
      status: this.states.get(sourceId)?.status ?? "ready",
      restored,
    };
  }

  private async readSourcePhotos(database: IDBDatabase, sourceId: SourceId): Promise<PhotoRef[]> {
    return requestValue<PhotoRef[]>(
      database
        .transaction(STORE_NAMES.photoIndex, "readonly")
        .objectStore(STORE_NAMES.photoIndex)
        .index("by-source-path")
        .getAll(IDBKeyRange.bound([sourceId, ""], [sourceId, "\uffff"])),
    );
  }

  private async writePhotos(database: IDBDatabase, photos: readonly PhotoRef[]): Promise<void> {
    const transaction = database.transaction(STORE_NAMES.photoIndex, "readwrite");
    const store = transaction.objectStore(STORE_NAMES.photoIndex);
    for (const photo of photos) store.put(photo);
    await transactionResult(transaction);
  }

  private readPhotoPage(
    database: IDBDatabase,
    sourceId: SourceId,
    cursor: string | undefined,
    limit: number,
  ): Promise<PhotoRef[]> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAMES.photoIndex, "readonly");
      const index = transaction.objectStore(STORE_NAMES.photoIndex).index("by-source-path");
      const range = cursor
        ? IDBKeyRange.bound([sourceId, cursor], [sourceId, "\uffff"], true, false)
        : IDBKeyRange.bound([sourceId, ""], [sourceId, "\uffff"]);
      const request = index.openCursor(
        range,
      );
      const items: PhotoRef[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || items.length >= limit) {
          resolve(items);
          return;
        }
        items.push(cursor.value as PhotoRef);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async readPhotoFile(database: IDBDatabase, photoId: PhotoId): Promise<Result<Blob, SourceError>> {
    const photo = await this.readStoredPhoto(database, photoId).catch(() => undefined);
    if (!photo) return err({ kind: "photo-not-found", photoId });
    if (photo.locationKind === "file-handle") {
      const handle = await this.readFileHandle(database, photoId);
      if (!handle) return err({ kind: "permission-lost", sourceId: photo.sourceId });
      try {
        const permission = await (handle as FileHandleLike).queryPermission?.({ mode: "read" });
        if (permission && permission !== "granted") return err({ kind: "permission-lost", sourceId: photo.sourceId });
        return ok(await handle.getFile());
      } catch (error) {
        if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
          return err({ kind: "permission-lost", sourceId: photo.sourceId });
        }
        return err({ kind: "photo-not-found", photoId });
      }
    }
    const handle = await this.loadHandle(photo.sourceId, database);
    if (!handle) return err({ kind: "permission-lost", sourceId: photo.sourceId });
    try {
      let directory = handle;
      const parts = photo.relativePath.split("/");
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
      return ok(await (await directory.getFileHandle(parts.at(-1)!)).getFile());
    } catch (error) {
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        return err({ kind: "permission-lost", sourceId: photo.sourceId });
      }
      return err({ kind: "photo-not-found", photoId });
    }
  }

  private createLease(key: string, blob: Blob): PreviewLease {
    const cached = this.urlCache.get(key) ?? {
      key,
      blob,
      url: URL.createObjectURL(blob),
      references: 0,
      lastUsed: 0,
    };
    cached.references += 1;
    cached.lastUsed = ++this.urlClock;
    this.urlCache.set(key, cached);
    let released = false;
    return {
      url: cached.url,
      release: () => {
        if (released) return;
        released = true;
        cached.references -= 1;
        cached.lastUsed = ++this.urlClock;
        this.trimUrlCache();
      },
    };
  }

  private trimUrlCache(): void {
    const idle = [...this.urlCache.values()]
      .filter((cached) => cached.references === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed);
    while (this.urlCache.size > URL_CACHE_LIMIT && idle.length) {
      const cached = idle.shift()!;
      this.urlCache.delete(cached.key);
      URL.revokeObjectURL(cached.url);
    }
  }

  private dropCachedUrls(prefix: string): void {
    for (const [key, cached] of this.urlCache) {
      if (!key.startsWith(prefix)) continue;
      URL.revokeObjectURL(cached.url);
      this.urlCache.delete(key);
    }
  }
}

interface ScannedFile {
  readonly relativePath: string;
  readonly handle: FileSystemFileHandle;
}

async function* walkDirectory(
  directory: FileSystemDirectoryHandle,
  prefix = "",
): AsyncIterable<ScannedFile> {
  for await (const [name, handle] of (directory as DirectoryHandleLike).entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      yield* walkDirectory(handle as FileSystemDirectoryHandle, relativePath);
    } else {
      yield { relativePath, handle: handle as FileSystemFileHandle };
    }
  }
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== "function") return { width: 0, height: 0 };
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

async function createThumbnail(file: Blob): Promise<Blob> {
  return createResizedPreview(file, THUMBNAIL_MAX_EDGE);
}

async function createResizedPreview(file: Blob, maxEdge: number): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", 0.82));
}
