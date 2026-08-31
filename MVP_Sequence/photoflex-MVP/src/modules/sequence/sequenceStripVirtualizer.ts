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

export const SEQUENCE_STRIP_ITEM_WIDTH = 101;
export const SEQUENCE_STRIP_ITEM_GAP = 9;
const DEFAULT_OVERSCAN_ITEMS = 3;

export function calculateSequenceStripVirtualRange({
  itemCount,
  viewportWidth,
  scrollLeft,
  overscanItems = DEFAULT_OVERSCAN_ITEMS,
}: SequenceStripVirtualRangeInput): SequenceStripVirtualRange {
  const count = Math.max(0, Math.floor(itemCount));
  const itemStride = SEQUENCE_STRIP_ITEM_WIDTH + SEQUENCE_STRIP_ITEM_GAP;
  const totalWidth = count ? count * itemStride - SEQUENCE_STRIP_ITEM_GAP : 0;
  if (!count || viewportWidth <= 0) return { startIndex: 0, endIndex: 0, totalWidth, itemStride };

  const viewport = Math.max(0, viewportWidth);
  const maxScrollLeft = Math.max(0, totalWidth - viewport);
  const scroll = Math.min(maxScrollLeft, Math.max(0, scrollLeft));
  const overscan = Math.max(0, Math.floor(overscanItems));
  const firstVisible = Math.floor(scroll / itemStride);
  const lastVisibleExclusive = Math.ceil((scroll + viewport) / itemStride);
  return {
    startIndex: Math.max(0, firstVisible - overscan),
    endIndex: Math.min(count, lastVisibleExclusive + overscan),
    totalWidth,
    itemStride,
  };
}
