import { describe, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, SequenceId } from "../contracts";
import { createEmptyWorktable } from "../modules/worktable";
import { createTableSession } from "./tableSession";

const projectId = "table-session-project" as ProjectId;
const photoA = "photo-a" as PhotoId;
const photoB = "photo-b" as PhotoId;
const photoC = "photo-c" as PhotoId;

function createSession(onCommit = vi.fn()) {
  const session = createTableSession(createEmptyWorktable(projectId), onCommit);
  const placed = session.execute({
    type: "place",
    items: [photoA, photoB, photoC].map((photoId) => ({ photoId, width: 200, height: 150, filename: `${photoId}.jpg` })),
  });
  if (!placed.ok) throw new Error("fixture placement failed");
  onCommit.mockClear();
  return { session, onCommit };
}

describe("TableSession", () => {
  it("copies selected photos as new Table instances without copying relations", () => {
    const { session } = createSession();
    session.selectPhotos([photoA, photoB]);
    session.execute({ type: "create-group", photoIds: [photoA, photoB] });

    expect(session.copySelection()).toBe(true);
    const pasted = session.pasteSelection();

    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const addedIds = pasted.value.selectedPhotoIds;
    expect(addedIds).toHaveLength(2);
    expect(addedIds).not.toEqual([photoA, photoB]);
    expect(addedIds.map((id) => pasted.value.draft.placements[id].photoId)).toEqual([photoA, photoB]);
    expect(pasted.value.draft.groups).toHaveLength(1);
    expect(pasted.value.draft.groups[0].photoIds).toEqual([photoA, photoB]);
    expect(session.undo().draft.entryOrder).toEqual([photoA, photoB, photoC]);
  });

  it("owns the editor, history and monotonic edit sequence behind one interface", () => {
    const { session, onCommit } = createSession();
    session.selectPhoto(photoA, false);

    const moved = session.execute({ type: "move", photoIds: [photoA], by: { x: 20, y: 12 } });
    expect(moved.ok).toBe(true);
    expect(session.getSnapshot().draft.placements[photoA].x).toBe(84);
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ editSeq: 2 }));

    session.undo();
    expect(session.getSnapshot().draft.placements[photoA].x).toBe(64);
    expect(session.getSnapshot().canRedo).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ editSeq: 3 }));

    session.redo();
    expect(session.getSnapshot().draft.placements[photoA].x).toBe(84);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ editSeq: 4 }));
  });

  it("keeps photo and pile selection exclusive and derives actions once", () => {
    const { session } = createSession();
    const sequenceId = "sequence-a" as SequenceId;
    const pile = session.execute({
      type: "place-sequence-pile",
      placement: { sequenceId, x: 20, y: 20, width: 211, height: 142, z: 4 },
    });
    if (!pile.ok) throw new Error("fixture pile failed");

    session.selectPhoto(photoA, false);
    session.selectPhoto(photoB, true);
    expect(session.getSnapshot().actions.canGroup).toBe(true);
    expect(session.getSnapshot().actions.canCompare).toBe(true);
    expect(session.getSnapshot().actions.compareKind).toBe("photos");

    session.selectPhoto(photoC, true);
    expect(session.getSnapshot().actions.canCompare).toBe(false);
    expect(session.getSnapshot().actions.compareDisabledReason).toMatch(/exactly two/);

    session.selectPile(sequenceId, false);
    expect(session.getSnapshot().selectedPhotoIds).toEqual([]);
    expect(session.getSnapshot().selectedPileIds).toEqual([sequenceId]);
  });

  it("prepares structural changes without mutating history, then resets to the committed draft", () => {
    const { session, onCommit } = createSession();
    const sequenceId = "sequence-structural" as SequenceId;
    const prepared = session.prepareStructuralDraft({
      type: "place-sequence-pile",
      placement: { sequenceId, x: 30, y: 40, width: 211, height: 142, z: 5 },
    });
    expect(prepared.ok).toBe(true);
    expect(session.getSnapshot().draft.pileOrder).toEqual([]);
    expect(onCommit).not.toHaveBeenCalled();
    if (!prepared.ok) return;

    session.resetCommittedDraft(prepared.value, { pileIds: [sequenceId] });
    expect(session.getSnapshot().selectedPileIds).toEqual([sequenceId]);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
