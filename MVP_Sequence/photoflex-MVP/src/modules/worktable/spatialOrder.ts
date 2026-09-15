import type { PhotoId, WorktableDraft, WorktableItemId, WorktablePlacement } from "../../contracts";

interface SpatialPhoto {
  readonly id: WorktableItemId;
  readonly placement: WorktablePlacement;
  readonly entryIndex: number;
}

/**
 * Converts a Table selection into visual reading order. Horizontal position
 * wins whenever two photos overlap vertically. A vertical constraint exists
 * only when one photo's top is at or below the other photo's bottom edge.
 */
export function orderPhotoIdsByTablePosition(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): PhotoId[] {
  return orderWorktableItemIdsByTablePosition(draft, photoIds).map((id) => draft.placements[id].photoId);
}

/** Keeps distinct Table occurrences identifiable while applying visual order. */
export function orderWorktableItemIdsByTablePosition(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): WorktableItemId[] {
  const requested = new Set(photoIds);
  const positioned = draft.entryOrder
    .map((id, entryIndex) => ({ id, entryIndex, placement: draft.placements[id] }))
    .filter((item): item is SpatialPhoto => requested.has(item.id) && Boolean(item.placement));
  const byId = new Map(positioned.map((item) => [item.id, item]));
  const outgoing = new Map(positioned.map((item) => [item.id, new Set<WorktableItemId>()]));
  const indegree = new Map(positioned.map((item) => [item.id, 0]));
  const addBefore = (before: WorktableItemId, after: WorktableItemId) => {
    const targets = outgoing.get(before)!;
    if (targets.has(after)) return;
    targets.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  };

  for (let leftIndex = 0; leftIndex < positioned.length; leftIndex += 1) {
    const left = positioned[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < positioned.length; rightIndex += 1) {
      const right = positioned[rightIndex];
      const leftBottom = left.placement.y + left.placement.height;
      const rightBottom = right.placement.y + right.placement.height;
      if (left.placement.y >= rightBottom) addBefore(right.id, left.id);
      else if (right.placement.y >= leftBottom) addBefore(left.id, right.id);
    }
  }

  const horizontalOrder = (left: SpatialPhoto, right: SpatialPhoto) => (
    left.placement.x - right.placement.x
    || left.placement.y - right.placement.y
    || left.entryIndex - right.entryIndex
  );
  const available = positioned.filter((item) => indegree.get(item.id) === 0);
  const ordered: WorktableItemId[] = [];
  while (available.length) {
    available.sort(horizontalOrder);
    const next = available.shift()!;
    ordered.push(next.id);
    for (const targetId of outgoing.get(next.id) ?? []) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) available.push(byId.get(targetId)!);
    }
  }

  return ordered;
}
