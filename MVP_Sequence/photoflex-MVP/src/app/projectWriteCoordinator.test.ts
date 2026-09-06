import { describe, expect, it, vi } from "vitest";
import { err, type PhotoId, type ProjectId, type SequenceDocument, type SequenceItemId, type SequenceVersion, type VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { createWorktableEditor } from "../modules/worktable";
import { createProjectWriteCoordinator } from "./projectWriteCoordinator";

const projectId = "coordinator-project" as ProjectId;
const photoId = "coordinator-photo" as PhotoId;

async function fixture() {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Coordinator", createdAt: "2026-09-01T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const photoSource = new MemoryPhotoSource([]);
  return { projectStore, photoSource, workspace: created.value };
}

describe("ProjectWriteCoordinator", () => {
  it("serializes functional worktable updates against the latest saved revision", async () => {
    const { projectStore, photoSource, workspace } = await fixture();
    const coordinator = createProjectWriteCoordinator({ projectStore, photoSource }, projectId);
    await coordinator.load();
    const editor = createWorktableEditor(workspace.worktableDraft);
    const placed = editor.execute({ type: "place", items: [{ photoId, width: 100, height: 100, filename: "photo.jpg" }] });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const first = coordinator.saveWorktable(placed.value);
    const second = coordinator.saveWorkspace((current) => ({ ...current, lastOpenedAt: "2026-09-01T00:00:01.000Z" }));
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);

    const saved = await projectStore.loadWorkspace(projectId);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.worktableDraft.entryOrder).toEqual([photoId]);
    expect(saved.value.lastOpenedAt).toBe("2026-09-01T00:00:01.000Z");
    expect(saved.value.revision).toBe(2);
  });

  it("commits sequence, initial version, pile and workspace revision as one transaction", async () => {
    const { projectStore, photoSource, workspace } = await fixture();
    const coordinator = createProjectWriteCoordinator({ projectStore, photoSource }, projectId);
    await coordinator.load();
    const sequenceId = "coordinator-sequence" as SequenceDocument["id"];
    const versionId = "coordinator-version" as VersionId;
    const itemId = "coordinator-item" as SequenceItemId;
    const items = [{ id: itemId, kind: "photo" as const, photoId }];
    const sequence: SequenceDocument = {
      id: sequenceId,
      projectId,
      name: "Sequence 01",
      items,
      segments: [],
      readingUnits: [{ id: "coordinator-unit" as SequenceDocument["readingUnits"][number]["id"], kind: "single", itemId }],
      currentVersionId: versionId,
      revision: 0 as SequenceDocument["revision"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const initialVersion: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Sequence 01", itemCount: 1, items, segments: [], readingUnits: sequence.readingUnits, createdAt: sequence.createdAt };
    const result = await coordinator.createSequenceBundle({ sequence, initialVersion, pile: { x: 10, y: 10, width: 211, height: 142 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.worktableDraft?.pileOrder).toEqual([sequenceId]);
    const saved = await projectStore.loadWorkspace(projectId);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.sequenceIds).toEqual([sequenceId]);
    expect(saved.value.versionIds).toEqual([versionId]);
    expect(saved.value.worktableDraft.pileOrder).toEqual([sequenceId]);
    expect((await projectStore.loadSequence(sequenceId)).ok).toBe(true);
    expect((await projectStore.loadVersion(versionId)).ok).toBe(true);
  });

  it("keeps sequence ordering writes out of page-local queues", async () => {
    const { projectStore, photoSource, workspace } = await fixture();
    const coordinator = createProjectWriteCoordinator({ projectStore, photoSource }, projectId);
    await coordinator.load();
    const sequenceId = "editable-sequence" as SequenceDocument["id"];
    const versionId = "editable-version" as VersionId;
    const firstId = "editable-first" as SequenceItemId;
    const secondId = "editable-second" as SequenceItemId;
    const items = [{ id: firstId, kind: "photo" as const, photoId }, { id: secondId, kind: "blank" as const }];
    const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Editable", items, segments: [], readingUnits: [{ id: "unit-a" as SequenceDocument["readingUnits"][number]["id"], kind: "single", itemId: firstId }, { id: "unit-b" as SequenceDocument["readingUnits"][number]["id"], kind: "blank", itemId: secondId }], currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
    const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Editable", itemCount: 2, items, segments: [], readingUnits: sequence.readingUnits, createdAt: sequence.createdAt };
    const created = await projectStore.createSequence(projectId, workspace.revision, sequence, version, workspace.worktableDraft);
    expect(created.ok).toBe(true);

    const result = await coordinator.editSequence(sequenceId, (current) => ({ ...current, items: [current.items[1], current.items[0]], readingUnits: [current.readingUnits[1], current.readingUnits[0]] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sequence.items.map((item) => item.id)).toEqual([secondId, firstId]);
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.items.map((item) => item.id)).toEqual([secondId, firstId]);
  });

  it("pauses dependent writes after a storage failure and retries the original task", async () => {
    const { projectStore, photoSource, workspace } = await fixture();
    const coordinator = createProjectWriteCoordinator({ projectStore, photoSource }, projectId);
    await coordinator.load();
    const original = projectStore.saveWorktable.bind(projectStore);
    const saveWorktable = vi.spyOn(projectStore, "saveWorktable");
    saveWorktable.mockImplementationOnce(async () => err({ kind: "quota-exceeded" }));
    saveWorktable.mockImplementation(original);

    const placed = createWorktableEditor(workspace.worktableDraft).execute({ type: "place", items: [{ photoId, width: 100, height: 100, filename: "photo.jpg" }] });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect((await coordinator.saveWorktable(placed.value)).ok).toBe(false);
    expect((await coordinator.saveWorktable(workspace.worktableDraft)).ok).toBe(false);
    expect((await coordinator.retry())).toBe(true);
    const saved = await projectStore.loadWorkspace(projectId);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.worktableDraft.entryOrder).toEqual([photoId]);
  });
});
