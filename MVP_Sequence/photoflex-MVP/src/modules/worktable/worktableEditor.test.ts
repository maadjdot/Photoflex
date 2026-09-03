import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, SequenceId, WorktablePlacementSeed } from "../../contracts";
import { createEmptyWorktable, createWorktableEditor } from "./worktableEditor";

const projectId = "project-1" as ProjectId;
const photoId = (id: string) => id as PhotoId;
const seed = (id: string, width = 196, height = 146): WorktablePlacementSeed => ({
  photoId: id as PhotoId,
  width,
  height,
  filename: `${id}.jpg`,
});

describe("WorktableEditor", () => {
  it("places only new photos and keeps entry order stable", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    expect(editor.execute({ type: "place", items: [seed("a"), seed("b")] }).ok).toBe(true);
    const repeated = editor.execute({ type: "place", items: [seed("b"), seed("c")] });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    expect(repeated.value.entryOrder).toEqual(["a", "b", "c"]);
    expect(repeated.value.placements[photoId("b")].x).toBe(347);
  });

  it("rejects duplicate request ids without changing history", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    const result = editor.execute({ type: "place", items: [seed("a"), seed("a")] });
    expect(result).toEqual({ ok: false, error: { kind: "duplicate-photo-id", photoId: "a" } });
    expect(editor.canUndo()).toBe(false);
    expect(editor.snapshot().entryOrder).toEqual([]);
  });

  it("moves a selection atomically and creates one undo step", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b")] });
    const before = editor.snapshot();
    editor.execute({ type: "move", photoIds: ["a", "b"] as PhotoId[], by: { x: 32, y: -8 } });
    const moved = editor.snapshot();
    expect(moved.placements[photoId("a")].x).toBe(before.placements[photoId("a")].x + 32);
    expect(moved.placements[photoId("b")].y).toBe(before.placements[photoId("b")].y - 8);
    expect(editor.undo()).toEqual(before);
    expect(editor.redo()).toEqual(moved);
  });

  it("keeps a failing multi-photo command atomic", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a")] });
    const before = editor.snapshot();
    const result = editor.execute({
      type: "move",
      photoIds: ["a", "missing"] as PhotoId[],
      by: { x: 10, y: 10 },
    });
    expect(result.ok).toBe(false);
    expect(editor.snapshot()).toEqual(before);
  });

  it("arranges by entry order without changing that order", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b", 146, 196), seed("c")] });
    const result = editor.execute({
      type: "arrange",
      photoIds: ["c", "a", "b"] as PhotoId[],
      layout: { type: "grid", gap: 20 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryOrder).toEqual(["a", "b", "c"]);
    expect(result.value.placements[photoId("a")].x).toBe(result.value.placements[photoId("c")].x);
    expect(result.value.placements[photoId("a")].y).toBeLessThan(result.value.placements[photoId("c")].y);
  });

  it("removes only table membership", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b")] });
    const result = editor.execute({ type: "remove", photoIds: ["a"] as PhotoId[] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryOrder).toEqual(["b"]);
    expect(result.value.placements[photoId("a")]).toBeUndefined();
  });

  it("resizes proportionally and records a single undo step", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 196, 146)] });
    const before = editor.snapshot();
    const result = editor.execute({ type: "resize", photoIds: [photoId("a")], scale: 1.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.placements[photoId("a")].width).toBe(294);
    expect(result.value.placements[photoId("a")].height).toBe(219);
    expect(editor.undo()).toEqual(before);
  });

  it("keeps Group and Link as Table-only relationships and restores them with undo", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b"), seed("c")] });
    const anchorX = editor.snapshot().placements[photoId("b")].x;
    const grouped = editor.execute({ type: "create-group", photoIds: [photoId("a"), photoId("b")] });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    expect(grouped.value.groups[0].photoIds).toEqual(["a", "b"]);
    expect(grouped.value.placements[photoId("b")].x).toBe(anchorX);
    const linked = editor.execute({ type: "create-link", photoIds: [photoId("b"), photoId("c")] });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.value.links[0].photoIds).toEqual(["b", "c"]);
    const unlinked = editor.execute({ type: "remove-link", linkId: linked.value.links[0].id });
    expect(unlinked.ok).toBe(true);
    if (!unlinked.ok) return;
    expect(unlinked.value.links).toEqual([]);
    expect(editor.undo().links).toHaveLength(1);
    expect(editor.undo().links).toEqual([]);
  });

  it("adds one photo to an existing Group and lets one photo leave without changing table membership", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b"), seed("c")] });
    const created = editor.execute({ type: "create-group", photoIds: [photoId("a"), photoId("b")] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const added = editor.execute({ type: "add-to-group", groupId: created.value.groups[0].id, photoId: photoId("c") });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.groups[0].photoIds).toEqual(["a", "b", "c"]);

    const left = editor.execute({ type: "remove-from-group", photoId: photoId("c") });
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(left.value.groups[0].photoIds).toEqual(["a", "b"]);
    expect(left.value.entryOrder).toEqual(["a", "b", "c"]);
  });

  it("clears redo after a new successful command", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a")] });
    editor.undo();
    expect(editor.canRedo()).toBe(true);
    editor.execute({ type: "place", items: [seed("b")] });
    expect(editor.canRedo()).toBe(false);
  });

  it("places, moves, fronts and removes Sequence Piles without touching photos", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a")] });
    const placement = { sequenceId: "sequence-1" as SequenceId, x: 80, y: 90, z: 3, width: 190, height: 118 };
    const placed = editor.execute({ type: "place-sequence-pile", placement });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const moved = editor.execute({ type: "move-sequence-piles", sequenceIds: [placement.sequenceId], by: { x: 10, y: 12 } });
    expect(moved.ok && moved.value.pilePlacements[placement.sequenceId].x).toBe(90);
    expect(editor.undo().pilePlacements[placement.sequenceId].x).toBe(80);
    const removed = editor.execute({ type: "remove-sequence-piles", sequenceIds: [placement.sequenceId] });
    expect(removed.ok && removed.value.entryOrder).toEqual(["a"]);
  });
});
