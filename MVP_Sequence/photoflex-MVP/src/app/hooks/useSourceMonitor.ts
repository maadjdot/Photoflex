import { useEffect, useState } from "react";
import type { PhotoSource, SourceId, SourceRecord, SourceRuntimeState } from "../../contracts";
import { startSourceScan, subscribeToSourceScan } from "./sourceScanCoordinator";

export function useSourceMonitor(photoSource: PhotoSource, sources: readonly SourceRecord[]) {
  const [states, setStates] = useState<Record<string, SourceRuntimeState>>({});
  const sourceKey = sources.map((source) => source.id).join(",");

  useEffect(() => {
    let active = true;
    const unsubscribers = sources.map((source) => {
      const update = (state: SourceRuntimeState) => {
        if (active) setStates((current) => ({ ...current, [source.id]: state }));
      };
      const unsubscribe = subscribeToSourceScan(photoSource, source.id, update);

      void photoSource.getSourceState(source.id).then((result) => {
        if (!active || !result.ok) return;
        update(result.value);
        if (stateNeedsScan(result.value)) startSourceScan(photoSource, source.id);
      });
      return unsubscribe;
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [photoSource, sourceKey]);

  return {
    states,
    startScan: (sourceId: SourceId) => startSourceScan(photoSource, sourceId),
  };
}

function stateNeedsScan(state: SourceRuntimeState): boolean {
  return state.status === "loading" || (state.status === "ready" && state.indexedCount === 0);
}

export function stateHasPhotos(state?: SourceRuntimeState): boolean {
  return Boolean(state && state.indexedCount > 0);
}

export function totalIndexed(states: Record<string, SourceRuntimeState>): number {
  return Object.values(states).reduce((total, state) => total + state.indexedCount, 0);
}

export function progressPercent(state?: SourceRuntimeState): number {
  if (!state?.discoveredCount) return 0;
  return Math.min(100, Math.round((state.indexedCount / state.discoveredCount) * 100));
}

export function sourceCounts(state?: SourceRuntimeState): string {
  if (!state) return "正在读取…";
  if (state.status === "loading") {
    return `${state.indexedCount} indexed · ${state.discoveredCount} discovered · ${progressPercent(state)}%`;
  }
  return `${state.indexedCount} indexed${state.failedCount ? ` · ${state.failedCount} failed` : ""}${state.skippedCount ? ` · ${state.skippedCount} skipped` : ""}`;
}

export function statusLabel(status: SourceRuntimeState["status"]): string {
  return status.replace("permission-lost", "permission lost").toUpperCase();
}
