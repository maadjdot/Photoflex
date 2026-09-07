import { describe, expect, it } from "vitest";
import { calculateContactSheetVirtualGrid } from "./contactSheetVirtualizer";

describe("calculateContactSheetVirtualGrid", () => {
  it("计算固定行高网格在视口中的照片范围", () => {
    const grid = calculateContactSheetVirtualGrid({
      photoCount: 100,
      viewportWidth: 410,
      viewportHeight: 200,
      scrollTop: 350,
      overscanRows: 0,
    });

    expect(grid).toEqual({
      columns: 2,
      gap: 12,
      rowGap: 15,
      tileWidth: 199,
      rowHeight: 187,
      totalHeight: 9_350,
      firstVisibleIndex: 2,
      startIndex: 2,
      endIndex: 6,
    });
  });

  it("在空列表和列表末端裁剪范围", () => {
    expect(calculateContactSheetVirtualGrid({
      photoCount: 0,
      viewportWidth: 860,
      viewportHeight: 620,
      scrollTop: 0,
    }).endIndex).toBe(0);

    const bottom = calculateContactSheetVirtualGrid({
      photoCount: 7,
      viewportWidth: 410,
      viewportHeight: 200,
      scrollTop: 10_000,
      overscanRows: 0,
    });
    expect(bottom.startIndex).toBe(4);
    expect(bottom.endIndex).toBe(7);
  });

  it("照片总数增加时可见范围仍只由视口和 overscan 决定", () => {
    const grid = calculateContactSheetVirtualGrid({
      photoCount: 50_000,
      viewportWidth: 860,
      viewportHeight: 620,
      scrollTop: 1_000_000,
    });

    expect(grid.endIndex - grid.startIndex).toBeLessThanOrEqual(40);
  });

  it("容器变宽时增加列数", () => {
    const narrow = calculateContactSheetVirtualGrid({
      photoCount: 20,
      viewportWidth: 410,
      viewportHeight: 620,
      scrollTop: 0,
    });
    const wide = calculateContactSheetVirtualGrid({
      photoCount: 20,
      viewportWidth: 860,
      viewportHeight: 620,
      scrollTop: 0,
    });

    expect(narrow.columns).toBe(2);
    expect(wide.columns).toBe(4);
  });

  it("Contact Sheet 缩放通过目标卡片宽度改变列数", () => {
    const zoomedOut = calculateContactSheetVirtualGrid({
      photoCount: 20,
      viewportWidth: 860,
      viewportHeight: 620,
      scrollTop: 0,
      targetTileWidth: 164,
    });
    const zoomedIn = calculateContactSheetVirtualGrid({
      photoCount: 20,
      viewportWidth: 860,
      viewportHeight: 620,
      scrollTop: 0,
      targetTileWidth: 273,
    });

    expect(zoomedOut.columns).toBe(5);
    expect(zoomedIn.columns).toBe(3);
  });

  it("支持 Source 面板的固定列数和方形照片布局", () => {
    const compact = calculateContactSheetVirtualGrid({
      photoCount: 12,
      viewportWidth: 252,
      viewportHeight: 600,
      scrollTop: 0,
      columns: 2,
      gap: 8,
      rowGap: 8,
      photoAspectHeight: 1,
      metaAndGapHeight: 27,
    });
    const expanded = calculateContactSheetVirtualGrid({
      photoCount: 12,
      viewportWidth: 352,
      viewportHeight: 600,
      scrollTop: 0,
      columns: 3,
      gap: 8,
      rowGap: 8,
      photoAspectHeight: 1,
      metaAndGapHeight: 27,
    });

    expect(compact.columns).toBe(2);
    expect(compact.tileWidth).toBe(122);
    expect(compact.rowHeight).toBe(149);
    expect(expanded.columns).toBe(3);
    expect(expanded.tileWidth).toBe(112);
    expect(expanded.rowHeight).toBe(139);
  });
});
