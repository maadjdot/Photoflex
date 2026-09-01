export interface SequenceStripVirtualRangeInput {
  readonly itemCount: number;
  readonly viewportWidth: number;
  readonly scrollLeft: number;
  readonly overscanItems?: number;
}

export interface SequenceStripVirtualRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalWidth: number;
  readonly itemStride: number;
}

export const SEQUENCE_STRIP_ITEM_WIDTH = 140;
export const SEQUENCE_STRIP_ITEM_GAP = 12;

/** Converts a pointer coordinate in the strip viewport into an insertion index. */
export function sequenceStripInsertionIndex(
  clientX: number,
  viewportLeft: number,
  scrollLeft: number,
  itemCount: number,
  leadingPadding = 0,
): number {
  const count = Math.max(0, Math.floor(itemCount));
  if (!count) return 0;
  const localX = clientX - viewportLeft + Math.max(0, scrollLeft) - Math.max(0, leadingPadding);
  const index = Math.floor((localX + SEQUENCE_STRIP_ITEM_WIDTH / 2) / (SEQUENCE_STRIP_ITEM_WIDTH + SEQUENCE_STRIP_ITEM_GAP));
  return Math.max(0, Math.min(count, index));
}

export function calculateSequenceStripVirtualRange({
  itemCount,
  viewportWidth,
  scrollLeft,
  overscanItems = 3,
}: SequenceStripVirtualRangeInput): SequenceStripVirtualRange {
  const count = Math.max(0, Math.floor(itemCount));
  const itemStride = SEQUENCE_STRIP_ITEM_WIDTH + SEQUENCE_STRIP_ITEM_GAP;
  const totalWidth = count ? count * itemStride - SEQUENCE_STRIP_ITEM_GAP : 0;
  if (!count || viewportWidth <= 0) return { startIndex: 0, endIndex: 0, totalWidth, itemStride };
  const scroll = Math.max(0, Math.min(Math.max(0, totalWidth - viewportWidth), scrollLeft));
  const overscan = Math.max(0, Math.floor(overscanItems));
  return {
    startIndex: Math.max(0, Math.floor(scroll / itemStride) - overscan),
    endIndex: Math.min(count, Math.ceil((scroll + viewportWidth) / itemStride) + overscan),
    totalWidth,
    itemStride,
  };
}
