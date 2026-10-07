import { describe, expect, it } from "vitest";
import type { LayoutDocument } from "../../contracts";
import { createLayoutReaderState, layoutReaderFitPage, layoutReaderPageObjects, layoutReaderPreviewEdge, layoutReaderReducer, layoutReaderSpreads, navigateLayoutReaderPage, resolveLayoutReaderMode } from "./layoutReader";

describe("Layout reader presentation", () => {
  it("keeps the back cover separate for odd and even page counts and navigates both ways", () => {
    expect(layoutReaderSpreads(5, "facing", true)).toEqual([
      { slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, null] }, { slots: [4, null] },
    ]);
    expect(layoutReaderSpreads(6, "facing", true)).toEqual([
      { slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, 4] }, { slots: [5, null] },
    ]);
    expect(layoutReaderSpreads(2, "facing", true)).toEqual([{ slots: [null, 0] }, { slots: [1, null] }]);
    expect(navigateLayoutReaderPage(5, 3, "facing", 1, true)).toBe(4);
    expect(navigateLayoutReaderPage(5, 4, "facing", -1, true)).toBe(3);
    expect(navigateLayoutReaderPage(5, 4, "facing", 1, true)).toBe(4);
  });

  it("does not bleed body objects into a back cover or cover objects into the body", () => {
    const document = { pageSpec: { widthPt: 200, heightPt: 300 }, pages: [
      { objects: [] }, { objects: [] }, { objects: [] },
      { objects: [{ id: "body", rect: { x: 180, y: 20, width: 40, height: 100 } }] },
      { kind: "back-cover", objects: [{ id: "back", rect: { x: -10, y: 20, width: 30, height: 100 } }] },
    ] } as unknown as LayoutDocument;
    expect(layoutReaderPageObjects(document, 3).map((object) => object.id)).toEqual(["body"]);
    expect(layoutReaderPageObjects(document, 4).map((object) => object.id)).toEqual(["back"]);
  });
  it("renders both halves of spanning content on their own physical faces without changing the document", () => {
    const document = {
      pageSpec: { widthPt: 200, heightPt: 300 },
      pages: [
        { objects: [] },
        { objects: [{ id: "from-left", rect: { x: 180, y: 20, width: 40, height: 100 } }] },
        { objects: [{ id: "from-right", rect: { x: -10, y: 150, width: 30, height: 100 } }] },
        { objects: [] },
      ],
    } as unknown as LayoutDocument;
    expect(layoutReaderPageObjects(document, 0)).toEqual([]);
    expect(layoutReaderPageObjects(document, 1).map((object) => [object.id, object.rect.x]))
      .toEqual([["from-left", 180], ["from-right", 190]]);
    expect(layoutReaderPageObjects(document, 2).map((object) => [object.id, object.rect.x]))
      .toEqual([["from-right", -10], ["from-left", -20]]);
    expect(layoutReaderPageObjects(document, 3)).toEqual([]);
    expect(document.pages[1].objects[0].rect.x).toBe(180);
    expect(document.pages[2].objects[0].rect.x).toBe(-10);
  });

  it("builds a right-hand cover and stable physical facing spreads", () => {
    expect(layoutReaderSpreads(1, "facing")).toEqual([{ slots: [null, 0] }]);
    expect(layoutReaderSpreads(4, "facing")).toEqual([{ slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, null] }]);
    expect(layoutReaderSpreads(5, "facing")).toEqual([{ slots: [null, 0] }, { slots: [1, 2] }, { slots: [3, 4] }]);
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
    const turned = layoutReaderReducer(zoomed, { type: "go-to-page", page: 3, pageCount: 8 });
    expect(turned).toMatchObject({ currentPage: 3, zoom: 2.25 });
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
