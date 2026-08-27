import type { PhotoId } from "../../contracts";

export interface PoolChange {
  readonly ids: readonly PhotoId[];
  readonly added: number;
  readonly existing: number;
}

export function addToPool(
  current: readonly PhotoId[],
  requested: readonly PhotoId[],
): PoolChange {
  const known = new Set(current);
  const ids = [...current];
  let added = 0;
  let existing = 0;

  for (const photoId of requested) {
    if (known.has(photoId)) {
      existing += 1;
      continue;
    }
    known.add(photoId);
    ids.push(photoId);
    added += 1;
  }

  return { ids, added, existing };
}

export function removeFromPool(
  current: readonly PhotoId[],
  requested: readonly PhotoId[],
): readonly PhotoId[] {
  const removed = new Set(requested);
  return current.filter((photoId) => !removed.has(photoId));
}
