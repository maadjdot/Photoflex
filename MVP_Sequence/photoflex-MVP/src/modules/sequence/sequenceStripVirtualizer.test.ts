import { describe, expect, it } from "vitest";
import { calculateSequenceStripVirtualRange } from "./sequenceStripVirtualizer";

describe("calculateSequenceStripVirtualRange", () => {
  it("returns only visible items plus bounded overscan", () => {
    expect(calculateSequenceStripVirtualRange({
      itemCount: 500,
      viewportWidth: 550,
      scrollLeft: 11_000,
      overscanItems: 2,
    })).toEqual({
      startIndex: 98,
      endIndex: 107,
      totalWidth: 54_991,
      itemStride: 110,
    });
  });

  it("renders nothing before measurement and clamps the end", () => {
    expect(calculateSequenceStripVirtualRange({ itemCount: 500, viewportWidth: 0, scrollLeft: 0 }).endIndex).toBe(0);
    const end = calculateSequenceStripVirtualRange({ itemCount: 7, viewportWidth: 330, scrollLeft: 10_000, overscanItems: 0 });
    expect(end.startIndex).toBe(3);
    expect(end.endIndex).toBe(7);
  });
});
