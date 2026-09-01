import { describe, expect, it } from "vitest";
import { calculateSequenceStripVirtualRange, SEQUENCE_STRIP_ITEM_GAP } from "./sequenceStripVirtualizer";

describe("sequence strip virtualizer", () => {
  it("returns a bounded overscanned range and stable total width", () => {
    const range = calculateSequenceStripVirtualRange({ itemCount: 1000, viewportWidth: 500, scrollLeft: 5000 });
    expect(range.totalWidth).toBe(1000 * range.itemStride - SEQUENCE_STRIP_ITEM_GAP);
    expect(range.startIndex).toBeLessThanOrEqual(5000 / range.itemStride);
    expect(range.endIndex).toBeGreaterThan(range.startIndex);
    expect(range.endIndex).toBeLessThanOrEqual(1000);
  });
});
