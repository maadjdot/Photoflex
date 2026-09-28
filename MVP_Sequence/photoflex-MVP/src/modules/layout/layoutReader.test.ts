import { describe, expect, it } from "vitest";
import { createLayoutReaderState, layoutReaderFitPage, layoutReaderPageLabel, layoutReaderPreviewEdge, layoutReaderReducer, layoutReaderSpreads, navigateLayoutReaderPage, resolveLayoutReaderMode } from "./layoutReader";

describe("Layout reader presentation", () => {
  it("builds a right-hand cover and stable physical facing spreads", () => {
    expect(layoutReaderSpreads(1, "facing")).toEqual([{ slots: [null, 0] }]);
    expect(layoutReaderSpreads(4, "facing")).toEqual([{ slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, null] }]);
    expect(layoutReaderSpreads(5, "facing")).toEqual([{ slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, 4] }]);
    expect(layoutReaderPageLabel(layoutReaderSpreads(5, "facing")[1], 5)).toBe("2–3 / 5");
  });

  it("navigates by visible spreads without parity branches in callers", () => {
    expect(navigateLayoutReaderPage(5, 0, "facing", 1)).toBe(1);
    expect(navigateLayoutReaderPage(5, 1, "facing", 1)).toBe(3);
    expect(navigateLayoutReaderPage(5, 4, "facing", -1)).toBe(1);
    expect(navigateLayoutReaderPage(5, 2, "single", 1)).toBe(3);
  });

  it("keeps transient reader state out of the document and resets fit on mode changes", () => {
    const initial = createLayoutReaderState(2, 8);
    const zoomed = layoutReaderReducer(initial, { type: "set-zoom", zoom: 2.25 });
    const turned = layoutReaderReducer(zoomed, { type: "navigate", direction: 1, pageCount: 8, resolvedMode: "facing" });
    expect(turned).toMatchObject({ currentPage: 3, zoom: 2.25, direction: 1, turnKey: 1 });
    expect(layoutReaderReducer(turned, { type: "set-mode", mode: "single" })).toMatchObject({ currentPage: 3, zoom: 1, mode: "single" });
  });

  it("chooses responsive modes, true fit geometry, and bounded preview tiers", () => {
    expect(resolveLayoutReaderMode("auto", { width: 1440, height: 900 })).toBe("facing");
    expect(resolveLayoutReaderMode("auto", { width: 768, height: 1024 })).toBe("single");
    const page = layoutReaderFitPage({ width: 1440, height: 900 }, { widthPt: 595, heightPt: 842 }, 2);
    expect(page.width * 2 + page.gap).toBeLessThanOrEqual(1440 - 96);
    expect(page.height).toBeLessThanOrEqual(900 - 144);
    expect(layoutReaderPreviewEdge(page, 1, 1)).toBe(768);
    expect(layoutReaderPreviewEdge(page, 2, 2)).toBe(2048);
  });
});
