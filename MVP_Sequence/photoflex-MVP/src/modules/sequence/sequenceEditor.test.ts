import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceItem, SequenceItemId, SequenceSegmentId } from "../../contracts";
import { createSequenceEditor } from "./sequenceEditor";

const item = (id: string, photoId = id): SequenceItem => ({ id: id as SequenceItemId, kind: "photo", photoId: photoId as PhotoId });
const draft = (items: readonly SequenceItem[]) => ({ projectId: "project" as ProjectId, items, segments: [], readingUnits: items.map((value) => ({ id: `unit-${value.id}` as ReadingUnitId, kind: value.kind === "blank" ? "blank" as const : "single" as const, itemId: value.id })) });

describe("SequenceEditor", () => {
  it("allows repeated photos with distinct item IDs and moves them atomically", () => {
    const editor = createSequenceEditor(draft([item("a", "photo"), item("b")]));
    expect(editor.execute({ type: "add", items: [item("c", "photo")] }).ok).toBe(true);
    expect(editor.execute({ type: "move", itemIds: ["c" as SequenceItemId], to: 0 }).ok).toBe(true);
    expect(editor.snapshot().items.map((value) => value.id)).toEqual(["c", "a", "b"]);
    expect(editor.undo().items.map((value) => value.id)).toEqual(["a", "b", "c"]);
  });

  it("repairs a spread to a single in the same remove command", () => {
    const editor = createSequenceEditor(draft([item("a"), item("b")]));
    expect(editor.execute({ type: "createSpread", unitId: "spread" as ReadingUnitId, itemIds: ["a" as SequenceItemId, "b" as SequenceItemId] }).ok).toBe(true);
    expect(editor.execute({ type: "remove", itemIds: ["a" as SequenceItemId] }).ok).toBe(true);
    expect(editor.snapshot().readingUnits).toMatchObject([{ kind: "single", itemId: "b" }]);
    expect(editor.undo().readingUnits).toMatchObject([{ kind: "spread", leftItemId: "a", rightItemId: "b" }]);
  });

  it("creates Blank and keeps Segment boundaries on complete Reading Units", () => {
    const editor = createSequenceEditor(draft([item("a"), item("b")]));
    editor.execute({ type: "addBlank", itemId: "blank" as SequenceItemId, unitId: "blank-unit" as ReadingUnitId, at: 1 });
    const created = editor.execute({ type: "createSegment", segment: { id: "segment" as SequenceSegmentId, name: "Opening", itemIds: ["a" as SequenceItemId, "blank" as SequenceItemId] } });
    expect(created.ok).toBe(true);
    expect(editor.snapshot().segments[0]).toMatchObject({ name: "Opening", itemIds: ["a", "blank"] });
  });

  it("rejects a Segment that cuts through a Spread", () => {
    const editor = createSequenceEditor(draft([item("a"), item("b")]));
    editor.execute({ type: "createSpread", unitId: "spread" as ReadingUnitId, itemIds: ["a" as SequenceItemId, "b" as SequenceItemId] });
    const result = editor.execute({ type: "createSegment", segment: { id: "segment" as SequenceSegmentId, name: "Broken", itemIds: ["a" as SequenceItemId] } });
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid-segment" } });
  });

  it("lets one item join and leave an existing Segment", () => {
    const editor = createSequenceEditor(draft([item("a"), item("b"), item("c"), item("x"), item("y")]));
    editor.execute({ type: "createSegment", segment: { id: "segment" as SequenceSegmentId, name: "Core", itemIds: ["a" as SequenceItemId, "b" as SequenceItemId, "c" as SequenceItemId] } });
    editor.execute({ type: "move", itemIds: ["x" as SequenceItemId], to: 1 });
    expect(editor.snapshot().segments[0].itemIds).toEqual(["a", "x", "b", "c"]);
    editor.execute({ type: "move", itemIds: ["x" as SequenceItemId], to: 5 });
    expect(editor.snapshot().segments[0].itemIds).toEqual(["a", "b", "c"]);
  });

  it("does not create history for a no-op remove", () => {
    const editor = createSequenceEditor(draft([]));
    expect(editor.execute({ type: "remove", itemIds: [] }).ok).toBe(true);
    expect(editor.canUndo()).toBe(false);
  });
});
