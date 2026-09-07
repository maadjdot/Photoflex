import { describe, expect, it } from "vitest";
import { calculateSequenceStripVirtualRange, sequenceStripInsertionIndex, SEQUENCE_STRIP_ITEM_GAP, SEQUENCE_STRIP_ITEM_WIDTH, TABLE_SEQUENCE_STRIP_ITEM_GAP, TABLE_SEQUENCE_STRIP_ITEM_WIDTH } from "./sequenceStripVirtualizer";

describe("sequence strip virtualizer", () => {
  it("returns a bounded overscanned range and stable total width", () => {
    const range = calculateSequenceStripVirtualRange({ itemCount: 1000, viewportWidth: 500, scrollLeft: 5000 });
    expect(range.totalWidth).toBe(1000 * range.itemStride - SEQUENCE_STRIP_ITEM_GAP);
    expect(range.startIndex).toBeLessThanOrEqual(5000 / range.itemStride);
    expect(range.endIndex).toBeGreaterThan(range.startIndex);
    expect(range.endIndex).toBeLessThanOrEqual(1000);
  });

  it("calculates insertion targets without reading item DOM rectangles", () => {
    const stride = SEQUENCE_STRIP_ITEM_WIDTH + SEQUENCE_STRIP_ITEM_GAP;
    expect(sequenceStripInsertionIndex(100, 0, 0, 10, 72)).toBe(0);
    expect(sequenceStripInsertionIndex(72 + stride + 4, 0, 0, 10, 72)).toBe(1);
    expect(sequenceStripInsertionIndex(72 + stride * 20, 0, 0, 10, 72)).toBe(10);
  });

  it("keeps a long Table Sequence Order strip virtualized at 128px with 16px gaps", () => {
    const range = calculateSequenceStripVirtualRange({
      itemCount: 40,
      viewportWidth: 720,
      scrollLeft: 3200,
      itemWidth: TABLE_SEQUENCE_STRIP_ITEM_WIDTH,
      itemGap: TABLE_SEQUENCE_STRIP_ITEM_GAP,
    });
    expect(range.itemStride).toBe(144);
    expect(range.totalWidth).toBe(40 * 144 - 16);
    expect(range.startIndex).toBeGreaterThan(0);
    expect(range.endIndex).toBeLessThanOrEqual(40);
    expect(range.endIndex - range.startIndex).toBeLessThan(14);
  });
});
