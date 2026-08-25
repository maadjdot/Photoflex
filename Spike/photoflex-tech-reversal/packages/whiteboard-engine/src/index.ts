export interface WhiteboardViewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export interface WhiteboardItem {
  photoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface WhiteboardSnapshot {
  viewport: WhiteboardViewport;
  items: Record<string, WhiteboardItem>;
  selectedIds: string[];
}

export interface WhiteboardState extends WhiteboardSnapshot {
  /** Stable identity of the photo set this board was opened with. */
  sourcePhotoIds: string[];
  entrySnapshot: WhiteboardSnapshot;
  dirty: boolean;
}

export type WhiteboardAction =
  | { type: "select"; ids: string[] }
  | { type: "move-selection"; dx: number; dy: number }
  | { type: "move-items"; ids: string[]; dx: number; dy: number }
  | { type: "set-item"; id: string; patch: Partial<Omit<WhiteboardItem, "photoId">> }
  | { type: "resize-item"; id: string; width: number; height: number }
  | { type: "remove-items"; ids: string[] }
  | { type: "set-viewport"; zoom: number; scrollX: number; scrollY: number }
  | { type: "set-viewport-ephemeral"; zoom: number; scrollX: number; scrollY: number };

export interface WhiteboardCommit {
  state: WhiteboardState;
  sequenceOrder: string[];
}

export interface WhiteboardRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function cloneItems(items: Record<string, WhiteboardItem>): Record<string, WhiteboardItem> {
  return Object.fromEntries(Object.entries(items).map(([id, item]) => [id, { ...item }]));
}

function snapshotOf(state: WhiteboardSnapshot): WhiteboardSnapshot {
  return {
    viewport: { ...state.viewport },
    items: cloneItems(state.items),
    selectedIds: [...state.selectedIds]
  };
}

export function createWhiteboardState(photoIds: readonly string[]): WhiteboardState {
  if (new Set(photoIds).size !== photoIds.length) throw new Error("Whiteboard photo IDs must be unique");
  const usePrototypeLayout = photoIds.length <= 60;
  const columns = Math.max(1, Math.ceil(Math.sqrt(photoIds.length * (5200 / 3600))));
  const rows = Math.max(1, Math.ceil(photoIds.length / columns));
  const items = Object.fromEntries(photoIds.map((photoId, index) => [photoId, {
    photoId,
    x: usePrototypeLayout ? (index % 20) * 220 : Math.floor((index % columns) * 5200 / columns) + 4,
    y: usePrototypeLayout ? Math.floor(index / 20) * 180 : Math.floor(Math.floor(index / columns) * 3600 / rows) + 4,
    width: usePrototypeLayout ? 200 : Math.max(1, Math.floor(((index % columns) + 1) * 5200 / columns) - Math.floor((index % columns) * 5200 / columns) - 8),
    height: usePrototypeLayout ? 150 : Math.max(1, Math.floor((Math.floor(index / columns) + 1) * 3600 / rows) - Math.floor(Math.floor(index / columns) * 3600 / rows) - 8),
    zIndex: index
  }]));
  const base: WhiteboardSnapshot = {
    viewport: { zoom: 0.75, scrollX: 0, scrollY: 0 },
    items,
    selectedIds: []
  };
  return { ...snapshotOf(base), sourcePhotoIds: [...photoIds], entrySnapshot: snapshotOf(base), dirty: false };
}

/**
 * Prevent the renderer from combining a stale layout with a new photo set.
 * The live item set may be a subset because the user can delete photos; the
 * stable source identity identifies the photo set that this whiteboard opened with.
 */
export function whiteboardStateMatchesIds(state: WhiteboardState, photoIds: readonly string[]): boolean {
  const expectedIds = new Set(photoIds);
  const sourceIds = state.sourcePhotoIds ?? Object.keys(state.entrySnapshot?.items ?? {});
  const sourceMatches = sourceIds.length === photoIds.length && photoIds.every((photoId) => sourceIds.includes(photoId));
  return sourceMatches && Object.keys(state.items).every((photoId) => expectedIds.has(photoId));
}

export function selectItemsInRect(state: WhiteboardSnapshot, rect: WhiteboardRect): string[] {
  const left = Math.min(rect.left, rect.right);
  const right = Math.max(rect.left, rect.right);
  const top = Math.min(rect.top, rect.bottom);
  const bottom = Math.max(rect.top, rect.bottom);
  return Object.values(state.items)
    .filter((item) => item.x < right && item.x + item.width > left && item.y < bottom && item.y + item.height > top)
    .sort((a, b) => a.zIndex - b.zIndex || a.photoId.localeCompare(b.photoId))
    .map((item) => item.photoId);
}

function moveItems(state: WhiteboardState, ids: readonly string[], dx: number, dy: number): WhiteboardState {
  const wanted = new Set(ids);
  const items = Object.fromEntries(Object.entries(state.items).map(([id, item]) => [
    id,
    wanted.has(id) ? { ...item, x: item.x + dx, y: item.y + dy } : item
  ]));
  return { ...state, items, dirty: ids.some((id) => id in state.items) || state.dirty };
}

export function reduceWhiteboard(state: WhiteboardState, action: WhiteboardAction): WhiteboardState {
  switch (action.type) {
    case "select":
      return { ...state, selectedIds: action.ids.filter((id) => id in state.items) };
    case "move-selection":
      return moveItems(state, state.selectedIds, action.dx, action.dy);
    case "move-items":
      return moveItems(state, action.ids, action.dx, action.dy);
    case "set-item": {
      const item = state.items[action.id];
      if (!item) throw new Error(`Unknown whiteboard item: ${action.id}`);
      return { ...state, items: { ...state.items, [action.id]: { ...item, ...action.patch } }, dirty: true };
    }
    case "resize-item": {
      if (action.width <= 0 || action.height <= 0) throw new Error("Whiteboard item dimensions must be positive");
      return reduceWhiteboard(state, { type: "set-item", id: action.id, patch: { width: action.width, height: action.height } });
    }
    case "remove-items": {
      const removed = new Set(action.ids);
      const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => !removed.has(id)));
      return {
        ...state,
        items,
        selectedIds: state.selectedIds.filter((id) => !removed.has(id)),
        dirty: Object.keys(items).length !== Object.keys(state.items).length || state.dirty
      };
    }
    case "set-viewport":
      if (action.zoom < 0.25 || action.zoom > 2) throw new Error("Whiteboard zoom must be between 25% and 200%");
      return { ...state, viewport: { zoom: action.zoom, scrollX: action.scrollX, scrollY: action.scrollY }, dirty: true };
    case "set-viewport-ephemeral":
      if (action.zoom < 0.25 || action.zoom > 2) throw new Error("Whiteboard zoom must be between 25% and 200%");
      return { ...state, viewport: { zoom: action.zoom, scrollX: action.scrollX, scrollY: action.scrollY } };
  }
}

export function deriveSequenceOrder(state: WhiteboardSnapshot, rowTolerance = 120): string[] {
  const remaining = Object.values(state.items).sort((a, b) => {
    const centerAY = a.y + a.height / 2;
    const centerBY = b.y + b.height / 2;
    return centerAY - centerBY || a.x - b.x || a.photoId.localeCompare(b.photoId);
  });
  const rows: WhiteboardItem[][] = [];

  for (const item of remaining) {
    const center = item.y + item.height / 2;
    const row = rows.find((candidate) => {
      const rowCenter = candidate.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / candidate.length;
      return Math.abs(center - rowCenter) <= rowTolerance;
    });
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.photoId.localeCompare(b.photoId)).map((item) => item.photoId));
}

export function commitWhiteboard(state: WhiteboardState): WhiteboardCommit {
  const committed = snapshotOf(state);
  return {
    sequenceOrder: deriveSequenceOrder(committed),
    state: { ...committed, sourcePhotoIds: [...state.sourcePhotoIds], entrySnapshot: snapshotOf(committed), dirty: false }
  };
}

export function discardWhiteboard(state: WhiteboardState): WhiteboardState {
  const restored = snapshotOf(state.entrySnapshot);
  return { ...restored, sourcePhotoIds: [...state.sourcePhotoIds], entrySnapshot: snapshotOf(restored), dirty: false };
}

export function visibleWhiteboardItems(
  state: WhiteboardSnapshot,
  viewportWidth: number,
  viewportHeight: number,
  overscanScreens = 2,
  maxItems = 500
): WhiteboardItem[] {
  const { zoom, scrollX, scrollY } = state.viewport;
  const marginX = (viewportWidth / zoom) * overscanScreens;
  const marginY = (viewportHeight / zoom) * overscanScreens;
  const left = scrollX - marginX;
  const top = scrollY - marginY;
  const right = scrollX + viewportWidth / zoom + marginX;
  const bottom = scrollY + viewportHeight / zoom + marginY;
  const candidates = Object.values(state.items).filter((item) =>
    item.x + item.width >= left && item.x <= right && item.y + item.height >= top && item.y <= bottom
  );
  if (candidates.length <= maxItems) return candidates;

  // Keep the DOM bounded at low zoom levels. Selection still operates on the
  // complete state through selectItemsInRect; this list only controls which
  // photo nodes are mounted and therefore which photos need decoding.
  const selected = new Set(state.selectedIds);
  return candidates
    .sort((a, b) => Number(selected.has(b.photoId)) - Number(selected.has(a.photoId)) || a.zIndex - b.zIndex)
    .slice(0, maxItems);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableStateHash(state: WhiteboardState): string {
  const input = canonical(state);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
