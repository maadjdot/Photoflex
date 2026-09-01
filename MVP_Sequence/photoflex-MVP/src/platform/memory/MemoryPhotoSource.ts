import {
  err,
  ok,
  type PhotoId,
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
} from "../../contracts";

interface MemorySourceFixture {
  readonly grant: SourceGrant;
  readonly photos?: readonly PhotoRef[];
  readonly previewUrls?: Readonly<Record<PhotoId, string>>;
}

export class MemoryPhotoSource implements PhotoSource {
  private readonly states = new Map<SourceId, SourceRuntimeState>();
  private readonly removedSourceIds = new Set<SourceId>();

  constructor(private readonly fixtures: readonly MemorySourceFixture[] = []) {
    for (const fixture of fixtures) {
      const photos = fixture.photos ?? [];
      this.states.set(fixture.grant.sourceId, {
        sourceId: fixture.grant.sourceId,
        status: fixture.grant.status,
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
    if (!this.states.has(sourceId)) return err({ kind: "source-not-found", sourceId });
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId);
    this.states.delete(sourceId);
    this.removedSourceIds.add(sourceId);
    return ok({ photoIds: fixture?.photos?.map((photo) => photo.id) ?? [] });
  }

  async *scan(
    sourceId: SourceId,
    signal?: AbortSignal,
  ): AsyncIterable<Result<SourceScanEvent, SourceError>> {
    const fixture = this.fixtures.find(({ grant }) => grant.sourceId === sourceId && !this.removedSourceIds.has(sourceId));
    if (!fixture) {
      yield err({ kind: "source-not-found", sourceId });
      return;
    }
    const photos = fixture.photos ?? [];
    const state = {
      sourceId,
      status: "loading" as const,
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
    if (!fixture) return err({ kind: "source-not-found", sourceId });
    const start = Number(cursor) || 0;
    const photos = fixture.photos ?? [];
    const items = photos.slice(start, start + limit);
    return ok({
      items,
      nextCursor: start + items.length < photos.length ? String(start + items.length) : null,
      issues: [],
    });
  }

  async getPhoto(photoId: PhotoId): Promise<Result<PhotoRef, SourceError>> {
    for (const fixture of this.fixtures) {
      if (this.removedSourceIds.has(fixture.grant.sourceId)) continue;
      const photo = fixture.photos?.find((item) => item.id === photoId);
      if (photo) return ok(photo);
    }
    return err({ kind: "photo-not-found", photoId });
  }

  async thumbnail(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    return this.preview(photoId);
  }

  async sequencePreview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    return this.preview(photoId);
  }

  async preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>> {
    const fixture = this.fixtures.find(({ previewUrls }) => previewUrls?.[photoId]);
    const url = fixture?.previewUrls?.[photoId];
    return url ? ok({ url, release() {} }) : err({ kind: "photo-not-found", photoId });
  }
}
