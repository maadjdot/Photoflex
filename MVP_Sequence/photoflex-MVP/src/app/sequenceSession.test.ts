import { describe, expect, it, vi } from "vitest";
import { err, type PhotoId, type ProjectId, type SequenceDocument, type SequenceItemId, type SequenceVersion, type VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { createWorktableEditor } from "../modules/worktable";
import { createProjectWriteCoordinator, type SequenceWritePort } from "./projectWriteCoordinator";
import { SequenceSessionControllerImpl } from "./sequenceSession";

const projectId = "sequence-session-project" as ProjectId;
const sequenceId = "sequence-session-sequence" as SequenceDocument["id"];
const photoId = "sequence-session-photo" as PhotoId;

it("SequenceSession owns the editor history while the coordinator owns persistence", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Sequence Session", createdAt: "2026-09-01T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const itemId = "sequence-session-item" as SequenceItemId;
  const blankId = "sequence-session-blank" as SequenceItemId;
  const versionId = "sequence-session-version" as VersionId;
  const items = [{ id: itemId, kind: "photo" as const, photoId }, { id: blankId, kind: "blank" as const }];
  const readingUnits = [{ id: "sequence-session-unit-a" as SequenceDocument["readingUnits"][number]["id"], kind: "single" as const, itemId }, { id: "sequence-session-unit-b" as SequenceDocument["readingUnits"][number]["id"], kind: "blank" as const, itemId: blankId }];
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Session Sequence", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Session Sequence", itemCount: 2, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  const createdSequence = await projectStore.createSequence(projectId, created.value.revision, sequence, version, created.value.worktableDraft);
  expect(createdSequence.ok).toBe(true);

  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource([]) }, projectId);
  await coordinator.load();
  const persistence = {
    loadSequence: coordinator.loadSequence,
    saveSequenceDraft: coordinator.saveSequenceDraft,
    retrySequence: coordinator.retrySequence,
    flushSequence: coordinator.flushSequence,
  } satisfies SequenceWritePort;
  const session = new SequenceSessionControllerImpl(persistence, projectId, sequenceId);
  await session.load();
  expect(session.getSnapshot().canUndo).toBe(false);
  expect(session.execute({ type: "move", itemIds: [blankId], to: 0 }).ok).toBe(true);
  expect(session.getSnapshot().canUndo).toBe(true);
  await session.flush();
  const saved = await projectStore.loadSequence(sequenceId);
  expect(saved.ok).toBe(true);
  if (saved.ok) expect(saved.value.items.map((item) => item.id)).toEqual([blankId, itemId]);
  expect(session.undo()).toBe(true);
  await session.flush();
  const undone = await projectStore.loadSequence(sequenceId);
  expect(undone.ok).toBe(true);
  if (undone.ok) expect(undone.value.items.map((item) => item.id)).toEqual([itemId, blankId]);
});

it("Sequence saves independently and never retries a failed Table write", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Scoped retry", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const itemId = "scoped-retry-item" as SequenceItemId;
  const blankId = "scoped-retry-blank" as SequenceItemId;
  const versionId = "scoped-retry-version" as VersionId;
  const items = [{ id: itemId, kind: "photo" as const, photoId }, { id: blankId, kind: "blank" as const }];
  const readingUnits = [{ id: "scoped-retry-unit-a" as SequenceDocument["readingUnits"][number]["id"], kind: "single" as const, itemId }, { id: "scoped-retry-unit-b" as SequenceDocument["readingUnits"][number]["id"], kind: "blank" as const, itemId: blankId }];
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Scoped retry", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Scoped retry", itemCount: 2, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  const createdSequence = await projectStore.createSequence(projectId, created.value.revision, sequence, version, created.value.worktableDraft);
  expect(createdSequence.ok).toBe(true);

  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource([]) }, projectId);
  await coordinator.load();
  const session = new SequenceSessionControllerImpl(coordinator, projectId, sequenceId);
  await session.load();
  const originalSaveWorktable = projectStore.saveWorktable.bind(projectStore);
  vi.spyOn(projectStore, "saveWorktable")
    .mockImplementationOnce(async () => err({ kind: "quota-exceeded" }))
    .mockImplementation(originalSaveWorktable);
  const placed = createWorktableEditor(created.value.worktableDraft).execute({ type: "place", items: [{ photoId, width: 100, height: 100, filename: "photo.jpg" }] });
  expect(placed.ok).toBe(true);
  if (!placed.ok) return;
  expect((await coordinator.saveWorktable(placed.value)).ok).toBe(false);

  expect(session.execute({ type: "move", itemIds: [blankId], to: 0 }).ok).toBe(true);
  expect((await session.flush()).ok).toBe(true);
  expect(session.getSnapshot().saveState).toBe("idle");
  await session.retry();

  expect(session.getSnapshot().saveState).toBe("idle");
  expect(session.getSnapshot().sequence?.items.map((item) => item.id)).toEqual([blankId, itemId]);
  const workspaceBeforeTableRetry = await projectStore.loadWorkspace(projectId);
  expect(workspaceBeforeTableRetry.ok && workspaceBeforeTableRetry.value.worktableDraft.entryOrder).toEqual([]);
  const sequenceBeforeTableRetry = await projectStore.loadSequence(sequenceId);
  expect(sequenceBeforeTableRetry.ok && sequenceBeforeTableRetry.value.items.map((item) => item.id)).toEqual([blankId, itemId]);

  expect(await coordinator.retry()).toBe(true);
  const savedWorkspace = await projectStore.loadWorkspace(projectId);
  expect(savedWorkspace.ok && savedWorkspace.value.worktableDraft.entryOrder).toEqual([photoId]);
});
