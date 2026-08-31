import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, SequenceItemId } from "../../contracts";
import { createSequenceEditor } from "./sequenceEditor";

const item = (id: string, photoId = id) => ({ id: id as SequenceItemId, photoId: photoId as PhotoId });

describe("SequenceEditor", () => {
  it("adds, moves and undoes without changing photo identity", () => {
    const editor = createSequenceEditor({ projectId: "project" as ProjectId, items: [item("a"), item("b")] });
    expect(editor.execute({ type: "add", items: [item("c")] }).ok).toBe(true);
    expect(editor.execute({ type: "move", itemIds: ["c" as SequenceItemId], to: 0 }).ok).toBe(true);
    expect(editor.snapshot().items.map((value) => value.photoId)).toEqual(["c", "a", "b"]);
    expect(editor.undo().items.map((value) => value.id)).toEqual(["a", "b", "c"]);
  });

  it("does not create history for a no-op remove", () => {
    const editor = createSequenceEditor({ projectId: "project" as ProjectId, items: [] });
    expect(editor.execute({ type: "remove", itemIds: [] }).ok).toBe(true);
    expect(editor.canUndo()).toBe(false);
  });
});
