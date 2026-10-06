import { describe, expect, it } from "vitest";
import type { LayoutId, LayoutObjectId, LayoutPageId, PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, VersionId } from "../../contracts";
import { createLayoutFromSequence, duplicateLayoutPage, facingPageIndices, facingTurnIndex, sequenceLayoutPreview } from "./layoutPages";
import { MM_TO_PT } from "../page-layout/pageGeometry";

const sequence = (): SequenceDocument => {
  const ids = ["a", "b", "c", "d"] as SequenceItemId[];
  return { id: "sequence" as SequenceId, projectId: "project" as ProjectId, name: "Test", revision: 0 as SequenceDocument["revision"],
    currentVersionId: "version" as VersionId, createdAt: "now", updatedAt: "now", segments: [],
    items: [
      { id: ids[0], kind: "photo", photoId: "photo-a" as PhotoId },
      { id: ids[1], kind: "photo", photoId: "photo-b" as PhotoId },
      { id: ids[2], kind: "blank" },
      { id: ids[3], kind: "text", text: "你好\nWorld", fontSize: 20, html: "<b>ignored</b>" },
    ],
    readingUnits: [
      { id: "spread" as ReadingUnitId, kind: "spread", leftItemId: ids[0], rightItemId: ids[1] },
      { id: "blank" as ReadingUnitId, kind: "blank", itemId: ids[2] },
      { id: "text" as ReadingUnitId, kind: "single", itemId: ids[3] },
    ],
  };
};

describe("Layout page initialization", () => {
  it("adds covers and keeps a first Sequence spread on the first body pair", () => {
    const source = sequence();
    expect(sequenceLayoutPreview(source)).toEqual({ pages: 6, insertedBlanks: 0, simplifiedText: 1 });
    let count = 0;
    const layout = createLayoutFromSequence({ sequence: source, id: "layout" as LayoutId, name: "Book", widthPt: 210 * MM_TO_PT,
      heightPt: 297 * MM_TO_PT, start: "sequence", now: "now", newId: () => `new-${++count}` });
    expect(layout.pages).toHaveLength(6);
    expect(layout.pages[0].kind).toBe("cover");
    expect(layout.pages[5]).toMatchObject({ kind: "back-cover", objects: [] });
    expect(layout.pages[0].objects).toHaveLength(0);
    expect(layout.pages[1].objects[0]).toMatchObject({ kind: "image-frame", photoId: "photo-a" });
    expect(layout.pages[2].objects[0]).toMatchObject({ kind: "image-frame", photoId: "photo-b" });
    expect(layout.pages[3].objects).toHaveLength(0);
    expect(layout.pages[4].objects[0]).toMatchObject({ kind: "text-box", text: "你好\nWorld" });
    expect(facingPageIndices(5, 0)).toEqual([null, 0]);
    expect(facingPageIndices(5, 2)).toEqual([1, 2]);
    expect(facingPageIndices(5, 4)).toEqual([3, 4]);
  });

  it("creates a blank body page between independently identified covers", () => {
    let count = 0;
    const layout = createLayoutFromSequence({ sequence: sequence(), id: "layout" as LayoutId, name: "Book", widthPt: 297 * MM_TO_PT,
      heightPt: 148 * MM_TO_PT, start: "blank", now: "now", newId: () => `blank-${++count}` });
    expect(layout.pages).toEqual([{ id: "blank-1", kind: "cover", objects: [] }, { id: "blank-3", objects: [] }, { id: "blank-2", kind: "back-cover", objects: [] }]);
    expect(layout.pageSpec).toEqual({ widthPt: 297 * MM_TO_PT, heightPt: 148 * MM_TO_PT });
  });

  it("inserts a body blank when a single item precedes a Sequence spread", () => {
    const source = sequence();
    const units = source.readingUnits;
    const layout = createLayoutFromSequence({ sequence: { ...source, readingUnits: [units[2], units[0]] },
      id: "layout" as LayoutId, name: "Book", widthPt: 210 * MM_TO_PT, heightPt: 297 * MM_TO_PT,
      start: "sequence", now: "now" });
    expect(layout.pages[1].objects[0]).toMatchObject({ kind: "text-box" });
    expect(layout.pages[2].objects).toEqual([]);
    expect(layout.pages[3].objects[0]).toMatchObject({ photoId: "photo-a" });
    expect(layout.pages[4].objects[0]).toMatchObject({ photoId: "photo-b" });
    expect(layout.pages[5].kind).toBe("back-cover");
  });

  it("turns physical facing spreads instead of stepping through single pages", () => {
    expect([0, 1, 3, 5, 7].map((index) => facingTurnIndex(8, index, 1))).toEqual([1, 3, 5, 7, 7]);
    expect([0, 1, 2, 3, 7].map((index) => facingTurnIndex(8, index, -1))).toEqual([0, 0, 0, 1, 5]);
    expect(facingTurnIndex(3, 1, 1)).toBe(2);
    expect(facingTurnIndex(3, 2, 1)).toBe(2);
    expect(facingTurnIndex(5, 3, 1, true)).toBe(4);
  });

  it("duplicates a page with an independent paper value and new object IDs", () => {
    const layout = createLayoutFromSequence({ sequence: sequence(), id: "layout" as LayoutId, name: "Book", widthPt: 210 * MM_TO_PT,
      heightPt: 297 * MM_TO_PT, start: "sequence", now: "now", newId: () => crypto.randomUUID() });
    const source = { ...layout.pages[1], paper: { color: "#F1EDE1", material: "natural-fiber" as const } };
    const copy = duplicateLayoutPage(source, "copy" as LayoutPageId, () => "copy-object" as LayoutObjectId);
    expect(copy).toMatchObject({ id: "copy", paper: source.paper, objects: [{ id: "copy-object" }] });
    expect(copy.paper).not.toBe(source.paper);
  });
});
