import {
  err,
  ok,
  type PhotoId,
  type DroppedPhotoIngestResult,
  type PhotoPage,
  type PhotoRef,
  type PhotoSource,
  type PreviewLease,
  type Result,
  type RemovedSourceData,
  type SourceRuntimeState,
  type SourceScanEvent,
  type SourceError,
  type SourceGrant,
  type SourceId,
  type SourceRecord,
} from "../../contracts";

interface MemorySourceFixture {
  readonly grant: SourceGrant;
  readonly photos?: readonly PhotoRef[];
  readonly previewUrls?: Readonly<Record<PhotoId, string>>;
  readonly directoryHandle?: FileSystemDirectoryHandle;
}

export class MemoryPhotoSource implements PhotoSource {
  private readonly states = new Map<SourceId, SourceRuntimeState>();
  private readonly removedSourceIds = new Set<SourceId>();
  private readonly importedPhotos = new Map<PhotoId, PhotoRef>();
  private readonly importedHandles = new Map<PhotoId, FileSystemFileHandle>();

  constructor(private readonly fixtures: readonly MemorySourceFixture[] = []) {
    for (const fixture of fixtures) {
      const photos = fixture.photos ?? [];
      this.states.set(fixture.grant.sourceId, {
        sourceId: fixture.grant.sourceId,
        status: fixture.grant.status,
        scanRevision: 0,
        discoveredCount: photos.length,
        indexedCount: photos.length,
        skippedCount: 0,
        failedCount: 0,
      });
    }
  }

  async chooseFolder(
    existingSourceIds: readonly SourceId[],
  ): Promise<Result<SourceGrant, SourceError>> {
    const fixture = this.fixtures.find(({ grant }) => !existingSourceIds.includes(grant.sourceId));
    return fixture ? ok({ ...fixture.grant, restored: false }) : err({ kind: "cancelled" });
  }

  async restoreFolder(sourceId: SourceId): Promise<Result<SourceGrant, SourceError>> {
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId);
    return fixture
      ? ok({ ...fixture.grant, restored: true })
      : err({ kind: "source-not-found", sourceId });
  }

  async removeSource(sourceId: SourceId): Promise<Result<RemovedSourceData, SourceError>> {
    if (!this.states.has(sourceId)) return ok({ photoIds: [] });
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId);
    const importedIds = [...this.importedPhotos.values()].filter((photo) => photo.sourceId === sourceId).map((photo) => photo.id);
    importedIds.forEach((id) => { this.importedPhotos.delete(id); this.importedHandles.delete(id); });
    this.states.delete(sourceId);
    this.removedSourceIds.add(sourceId);
    return ok({ photoIds: [...(fixture?.photos?.map((photo) => photo.id) ?? []), ...importedIds] });
  }

  async *scan(
    sourceId: SourceId,
    signal?: AbortSignal,
  ): AsyncIterable<Result<SourceScanEvent, SourceError>> {
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId && !this.removedSourceIds.has(sourceId));
    if (!fixture && !this.states.has(sourceId)) {
      yield err({ kind: "source-not-found", sourceId });
      return;
    }
    const photos = [...(fixture?.photos ?? []), ...[...this.importedPhotos.values()].filter((photo) => photo.sourceId === sourceId)];
    const state = {
      sourceId,
      status: "loading" as const,
      scanRevision: (this.states.get(sourceId)?.scanRevision ?? 0) + 1,
      discoveredCount: photos.length,
      indexedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
    this.states.set(sourceId, state);
    yield ok({ kind: "progress", state });
    await Promise.resolve();
    if (signal?.aborted) {
      const partial = {
        ...state,
        status: photos.length ? ("partial" as const) : ("empty" as const),
      };
      this.states.set(sourceId, partial);
      yield ok({ kind: "completed", state: partial });
      return;
    }
    const complete = {
      ...state,
      status: photos.length ? ("ready" as const) : ("empty" as const),
      indexedCount: photos.length,
    };
    this.states.set(sourceId, complete);
    yield ok({ kind: "completed", state: complete });
  }

  async getSourceState(sourceId: SourceId): Promise<Result<SourceRuntimeState, SourceError>> {
    const state = this.states.get(sourceId);
    return state ? ok({ ...state }) : err({ kind: "source-not-found", sourceId });
  }

  async listPhotos(
    sourceId: SourceId,
    cursor = "0",
    limit = 100,
  ): Promise<Result<PhotoPage, SourceError>> {
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId && !this.removedSourceIds.has(sourceId));
    if (!fixture && !this.states.has(sourceId)) return err({ kind: "source-not-found", sourceId });
    const start = Number(cursor) || 0;
    const photos = [...(fixture?.photos ?? []), ...[...this.importedPhotos.values()].filter((photo) => photo.sourceId === sourceId)];
    const items = photos.slice(start, start + limit);
    return ok({
      items,
      nextCursor: start + items.length < photos.length ? String(start + items.length) : null,
      issues: [],
    });
  }

  async getPhoto(photoId: PhotoId): Promise<Result<PhotoRef, SourceError>> {
    const imported = this.importedPhotos.get(photoId);
    if (imported && !this.removedSourceIds.has(imported.sourceId)) return ok(imported);
    for (const fixture of this.fixtures) {
      if (this.removedSourceIds.has(fixture.grant.sourceId)) continue;
      const photo = fixture.photos?.find((item) => item.id === photoId);
      if (photo) return ok(photo);
    }
    return err({ kind: "photo-not-found", photoId });
  }

  async ingestDroppedFiles(
    handles: readonly FileSystemHandle[],
    sources: readonly SourceRecord[],
    externalSourceId: SourceId,
  ): Promise<Result<DroppedPhotoIngestResult, SourceError>> {
    const items: DroppedPhotoIngestResult["items"][number][] = [];
    const skipped: DroppedPhotoIngestResult["skipped"][number][] = [];
    for (const handle of handles) {
      if (handle.kind !== "file" || !/\.jpe?g$/i.test(handle.name)) {
        skipped.push({ kind: "unsupported-file", relativePath: handle.name });
        continue;
      }
      let folderSource: SourceRecord | undefined;
      let folderPath: string | undefined;
      for (const source of sources) {
        if (source.removedAt || source.kind === "external-files") continue;
        const directory = this.fixtures.find((fixture) => fixture.grant.sourceId === source.id)?.directoryHandle as (FileSystemDirectoryHandle & { resolve?(entry: FileSystemHandle): Promise<string[] | null> }) | undefined;
        const parts = await directory?.resolve?.(handle);
        if (parts?.length) { folderSource = source; folderPath = parts.join("/"); break; }
      }
      if (folderSource && folderPath) {
        const fixturePhoto = this.fixtures
          .find((fixture) => fixture.grant.sourceId === folderSource!.id)
          ?.photos?.find((photo) => photo.relativePath === folderPath);
        const indexedPhoto = [...this.importedPhotos.values()]
          .find((photo) => photo.sourceId === folderSource!.id && photo.relativePath === folderPath);
        const previous = fixturePhoto ?? indexedPhoto;
        if (previous) {
          items.push({ photo: previous, status: "reused" });
          continue;
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        const id = crypto.randomUUID() as PhotoId;
        const photo: PhotoRef = {
          id,
          sourceId: folderSource.id,
          relativePath: folderPath,
          locationKind: "folder-relative",
          width: 0,
          height: 0,
          fileSize: file.size,
          fileLastModified: file.lastModified,
        };
        this.importedPhotos.set(id, photo);
        items.push({ photo, status: "created" });
        continue;
      }
      let existing: PhotoRef | undefined;
      for (const [id, storedHandle] of this.importedHandles) {
        if (await storedHandle.isSameEntry(handle)) { existing = this.importedPhotos.get(id); break; }
      }
      if (existing) {
        items.push({ photo: existing, status: "reused" });
        continue;
      }
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const id = crypto.randomUUID() as PhotoId;
      const photo: PhotoRef = {
        id,
        sourceId: externalSourceId,
        relativePath: `_external/${id}/${file.name}`,
        locationKind: "file-handle",
        width: 0,
        height: 0,
        fileSize: file.size,
        fileLastModified: file.lastModified,
      };
      this.importedPhotos.set(id, photo);
      this.importedHandles.set(id, fileHandle);
      this.states.set(externalSourceId, {
        sourceId: externalSourceId,
        status: "ready",
        scanRevision: 0,
        discoveredCount: [...this.importedPhotos.values()].filter((item) => item.sourceId === externalSourceId).length,
        indexedCount: [...this.importedPhotos.values()].filter((item) => item.sourceId === externalSourceId).length,
        skippedCount: skipped.length,
        failedCount: 0,
      });
      items.push({ photo, status: "created" });
    }
    return ok({ items, skipped });
  }

  async thumbnail(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    return this.fixturePreview(photoId);
  }

  async derivedPreview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    return this.fixturePreview(photoId);
  }

  async preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    return this.fixturePreview(photoId);
  }

  private fixturePreview(photoId: PhotoId): Result<PreviewLease, SourceError> {
    const fixture = this.fixtures.find(({ previewUrls }) => previewUrls?.[photoId]);
    const url = fixture?.previewUrls?.[photoId];
    return url ? ok({ url, release() {} }) : err({ kind: "photo-not-found", photoId });
  }
}
