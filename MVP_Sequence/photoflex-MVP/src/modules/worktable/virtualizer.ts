import type { PhotoId, WorktableDraft, WorktableViewport } from "../../contracts";

export interface WorktableViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Keeps card interaction DOM stable while limiting image leases to cards near
 * the visible canvas. Overscan is measured in screen pixels so it stays useful
 * at every zoom level.
 */
export function visibleWorktablePhotoIds(
  draft: WorktableDraft,
  viewport: WorktableViewport,
  size: WorktableViewportSize,
  overscan = 192,
): ReadonlySet<PhotoId> {
  // An unmeasured (zero) viewport must not mount every photo. Rendering nothing
  // until the stage reports a real size avoids a full-table thumbnail burst.
  if (size.width <= 0 || size.height <= 0) return new Set<PhotoId>();

  const left = (-viewport.originX - overscan) / viewport.zoom;
  const top = (-viewport.originY - overscan) / viewport.zoom;
  const right = (size.width - viewport.originX + overscan) / viewport.zoom;
  const bottom = (size.height - viewport.originY + overscan) / viewport.zoom;

  return new Set(draft.entryOrder.filter((photoId) => {
    const placement = draft.placements[photoId];
    return placement.x + placement.width >= left
      && placement.x <= right
      && placement.y + placement.height >= top
      && placement.y <= bottom;
  }));
}
