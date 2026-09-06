export interface SequenceStripVirtualRangeInput {
  readonly itemCount: number;
  readonly viewportWidth: number;
  readonly scrollLeft: number;
  readonly overscanItems?: number;
  readonly itemWidth?: number;
  readonly itemGap?: number;
}

export interface SequenceStripVirtualRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalWidth: number;
  readonly itemStride: number;
}

// Keep the Sequence page's established geometry as the default. Table's
// larger review geometry is passed explicitly by SequenceOrderPanel.
export const SEQUENCE_STRIP_ITEM_WIDTH = 140;
export const SEQUENCE_STRIP_ITEM_GAP = 12;
export const TABLE_SEQUENCE_STRIP_ITEM_WIDTH = 148;
export const TABLE_SEQUENCE_STRIP_ITEM_GAP = 16;

/** Converts a pointer coordinate in the strip viewport into an insertion index. */
export function sequenceStripInsertionIndex(
  clientX: number,
  viewportLeft: number,
  scrollLeft: number,
  itemCount: number,
  leadingPadding = 0,
  itemWidth = SEQUENCE_STRIP_ITEM_WIDTH,
  itemGap = SEQUENCE_STRIP_ITEM_GAP,
): number {
  const count = Math.max(0, Math.floor(itemCount));
  if (!count) return 0;
  const localX = clientX - viewportLeft + Math.max(0, scrollLeft) - Math.max(0, leadingPadding);
  const width = Math.max(1, itemWidth);
  const gap = Math.max(0, itemGap);
  const index = Math.floor((localX + width / 2) / (width + gap));
  return Math.max(0, Math.min(count, index));
}

export function calculateSequenceStripVirtualRange({
  itemCount,
  viewportWidth,
  scrollLeft,
  overscanItems = 3,
  itemWidth = SEQUENCE_STRIP_ITEM_WIDTH,
  itemGap = SEQUENCE_STRIP_ITEM_GAP,
}: SequenceStripVirtualRangeInput): SequenceStripVirtualRange {
  const count = Math.max(0, Math.floor(itemCount));
  const width = Math.max(1, itemWidth);
  const gap = Math.max(0, itemGap);
  const itemStride = width + gap;
  const totalWidth = count ? count * itemStride - gap : 0;
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
