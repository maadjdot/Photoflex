import {
  err,
  ok,
  type DerivedPreviewMaxEdge,
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
  type SourceRuntimeState,
  type SourceScanEvent,
} from "../../contracts";
import { openPhotoFlexDatabase, STORE_NAMES } from "./indexedDbSchema";

type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>;

type DirectoryHandleLike = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};

interface BrowserPhotoSourceOptions {
  readonly picker?: DirectoryPicker;
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
const DERIVED_PREVIEW_CACHE_LIMIT = 24;

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
  discoveredCount: 0,
  indexedCount: 0,
  skippedCount: 0,
  failedCount: 0,
});

const isJpeg = (name: string): boolean => /\.(jpe?g)$/i.test(name);

const toSourceError = (): SourceError => ({ kind: "io", retryable: true });

export class BrowserPhotoSource implements PhotoSource {
  private readonly handles = new Map<SourceId, FileSystemDirectoryHandle>();
  private readonly states = new Map<SourceId, SourceRuntimeState>();
  private readonly urlCache = new Map<string, CachedUrl>();
  private readonly thumbnailJobs = new Map<PhotoId, Promise<Result<Blob, SourceError>>>();
  private readonly derivedPreviewJobs = new Map<string, Promise<Result<Blob, SourceError>>>();
  private readonly derivedPreviewCache = new Map<string, CachedDerivedPreview>();
  private readonly thumbnailWaiters: Array<() => void> = [];
  private activeThumbnailJobs = 0;
  private urlClock = 0;
  private readonly picker: DirectoryPicker;
  private readonly database: Promise<Result<IDBDatabase, unknown>>;

  constructor(options: BrowserPhotoSourceOptions = {}) {
    this.picker = options.picker ?? (() => {
      const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: DirectoryPicker })
        .showDirectoryPicker;
      if (!picker) return Promise.reject(new Error("File System Access API unavailable"));
      return picker();
    });
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
    const handle = await this.loadHandle(sourceId, opened.value);
    if (!handle) return err({ kind: "source-not-found", sourceId });

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
        [STORE_NAMES.sourceGrants, STORE_NAMES.photoIndex, STORE_NAMES.photoThumbnails],
        "readwrite",
      );
      transaction.objectStore(STORE_NAMES.sourceGrants).delete(sourceId);
      const photoStore = transaction.objectStore(STORE_NAMES.photoIndex);
      const thumbnailStore = transaction.objectStore(STORE_NAMES.photoThumbnails);
      for (const photo of photos) {
        photoStore.delete(photo.id);
        thumbnailStore.delete(photo.id);
      }
      await transactionResult(transaction);
      this.handles.delete(sourceId);
      this.states.delete(sourceId);
      for (const photo of photos) {
        this.dropCachedUrl(`thumbnail:${photo.id}`);
        this.dropCachedUrl(`preview:${photo.id}`);
        this.thumbnailJobs.delete(photo.id);
        for (const maxEdge of [768, 1536, 2048] as const) {
          const key = `derived:${maxEdge}:${photo.id}`;
          this.dropCachedUrl(key);
          this.derivedPreviewCache.delete(key);
          this.derivedPreviewJobs.delete(key);
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
    const handle = await this.loadHandle(sourceId, opened.value);
    if (!handle) {
      yield err({ kind: "source-not-found", sourceId });
      return;
    }

    const existing = await this.readSourcePhotos(opened.value, sourceId);
    const byPath = new Map(existing.map((photo) => [photo.relativePath, photo]));
    let state: SourceRuntimeState = {
      ...(this.states.get(sourceId) ?? initialState(sourceId, "ready")),
      status: "loading" as const,
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
          batch.push({
            id: previous?.id ?? (crypto.randomUUID() as PhotoId),
            sourceId,
            relativePath: entry.relativePath,
            width: dimensions.width,
            height: dimensions.height,
          });
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
    if (!storedState) return err({ kind: "source-not-found", sourceId });
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
      const photo = await requestValue<PhotoRef | undefined>(
        opened.value
          .transaction(STORE_NAMES.photoIndex, "readonly")
          .objectStore(STORE_NAMES.photoIndex)
          .get(photoId),
      );
      return photo ? ok(photo) : err({ kind: "photo-not-found", photoId });
    } catch {
      return err(toSourceError());
    }
  }

  async thumbnail(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const stored = await requestValue<StoredThumbnail | undefined>(
      opened.value
        .transaction(STORE_NAMES.photoThumbnails, "readonly")
        .objectStore(STORE_NAMES.photoThumbnails)
        .get(photoId),
    ).catch(() => undefined);
    if (stored?.maxEdge === THUMBNAIL_MAX_EDGE) {
      return ok(this.createLease(`thumbnail:${photoId}`, stored.blob));
    }

    let job = this.thumbnailJobs.get(photoId);
    if (!job) {
      job = this.generateThumbnail(opened.value, photoId);
      this.thumbnailJobs.set(photoId, job);
      void job.finally(() => {
        if (this.thumbnailJobs.get(photoId) === job) this.thumbnailJobs.delete(photoId);
      });
    }
    const generated = await job;
    return generated.ok
      ? ok(this.createLease(`thumbnail:${photoId}`, generated.value))
      : generated;
  }

  async preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const file = await this.readPhotoFile(opened.value, photoId);
    return file.ok ? ok(this.createLease(`preview:${photoId}`, file.value)) : err(file.error);
  }

  async derivedPreview(photoId: PhotoId, maxEdge: DerivedPreviewMaxEdge): Promise<Result<PreviewLease, SourceError>> {
    const opened = await this.database;
    if (!opened.ok) return err(toSourceError());
    const key = `derived:${maxEdge}:${photoId}`;
    const cached = this.derivedPreviewCache.get(key);
    if (cached) {
      cached.lastUsed = ++this.urlClock;
      return ok(this.createLease(key, cached.blob));
    }

    let job = this.derivedPreviewJobs.get(key);
    if (!job) {
      job = this.generateDerivedPreview(opened.value, photoId, maxEdge);
      this.derivedPreviewJobs.set(key, job);
      void job.finally(() => {
        if (this.derivedPreviewJobs.get(key) === job) this.derivedPreviewJobs.delete(key);
      });
    }
    const generated = await job;
    if (!generated.ok) return generated;
    this.derivedPreviewCache.set(key, { blob: generated.value, lastUsed: ++this.urlClock });
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

  private async generateThumbnail(database: IDBDatabase, photoId: PhotoId): Promise<Result<Blob, SourceError>> {
    await this.acquireThumbnailSlot();
    try {
      const file = await this.readPhotoFile(database, photoId);
      if (!file.ok) return file;
      const blob = await createThumbnail(file.value);
      const transaction = database.transaction(STORE_NAMES.photoThumbnails, "readwrite");
      transaction.objectStore(STORE_NAMES.photoThumbnails).put({ photoId, blob, maxEdge: THUMBNAIL_MAX_EDGE } satisfies StoredThumbnail);
      await transactionResult(transaction);
      return ok(blob);
    } catch {
      return err({ kind: "preview-unavailable", photoId });
    } finally {
      this.releaseThumbnailSlot();
    }
  }

  private async generateDerivedPreview(database: IDBDatabase, photoId: PhotoId, maxEdge: number): Promise<Result<Blob, SourceError>> {
    await this.acquireThumbnailSlot();
    try {
      const file = await this.readPhotoFile(database, photoId);
      if (!file.ok) return file;
      return ok(await createResizedPreview(file.value, maxEdge));
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
    const photo = await requestValue<PhotoRef | undefined>(
      database.transaction(STORE_NAMES.photoIndex, "readonly").objectStore(STORE_NAMES.photoIndex).get(photoId),
    ).catch(() => undefined);
    if (!photo) return err({ kind: "photo-not-found", photoId });
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
    while (this.urlCache.size > 16 && idle.length) {
      const cached = idle.shift()!;
      this.urlCache.delete(cached.key);
      URL.revokeObjectURL(cached.url);
    }
  }

  private dropCachedUrl(key: string): void {
    const cached = this.urlCache.get(key);
    if (!cached) return;
    URL.revokeObjectURL(cached.url);
    this.urlCache.delete(key);
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
