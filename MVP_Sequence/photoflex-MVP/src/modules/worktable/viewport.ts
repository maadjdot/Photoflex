import type { WorktablePoint, WorktableViewport } from "../../contracts";

export const MIN_WORKTABLE_ZOOM = 0.25;
export const MAX_WORKTABLE_ZOOM = 3;

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
}

export function clampWorktableZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_WORKTABLE_ZOOM, Math.max(MIN_WORKTABLE_ZOOM, zoom));
}

export function screenToWorld(
  screen: WorktablePoint,
  rect: ViewportRect,
  viewport: WorktableViewport,
): WorktablePoint {
  return {
    x: (screen.x - rect.left - viewport.originX) / viewport.zoom,
    y: (screen.y - rect.top - viewport.originY) / viewport.zoom,
  };
}

export function worldToScreen(
  world: WorktablePoint,
  rect: ViewportRect,
  viewport: WorktableViewport,
): WorktablePoint {
  return {
    x: rect.left + viewport.originX + world.x * viewport.zoom,
    y: rect.top + viewport.originY + world.y * viewport.zoom,
  };
}

export function zoomAroundScreenPoint(
  viewport: WorktableViewport,
  screen: WorktablePoint,
  rect: ViewportRect,
  requestedZoom: number,
): WorktableViewport {
  const zoom = clampWorktableZoom(requestedZoom);
  const world = screenToWorld(screen, rect, viewport);
  return {
    zoom,
    originX: screen.x - rect.left - world.x * zoom,
    originY: screen.y - rect.top - world.y * zoom,
  };
}
