import { describe, expect, it } from "vitest";
import type { LayoutId, PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, VersionId } from "../../contracts";
import { createLayoutFromSequence, facingPageIndices, sequenceLayoutPreview } from "./layoutPages";
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
  it("keeps a first spread on a facing pair by inserting a real blank page", () => {
    const source = sequence();
    expect(sequenceLayoutPreview(source)).toEqual({ pages: 5, insertedBlanks: 1, simplifiedText: 1 });
    let count = 0;
    const layout = createLayoutFromSequence({ sequence: source, id: "layout" as LayoutId, name: "Book", widthPt: 210 * MM_TO_PT,
      heightPt: 297 * MM_TO_PT, start: "sequence", now: "now", newId: () => `new-${++count}` });
    expect(layout.pages).toHaveLength(5);
    expect(layout.pages[0].objects).toHaveLength(0);
    expect(layout.pages[1].objects[0]).toMatchObject({ kind: "image-frame", photoId: "photo-a" });
    expect(layout.pages[2].objects[0]).toMatchObject({ kind: "image-frame", photoId: "photo-b" });
    expect(layout.pages[3].objects).toHaveLength(0);
    expect(layout.pages[4].objects[0]).toMatchObject({ kind: "text-box", text: "你好\nWorld" });
    expect(facingPageIndices(5, 0)).toEqual([null, 0]);
    expect(facingPageIndices(5, 2)).toEqual([1, 2]);
    expect(facingPageIndices(5, 4)).toEqual([3, 4]);
  });

  it("creates one blank page without importing Sequence items", () => {
    const layout = createLayoutFromSequence({ sequence: sequence(), id: "layout" as LayoutId, name: "Book", widthPt: 297 * MM_TO_PT,
      heightPt: 148 * MM_TO_PT, start: "blank", now: "now", newId: () => "blank-page" });
    expect(layout.pages).toEqual([{ id: "blank-page", objects: [] }]);
    expect(layout.pageSpec).toEqual({ widthPt: 297 * MM_TO_PT, heightPt: 148 * MM_TO_PT });
  });
});
