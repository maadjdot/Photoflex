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
