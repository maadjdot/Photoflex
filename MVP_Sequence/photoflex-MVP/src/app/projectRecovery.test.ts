import { expect, it, vi } from "vitest";
import { err, type ProjectId, type SequenceDocument, type SequenceVersion } from "../contracts";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { createProjectWriteCoordinator } from "./projectWriteCoordinator";

async function fixture() {
  const projectId = "recovery-project" as ProjectId;
  const store = new MemoryProjectStore();
  const project = await store.createProject({ id: projectId, name: "Recovery", createdAt: "2026-09-09T00:00:00Z" });
  if (!project.ok) throw Error("fixture");
  const sequence = { id: "sequence", projectId, name: "Original", items: [{ id: "a", kind: "blank" }, { id: "b", kind: "blank" }], segments: [], readingUnits: [{ id: "ua", kind: "blank", itemId: "a" }, { id: "ub", kind: "blank", itemId: "b" }], currentVersionId: "version", revision: 0, createdAt: project.value.createdAt, updatedAt: project.value.createdAt } as unknown as SequenceDocument;
  const version = { id: sequence.currentVersionId, sequenceId: sequence.id, projectId, name: "Initial", items: sequence.items, itemCount: 2, segments: [], readingUnits: sequence.readingUnits, createdAt: sequence.createdAt } as SequenceVersion;
  const dependencies = { projectStore: store, photoSource: new MemoryPhotoSource() };
  const a = createProjectWriteCoordinator(dependencies, projectId);
  await a.load();
  expect((await a.createSequenceBundle({ sequence, initialVersion: version, pile: { x: 0, y: 0, width: 200, height: 140 } })).ok).toBe(true);
  const b = createProjectWriteCoordinator(dependencies, projectId);
  await b.load();
  return { a, b, store, sequence, projectId };
}

it("rejects a stale session and keeps rejecting its retry instead of overwriting another tab", async () => {
  const { a, b, store, sequence } = await fixture();
  await a.loadSequence(sequence.id);
  await b.loadSequence(sequence.id);
  expect((await a.saveSequenceDraft({ ...sequence, name: "Saved in A" })).ok).toBe(true);
  // An unrelated read must not authorize overwriting with B's old draft.
  await b.loadSequence(sequence.id);
  const reordered = { ...sequence, items: [...sequence.items].reverse(), readingUnits: [...sequence.readingUnits].reverse() };
  const saved = await b.saveSequenceDraft(reordered);
  expect(saved).toMatchObject({ ok: false, error: { kind: "sequence-conflict", expectedRevision: 0, actualRevision: 1 } });
  expect(await b.retrySequence(sequence.id)).toBe(false);
  expect(await b.flushAll()).toMatchObject({ ok: false });
  expect(await store.loadSequence(sequence.id)).toMatchObject({ ok: true, value: { name: "Saved in A", items: sequence.items } });
  const exported = await b.exportRecoveryBackup();
  expect(exported.ok && JSON.parse(new TextDecoder().decode(exported.value)).sequences[0].items).toEqual(reordered.items);
});

it("advances its own acknowledged revision for rapid queued edits", async () => {
  const { a, store, sequence } = await fixture();
  const results = await Promise.all(["One", "Two", "Three"].map((name) => a.saveSequenceDraft({ ...sequence, name })));
  expect(results.every((r) => r.ok)).toBe(true);
  expect(await a.flushAll()).toMatchObject({ ok: true });
  expect(await store.loadSequence(sequence.id)).toMatchObject({ ok: true, value: { name: "Three", revision: 3 } });
});

it("preserves failed Table and Sequence drafts through refresh, and restores them as an independent project", async () => {
  const { a, store, sequence, projectId } = await fixture();
  const original = a.getSnapshot().workspace!;
  vi.spyOn(store, "saveWorktable").mockResolvedValue(err({ kind: "quota-exceeded" }));
  vi.spyOn(store, "saveSequence").mockResolvedValue(err({ kind: "quota-exceeded" }));
  const draft = { ...original.worktableDraft, memos: [{ id: "memo", text: "Keep this idea", x: 20, y: 20, width: 220, height: 160, fontSize: 16, photoIds: [] }] };
  await a.saveWorktable(draft);
  await a.saveSequenceDraft({ ...sequence, name: "Unsaved sequence" });
  expect(a.hasUnsavedWork()).toBe(true);
  await a.load();
  expect(a.hasUnsavedWork()).toBe(true);
  expect(await a.flushAll()).toMatchObject({ ok: false });
  const restored = await a.restoreRecoveryCopy();
  expect(restored.ok).toBe(true);
  if (!restored.ok) return;
  expect(restored.value).not.toBe(projectId);
  const copy = await store.loadWorkspace(restored.value);
  expect(copy.ok && copy.value.worktableDraft.memos).toEqual(draft.memos);
  expect(await store.listSequences(restored.value)).toMatchObject({ ok: true, value: [{ name: "Unsaved sequence" }] });
  expect(await store.loadSequence(sequence.id)).toMatchObject({ ok: true, value: { name: "Original" } });
  expect(await store.loadWorkspace(projectId)).toMatchObject({ ok: true, value: { worktableDraft: original.worktableDraft } });
  expect(a.hasUnsavedWork()).toBe(false);
});
