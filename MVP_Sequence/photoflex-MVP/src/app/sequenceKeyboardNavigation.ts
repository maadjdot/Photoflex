import type { SequenceItemId } from "../contracts";

export type SequenceArrow = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Finds the nearest Sequence item in a visual arrow direction. */
export function sequenceItemInDirection(
  container: HTMLElement | null,
  itemIds: readonly SequenceItemId[],
  currentId: SequenceItemId | undefined,
  direction: SequenceArrow,
): SequenceItemId | undefined {
  if (!itemIds.length) return undefined;
  const currentIndex = currentId ? itemIds.indexOf(currentId) : -1;
  if (!container || currentIndex < 0) return itemIds[0];
  const current = [...container.querySelectorAll<HTMLElement>("[data-item-id]")]
    .find((element) => element.dataset.itemId === currentId);
  if (!current) return itemIds[Math.max(0, currentIndex + (direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1))];
  const currentRect = current.getBoundingClientRect();
  const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
  const candidates = [...container.querySelectorAll<HTMLElement>("[data-item-id]")]
    .map((element) => {
      const id = element.dataset.itemId as SequenceItemId | undefined;
      const rect = element.getBoundingClientRect();
      return id ? { id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
    })
    .filter((item): item is { id: SequenceItemId; x: number; y: number } => item !== undefined && item.id !== currentId);
  const directional = candidates.filter((item) => {
    if (direction === "ArrowLeft") return item.x < currentCenter.x - 2;
    if (direction === "ArrowRight") return item.x > currentCenter.x + 2;
    if (direction === "ArrowUp") return item.y < currentCenter.y - 2;
    return item.y > currentCenter.y + 2;
  });
  directional.sort((left, right) => {
    const leftPrimary = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(left.x - currentCenter.x) : Math.abs(left.y - currentCenter.y);
    const rightPrimary = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(right.x - currentCenter.x) : Math.abs(right.y - currentCenter.y);
    const leftCross = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(left.y - currentCenter.y) : Math.abs(left.x - currentCenter.x);
    const rightCross = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(right.y - currentCenter.y) : Math.abs(right.x - currentCenter.x);
    return leftPrimary - rightPrimary || leftCross - rightCross;
  });
  if (directional[0]) return directional[0].id;
  const fallbackOffset = direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1;
  return itemIds[Math.max(0, Math.min(itemIds.length - 1, currentIndex + fallbackOffset))] ?? itemIds[0];
}
