import type { PhotoSource, ProjectStore } from "../../contracts";
import { beginAnalyticsOperation, failureKind, type Analytics } from "./analytics";
const sourceAnalytics = new WeakMap<PhotoSource, Analytics>();
export const analyticsForPhotoSource = (source: PhotoSource) => sourceAnalytics.get(source);

function decorate<T extends object>(target: T, overrides: Partial<T>): T {
  return new Proxy(target, { get(object, key) { const value = Reflect.get(overrides, key) ?? Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value; } });
}

export function instrumentProjectStore(store: ProjectStore, analytics?: Analytics): ProjectStore {
  if (!analytics) return store;
  const record = (track: Analytics["track"], success: boolean, name: "project_created" | "sequence_saved", feature: "project" | "sequence", started: number, kind?: string, count?: number) => {
    track(success ? name : "operation_failed", feature, { duration_ms: Date.now() - started, ...(count !== undefined ? { count } : {}), ...(!success ? { error_kind: failureKind(kind) } : {}) });
  };
  return decorate(store, {
    async createProject(input) {
      const start = Date.now();
      const track = analytics.capture?.() ?? analytics.track.bind(analytics);
      const result = await store.createProject(input);
      record(track, result.ok, "project_created", "project", start, result.ok ? undefined : result.error.kind);
      return result;
    },
    async saveSequence(sequence, revision) {
      const start = Date.now();
      const track = analytics.capture?.() ?? analytics.track.bind(analytics);
      const result = await store.saveSequence(sequence, revision);
      record(track, result.ok, "sequence_saved", "sequence", start, result.ok ? undefined : result.error.kind, sequence.items.length);
      return result;
    },
    async createSequence(projectId, revision, sequence, version, draft) {
      const start = Date.now();
      const track = analytics.capture?.() ?? analytics.track.bind(analytics);
      const result = await store.createSequence(projectId, revision, sequence, version, draft);
      record(track, result.ok, "sequence_saved", "sequence", start, result.ok ? undefined : result.error.kind, sequence.items.length);
      return result;
    },
  });
}

export function instrumentPhotoSource(source: PhotoSource, analytics?: Analytics): PhotoSource {
  if (!analytics) return source;
  const imports = new Map<string, Analytics["track"]>();
  const decorated = decorate(source, {
    async chooseFolder(existing) {
      const track = analytics.capture?.() ?? analytics.track.bind(analytics);
      const result = await source.chooseFolder(existing);
      if (result.ok && !existing.includes(result.value.sourceId)) imports.set(result.value.sourceId, track);
      else if (!result.ok) track("operation_failed", "photo_import", { error_kind: failureKind(result.error.kind) });
      return result;
    },
    async *scan(sourceId, signal) {
      const track = imports.get(sourceId); imports.delete(sourceId);
      const operation = track ? beginAnalyticsOperation({ track, setUser() {} }, "photo_import_started", "photo_import") : undefined;
      try {
        for await (const result of source.scan(sourceId, signal)) {
          if (!result.ok) operation?.finish(false, { error_kind: failureKind(result.error.kind) });
          else if (result.value.kind === "completed") {
            const state = result.value.state;
            const success = !signal?.aborted && (state.status === "ready" || state.status === "partial") && state.indexedCount > 0;
            operation?.finish(success, { count: state.indexedCount, failed_count: state.failedCount, error_kind: success ? undefined : signal?.aborted ? "cancelled" : state.status === "empty" ? "empty" : state.failedCount ? "partial" : "unavailable" });
          }
          yield result;
        }
      } catch (error) { operation?.finish(false, { error_kind: "unknown" }); throw error; }
      finally { operation?.finish(false, { error_kind: signal?.aborted ? "cancelled" : "unknown" }); }
    },
    async ingestDroppedFiles(handles, sources, sourceId) {
      const operation = beginAnalyticsOperation(analytics, "photo_import_started", "photo_import");
      try {
        const result = await source.ingestDroppedFiles(handles, sources, sourceId);
        const count = result.ok ? result.value.items.length : 0;
        operation.finish(result.ok && count > 0, { count, failed_count: result.ok ? result.value.skipped.length : 0, error_kind: result.ok ? count ? undefined : "empty" : failureKind(result.error.kind) });
        return result;
      } catch (error) { operation.finish(false, { error_kind: "unknown" }); throw error; }
    },
  });
  sourceAnalytics.set(decorated, analytics);
  return decorated;
}
