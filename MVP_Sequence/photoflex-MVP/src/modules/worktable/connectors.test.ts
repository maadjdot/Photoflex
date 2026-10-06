import { describe, expect, it } from "vitest";
import type { FrameId, PhotoId, ProjectId, SequenceId, WorktableConnector, WorktableDraft, WorktableItemId } from "../../contracts";
import { bindConnectorEndpoint, connectorTarget, connectorTargets, findConnectorTarget, resolveConnectorEndpoint } from "./connectors";
import { createEmptyWorktable, createWorktableEditor } from "./worktableEditor";
import { frameTemplateSource } from "./frameLayout";

const photo = "instance" as WorktableItemId, frameId = "frame" as FrameId, pileId = "pile" as SequenceId;
function fixture(): WorktableDraft {
  return { ...createEmptyWorktable("project" as ProjectId), entryOrder: [photo], placements: {
    [photo]: { id: photo, photoId: "source-photo" as PhotoId, filename: "photo.jpg", x: 100, y: 100, width: 200, height: 100, z: 2 },
  }, memos: [{ id: "memo", text: "", x: 500, y: 100, width: 160, height: 100, fontSize: 16, photoIds: [], z: 3 }],
    pileOrder: [pileId], pilePlacements: { [pileId]: { sequenceId: pileId, x: 100, y: 400, width: 210, height: 142, z: 1 } },
    frameOrder: [frameId], frames: { [frameId]: { id: frameId, name: "Frame", x: 800, y: 100, z: 0, displayScale: .5,
      page: { widthPt: 400, heightPt: 600, templateSource: frameTemplateSource("single"), slots: [] } } },
  };
}
function connected(draft: WorktableDraft): WorktableConnector {
  return { id: "line", start: bindConnectorEndpoint({ x: 200, y: 150 }, { x: 580, y: 150 }, connectorTargets(draft).find((item) => item.id === photo)),
    end: bindConnectorEndpoint({ x: 580, y: 150 }, { x: 200, y: 150 }, connectorTargets(draft).find((item) => item.id === "memo")) };
}

describe("free Table connectors", () => {
  it("clips interior points to facing borders and snaps outside points within the given tolerance", () => {
    const draft = fixture(), targets = connectorTargets(draft), line = connected(draft);
    expect(line.start).toMatchObject({ x: 300, y: 150, binding: { kind: "photo", id: photo, anchor: { x: 1, y: .5 } } });
    expect(line.end).toMatchObject({ x: 500, y: 150, binding: { kind: "memo", id: "memo", anchor: { x: 0, y: .5 } } });
    expect(findConnectorTarget(targets, { x: 308, y: 150 }, 10)?.id).toBe(photo);
    expect(findConnectorTarget(targets, { x: 308, y: 150 }, 5)).toBeUndefined();
    expect(bindConnectorEndpoint({ x: 308, y: 150 }, { x: 580, y: 150 }, targets.find((item) => item.id === photo))).toMatchObject({ x: 300, y: 150 });
    expect(bindConnectorEndpoint({ x: -40, y: -20 }, { x: 0, y: 0 })).toEqual({ x: -40, y: -20 });
  });

  it("uses the topmost visible object and the displayed Frame dimensions", () => {
    const draft = fixture();
    const overlapping = { ...draft, memos: [{ ...draft.memos![0], x: 110, y: 110 }] };
    expect(findConnectorTarget(connectorTargets(overlapping), { x: 150, y: 150 }, 10)?.kind).toBe("memo");
    expect(connectorTarget(draft, { kind: "frame", id: frameId, anchor: { x: 0, y: .5 } })).toMatchObject({ width: 200, height: 300 });
  });

  it("follows moves and resizes, keeps snapshots independent, and supports undo/redo", () => {
    const draft = fixture(), editor = createWorktableEditor(draft), line = connected(draft);
    expect(editor.execute({ type: "create-connector", connector: line }).ok).toBe(true);
    (line.start.binding!.anchor as { x: number }).x = 0;
    expect(editor.snapshot().connectors![0].start.binding!.anchor.x).toBe(1);
    editor.execute({ type: "move", photoIds: [photo], by: { x: 40, y: 20 } });
    editor.execute({ type: "resize", photoIds: [photo], scale: 2 });
    let current = editor.snapshot();
    expect(resolveConnectorEndpoint(current, current.connectors![0].start)).toEqual({ x: 540, y: 220 });
    editor.execute({ type: "update-memo", memoId: "memo", changes: { x: 600, width: 320, height: 200 } });
    current = editor.snapshot();
    expect(resolveConnectorEndpoint(current, current.connectors![0].end)).toEqual({ x: 600, y: 200 });
    editor.execute({ type: "remove-connector", connectorId: "line" });
    expect(editor.snapshot().connectors).toHaveLength(0);
    expect(editor.undo().connectors).toHaveLength(1);
    expect(editor.redo().connectors).toHaveLength(0);
  });

  it.each(["photo", "memo", "frame", "pile"] as const)("cleans connections when a %s is removed and restores both with undo", (kind) => {
    const draft = fixture(), editor = createWorktableEditor(draft), target = connectorTargets(draft).find((item) => item.kind === kind)!;
    const start = bindConnectorEndpoint({ x: target.x + target.width / 2, y: target.y + target.height / 2 }, { x: -100, y: -100 }, target);
    expect(editor.execute({ type: "create-connector", connector: { id: "attached", start, end: { x: -100, y: -100 } } }).ok).toBe(true);
    expect(editor.execute({ type: "create-connector", connector: { id: "free", start: { x: -50, y: -50 }, end: { x: -100, y: -100 } } }).ok).toBe(true);
    const command = kind === "photo" ? { type: "remove" as const, photoIds: [photo] }
      : kind === "memo" ? { type: "remove-memo" as const, memoId: "memo" }
        : kind === "frame" ? { type: "remove-frame" as const, frameId } : { type: "remove-sequence-piles" as const, sequenceIds: [pileId] };
    expect(editor.execute(command).ok).toBe(true);
    expect(editor.snapshot().connectors?.map((line) => line.id)).toEqual(["free"]);
    expect(editor.undo().connectors).toHaveLength(2);
  });

  it("rejects missing bindings and nonfinite points without adding history", () => {
    const editor = createWorktableEditor(fixture());
    expect(editor.execute({ type: "create-connector", connector: { id: "bad", start: { x: NaN, y: 0 }, end: { x: 0, y: 0 } } }).ok).toBe(false);
    expect(editor.execute({ type: "create-connector", connector: { id: "bad", start: { x: 0, y: 0, binding: { kind: "memo", id: "missing", anchor: { x: 0, y: .5 } } }, end: { x: 1, y: 1 } } }).ok).toBe(false);
    expect(editor.canUndo()).toBe(false);
  });
});
