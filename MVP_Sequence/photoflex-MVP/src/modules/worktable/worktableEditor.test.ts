import { describe, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, SequenceId, WorktableDraft, WorktableItemId, WorktablePlacementSeed } from "../../contracts";
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
  it("creates independent Table instances that reference the same source photo", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    const result = editor.execute({
      type: "place",
      items: [
        { ...seed("source-a"), id: photoId("instance-a") },
        { ...seed("source-a"), id: photoId("instance-b") },
      ],
      at: { x: 100, y: 100 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryOrder).toEqual(["instance-a", "instance-b"]);
    expect(result.value.placements[photoId("instance-a")]).toMatchObject({ id: "instance-a", photoId: "source-a" });
    expect(result.value.placements[photoId("instance-b")]).toMatchObject({ id: "instance-b", photoId: "source-a" });
  });

  it("preserves memos across edits and undo, and cleans photo links on removal", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a")] });
    const memo = { id: "memo-1", text: "First thought", x: -40, y: 20, width: 260, height: 180, fontSize: 16, photoIds: [photoId("a")] };
    expect(editor.execute({ type: "create-memo", memo }).ok).toBe(true);
    const createdMemo = editor.snapshot().memos?.[0];
    editor.execute({ type: "update-memo", memoId: memo.id, changes: { width: 420, height: 100, fontSize: 24, text: "Revised" } });
    expect(editor.snapshot().memos?.[0]).toMatchObject({ width: 420, height: 100, fontSize: 24, text: "Revised" });
    expect(editor.undo().memos?.[0]).toEqual(createdMemo);
    editor.redo();
    editor.execute({ type: "remove", photoIds: [photoId("a")] });
    expect(editor.snapshot().memos?.[0].photoIds).toEqual([]);
    expect(editor.undo().memos?.[0].photoIds).toEqual([photoId("a")]);
    expect(editor.execute({ type: "update-memo", memoId: memo.id, changes: { width: NaN } }).ok).toBe(false);
    expect(editor.execute({ type: "update-memo", memoId: memo.id, changes: { photoIds: [photoId("missing")] } }).ok).toBe(false);
    editor.execute({ type: "remove-memo", memoId: memo.id });
    expect(editor.snapshot().memos).toEqual([]);
    expect(editor.undo().memos).toHaveLength(1);
  });

  it("places only new photos and keeps entry order stable", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    expect(editor.execute({ type: "place", items: [seed("a"), seed("b")] }).ok).toBe(true);
    const repeated = editor.execute({ type: "place", items: [seed("b"), seed("c")] });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    expect(repeated.value.entryOrder).toEqual(["a", "b", "c"]);
    expect(repeated.value.placements[photoId("b")].x).toBe(339);
  });

  it("places newly created photos and memos above existing content without covering it", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    const first = editor.execute({ type: "place", items: [seed("a")], at: { x: 100, y: 100 } });
    expect(first.ok).toBe(true);
    const memoResult = editor.execute({ type: "create-memo", memo: { id: "memo-top", text: "", x: 100, y: 100, width: 260, height: 180, fontSize: 16, photoIds: [] } });
    expect(memoResult.ok).toBe(true);
    if (!memoResult.ok) return;
    const memo = memoResult.value.memos?.[0];
    const photoA = memoResult.value.placements[photoId("a")];
    expect(memo?.z).toBeGreaterThan(photoA.z);
    expect(overlaps(memo!, photoA)).toBe(false);

    const second = editor.execute({ type: "place", items: [seed("b")], at: { x: memo!.x, y: memo!.y } });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const photoB = second.value.placements[photoId("b")];
    expect(photoB.z).toBeGreaterThan(memo!.z!);
    expect(overlaps(photoB, memo!)).toBe(false);
    expect(overlaps(photoB, photoA)).toBe(false);
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

  it("shuffles detected grid rows independently without changing photo geometry", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b", 146, 196), seed("c"), seed("d", 160, 180)] });
    editor.execute({ type: "arrange", photoIds: ["a", "b", "c", "d"] as PhotoId[], layout: { type: "grid", columns: 2, gap: 20 } });
    const before = editor.snapshot();
    const geometryBefore = Object.fromEntries(before.entryOrder.map((id) => [id, {
      width: before.placements[id].width,
      height: before.placements[id].height,
      z: before.placements[id].z,
    }]));

    const result = editor.execute({ type: "shuffle", photoIds: ["d", "b", "a", "c"] as PhotoId[] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(horizontalGapsFor(result.value, [photoId("a"), photoId("b")])).toEqual([20]);
    expect(horizontalGapsFor(result.value, [photoId("c"), photoId("d")])).toEqual([20]);
    expect(new Set([result.value.placements[photoId("a")].y, result.value.placements[photoId("b")].y])).toEqual(new Set([64]));
    expect(new Set([result.value.placements[photoId("c")].y, result.value.placements[photoId("d")].y])).toEqual(new Set([300]));
    expect(result.value.entryOrder).toEqual(before.entryOrder);
    expect(Object.fromEntries(result.value.entryOrder.map((id) => [id, {
      width: result.value.placements[id].width,
      height: result.value.placements[id].height,
      z: result.value.placements[id].z,
    }]))).toEqual(geometryBefore);
    expect(result.value.entryOrder.some((id) => (
      result.value.placements[id].x !== before.placements[id].x
      || result.value.placements[id].y !== before.placements[id].y
    ))).toBe(true);
    expect(editor.undo()).toEqual(before);
    expect(editor.redo()).toEqual(result.value);
  });

  it("does not create photo overlaps when differently sized photos change slots", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 10, 10), seed("c", 10, 10)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -165, y: 0 } });
    editor.execute({ type: "move", photoIds: [photoId("c")], by: { x: -420, y: 0 } });
    const before = editor.snapshot();
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(.9).mockReturnValue(0);

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c")] });
    random.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryOrder.every((id) => (
      result.value.placements[id].x !== before.placements[id].x
      || result.value.placements[id].y !== before.placements[id].y
    ))).toBe(true);
    expect(horizontalGaps(before)).toEqual([10, 10]);
    expect(horizontalGaps(result.value)).toEqual([10, 10]);
    expect(result.value.entryOrder.every((id) => result.value.placements[id].y === 64)).toBe(true);
    expect(newPhotoOverlaps(result.value, before)).toEqual([]);

    const afterFirstShuffle = result.value;
    const repeated = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c")] });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    expect(horizontalGaps(repeated.value)).toEqual([10, 10]);
    expect(repeated.value.entryOrder.every((id) => (
      repeated.value.placements[id].x !== afterFirstShuffle.placements[id].x
      || repeated.value.placements[id].y !== afterFirstShuffle.placements[id].y
    ))).toBe(true);
  });

  it("recognizes a horizontal row when every photo overlaps the row by at least forty percent", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 100, 100), seed("c", 100, 100)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -165, y: 26 } });
    editor.execute({ type: "move", photoIds: [photoId("c")], by: { x: -330, y: 46 } });
    const before = editor.snapshot();

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c")] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(horizontalGaps(before)).toEqual([10, 10]);
    expect(horizontalGaps(result.value)).toEqual([10, 10]);
    expect(new Set(result.value.entryOrder.map((id) => result.value.placements[id].y))).toEqual(new Set([64, 90, 110]));
    expect(result.value.entryOrder.every((id) => (
      result.value.placements[id].x !== before.placements[id].x
      || result.value.placements[id].y !== before.placements[id].y
    ))).toBe(true);
  });

  it("does not merge a forty-percent overlap chain into one horizontal row", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 100, 100), seed("c", 100, 100)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -165, y: 60 } });
    editor.execute({ type: "move", photoIds: [photoId("c")], by: { x: -320, y: 120 } });
    const before = editor.snapshot();

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c")] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.placements[photoId("c")]).toEqual(before.placements[photoId("c")]);
    expect(new Set(result.value.entryOrder.map((id) => result.value.placements[id].y)).size).toBeGreaterThan(1);
  });

  it("keeps two detected horizontal rows separate while shuffling each row", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 100, 100), seed("c", 100, 100), seed("d", 100, 100)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -165, y: 20 } });
    editor.execute({ type: "move", photoIds: [photoId("c")], by: { x: -550, y: 260 } });
    editor.execute({ type: "move", photoIds: [photoId("d")], by: { x: -715, y: 280 } });
    const before = editor.snapshot();

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c"), photoId("d")] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set([result.value.placements[photoId("a")].y, result.value.placements[photoId("b")].y])).toEqual(new Set([64, 84]));
    expect(new Set([result.value.placements[photoId("c")].y, result.value.placements[photoId("d")].y])).toEqual(new Set([324, 344]));
    expect(result.value.entryOrder.every((id) => (
      result.value.placements[id].x !== before.placements[id].x
      || result.value.placements[id].y !== before.placements[id].y
    ))).toBe(true);
  });

  it("allows an existing overlap while moving every shuffled photo", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 100, 100)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -239, y: 0 } });
    const before = editor.snapshot();
    expect(overlaps(before.placements[photoId("a")], before.placements[photoId("b")])).toBe(true);

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b")] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryOrder.every((id) => result.value.placements[id].x !== before.placements[id].x)).toBe(true);
    expect(newPhotoOverlaps(result.value, before)).toEqual([]);
  });

  it("does not create overlaps with photos outside the shuffle selection", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a", 100, 100), seed("b", 20, 20), seed("c", 20, 20), seed("fixed", 20, 20)] });
    editor.execute({ type: "move", photoIds: [photoId("b")], by: { x: -165, y: 0 } });
    editor.execute({ type: "move", photoIds: [photoId("c")], by: { x: -364, y: 0 } });
    editor.execute({ type: "move", photoIds: [photoId("fixed")], by: { x: -589, y: 0 } });
    const before = editor.snapshot();
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(.9);

    const result = editor.execute({ type: "shuffle", photoIds: [photoId("a"), photoId("b"), photoId("c")] });
    random.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(spatialOrder(result.value, [photoId("a"), photoId("b"), photoId("c")]))
      .not.toEqual(spatialOrder(before, [photoId("a"), photoId("b"), photoId("c")]));
    expect(newPhotoOverlaps(result.value, before)).toEqual([]);
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
    const grouped = editor.execute({ type: "create-group", photoIds: [photoId("a"), photoId("b")] });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    expect(grouped.value.groups[0].photoIds).toEqual(["a", "b"]);
    expect(grouped.value.placements[photoId("a")]).toMatchObject({ x: 64, y: 64, width: 196, height: 146 });
    expect(grouped.value.placements[photoId("b")]).toMatchObject({ x: 266, y: 64, width: 196, height: 146 });
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

  it("packs Group photos into a maximum four-column Figma grid", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b"), seed("c"), seed("d"), seed("e")] });
    const before = editor.snapshot().placements;
    const result = editor.execute({ type: "create-group", photoIds: ["a", "b", "c", "d", "e"] as PhotoId[] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.placements[photoId("a")]).toMatchObject({ x: 64, y: 64, width: 196, height: 146 });
    expect(result.value.placements[photoId("d")]).toMatchObject({ x: 670, y: 64, width: 196, height: 146 });
    expect(result.value.placements[photoId("e")]).toMatchObject({ x: 64, y: 216, width: 196, height: 146 });
    for (const id of ["a", "b", "c", "d", "e"] as PhotoId[]) {
      expect(result.value.placements[id]).toMatchObject({ width: before[id].width, height: before[id].height });
    }
  });

  it("keeps a Group grid in place when Link connects one of its photos", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    editor.execute({ type: "place", items: [seed("a"), seed("b"), seed("c")] });
    editor.execute({ type: "create-group", photoIds: [photoId("a"), photoId("b")] });
    const before = editor.snapshot().placements;
    const linked = editor.execute({ type: "create-link", photoIds: [photoId("a"), photoId("c")] });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.value.placements).toEqual(before);
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

  it("resizes a legacy Sequence card from its rendered size and keeps its center", () => {
    const editor = createWorktableEditor(createEmptyWorktable(projectId));
    const sequenceId = "sequence-1" as SequenceId;
    editor.execute({
      type: "place-sequence-pile",
      placement: { sequenceId, x: 80, y: 90, z: 1, width: 190, height: 118 },
    });

    const resized = editor.execute({
      type: "resize-sequence-pile",
      sequenceId,
      scale: 1.15,
      baseSize: { width: 402, height: 176 },
    });

    expect(resized.ok).toBe(true);
    if (!resized.ok) return;
    const placement = resized.value.pilePlacements[sequenceId];
    expect(placement.width).toBeCloseTo(462.3);
    expect(placement.height).toBeCloseTo(202.4);
    expect(placement.x).toBeCloseTo(49.85);
    expect(placement.y).toBeCloseTo(76.8);
    expect(editor.undo().pilePlacements[sequenceId]).toMatchObject({ width: 190, height: 118, x: 80, y: 90 });
  });
});

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function newPhotoOverlaps(after: WorktableDraft, before: WorktableDraft) {
  const pairs: string[] = [];
  before.entryOrder.forEach((leftId, leftIndex) => {
    before.entryOrder.slice(leftIndex + 1).forEach((rightId) => {
      if (!overlaps(before.placements[leftId], before.placements[rightId]) && overlaps(after.placements[leftId], after.placements[rightId])) {
        pairs.push(`${leftId}:${rightId}`);
      }
    });
  });
  return pairs;
}

function horizontalGaps(draft: WorktableDraft) {
  return horizontalGapsFor(draft, draft.entryOrder);
}

function horizontalGapsFor(draft: WorktableDraft, photoIds: readonly WorktableItemId[]) {
  const placements = photoIds.map((id) => draft.placements[id]).sort((left, right) => left.x - right.x);
  return placements.slice(1).map((placement, index) => placement.x - (placements[index].x + placements[index].width));
}

function spatialOrder(draft: WorktableDraft, photoIds: readonly WorktableItemId[]) {
  return [...photoIds].sort((leftId, rightId) => draft.placements[leftId].x - draft.placements[rightId].x);
}
