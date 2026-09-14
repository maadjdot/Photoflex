import type { WorktableDraft, WorktableItemId, WorktableViewport } from "../../contracts";

export interface WorktableViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Returns photo ids whose cards intersect the viewport plus a screen-space overscan. */
export function visibleWorktablePhotoIds(
  draft: WorktableDraft,
  viewport: WorktableViewport,
  size: WorktableViewportSize,
  overscan = 192,
): ReadonlySet<WorktableItemId> {
  if (size.width <= 0 || size.height <= 0 || viewport.zoom <= 0) return new Set<WorktableItemId>();
  const left = (-viewport.originX - overscan) / viewport.zoom;
  const top = (-viewport.originY - overscan) / viewport.zoom;
  const right = (size.width - viewport.originX + overscan) / viewport.zoom;
  const bottom = (size.height - viewport.originY + overscan) / viewport.zoom;
  return new Set(draft.entryOrder.filter((photoId) => {
    const placement = draft.placements[photoId];
    return placement.x + placement.width >= left && placement.x <= right
      && placement.y + placement.height >= top && placement.y <= bottom;
  }));
}
