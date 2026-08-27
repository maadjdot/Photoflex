import type { PhotoSource, SourceId, SourceRuntimeState } from "../../contracts";

type ScanListener = (state: SourceRuntimeState) => void;

interface Coordinator {
  readonly runs: Map<SourceId, AbortController>;
  readonly listeners: Map<SourceId, Set<ScanListener>>;
}

const coordinators = new WeakMap<PhotoSource, Coordinator>();

function coordinatorFor(photoSource: PhotoSource): Coordinator {
  let coordinator = coordinators.get(photoSource);
  if (!coordinator) {
    coordinator = { runs: new Map(), listeners: new Map() };
    coordinators.set(photoSource, coordinator);
  }
  return coordinator;
}

export function subscribeToSourceScan(
  photoSource: PhotoSource,
  sourceId: SourceId,
  listener: ScanListener,
): () => void {
  const coordinator = coordinatorFor(photoSource);
  const listeners = coordinator.listeners.get(sourceId) ?? new Set<ScanListener>();
  listeners.add(listener);
  coordinator.listeners.set(sourceId, listeners);

  return () => {
    listeners.delete(listener);
    if (!listeners.size) coordinator.listeners.delete(sourceId);
  };
}

export function startSourceScan(photoSource: PhotoSource, sourceId: SourceId): void {
  const coordinator = coordinatorFor(photoSource);
  if (coordinator.runs.has(sourceId)) return;

  const controller = new AbortController();
  coordinator.runs.set(sourceId, controller);
  void (async () => {
    try {
      for await (const result of photoSource.scan(sourceId, controller.signal)) {
        const state = result.ok
          ? result.value.state
          : {
              sourceId,
              status: "error" as const,
              discoveredCount: 0,
              indexedCount: 0,
              skippedCount: 0,
              failedCount: 0,
              errorMessage: "扫描失败，请重试。",
            };
        coordinator.listeners.get(sourceId)?.forEach((listener) => listener(state));
        if (!result.ok) break;
      }
    } finally {
      coordinator.runs.delete(sourceId);
    }
  })();
}

export function stopSourceScan(photoSource: PhotoSource, sourceId: SourceId): void {
  const coordinator = coordinatorFor(photoSource);
  coordinator.runs.get(sourceId)?.abort();
  coordinator.runs.delete(sourceId);
}
