import { expect, it } from "vitest";
import type { ProjectId, Result } from "../../src/contracts";
import type { ResearchExtract, ResearchNode } from "../../src/contracts/research";
import { makeAnchor, resolveAnchor, textBlocks } from "../../src/modules/research/content";
import { createResearchNote, newResearchNote } from "../../src/modules/research/notes";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const paragraph = (id: string, text: string): ResearchNode => ({ type: "paragraph", attrs: { blockId: id }, content: [{ type: "text", text }] });

it("isolates notes by project and saves versioned notes, material references and atomic placements", async () => {
  const store = IndexedDbProjectStore.open({ databaseName: `research-${crypto.randomUUID()}` });
  const projectId = "research" as ProjectId;
  const otherId = "other" as ProjectId;
  const stamp = new Date().toISOString();
  try {
    for (const id of [projectId, otherId]) unwrap(await store.createProject({ id, name: id, createdAt: stamp }));
    unwrap(await store.readCloudSyncState(projectId, { revision: 0, pending: false }));
    const material = { id: "reference", projectId, name: "reference.png", mime: "image/png", base64: "eA==" };
    unwrap(await store.research.addMaterials(projectId, [material]));
    const content: ResearchNode = { type: "doc", content: [paragraph("one", "Bridge 📷 in the rain"),
      { type: "researchImages", attrs: { images: [{ kind: "research", id: material.id, caption: "Bridge" }] } }] };
    const first = unwrap(await createResearchNote(store.research, projectId, "Field notes", content));
    const saved = unwrap(await store.research.saveNote({ ...first, title: "Bridge field notes" }));
    expect(saved.version).toBe(2);
    expect(await store.research.saveNote({ ...first, title: "Stale title" })).toEqual({ ok: false, error: "conflict" });
    expect(unwrap(await store.research.listNotes(projectId, "IN THE RAIN"))).toMatchObject([{ title: "Bridge field notes", id: saved.id }]);
    expect(unwrap(await store.research.listNotes(projectId))[0]).not.toHaveProperty("content");
    expect(await store.research.loadNote(otherId, first.id)).toEqual({ ok: false, error: "missing" });
    expect(await store.research.loadMaterial(otherId, material.id)).toEqual({ ok: false, error: "missing" });
    const snapshot = "Bridge 📷";
    const anchor = makeAnchor(textBlocks(content), { blockId: "one", offset: 0 }, { blockId: "one", offset: snapshot.length })!;
    const extract: ResearchExtract = { id: "extract", projectId, noteId: saved.id, anchor, snapshot, acceptedVersion: saved.version, note: "" };
    const placement = { id: "placement", extractId: extract.id, text: snapshot, width: 260, height: 180, x: 200, y: 200, fontSize: 16, photoIds: [] };
    expect(await store.research.saveExtract(saved, extract, { ...placement, width: -1 })).toEqual({ ok: false, error: "invalid-selection" });
    expect(unwrap(await store.research.listExtracts(projectId))).toEqual([]);
    unwrap(await store.research.saveExtract(saved, extract, placement));
    unwrap(await store.research.saveExtract(saved, extract, placement));
    expect(unwrap(await store.research.listExtracts(projectId, first.id))).toHaveLength(1);
    expect(unwrap(await store.loadWorkspace(projectId)).worktableDraft.memos).toHaveLength(1);
    const invalidNote = newResearchNote(projectId);
    expect(await store.research.placeNote(invalidNote, { x: NaN, y: 0 })).toEqual({ ok: false, error: "invalid-selection" });
    expect(await store.research.loadNote(projectId, invalidNote.id)).toEqual({ ok: false, error: "missing" });
    const notePlacement = unwrap(await store.research.placeNote(saved, { x: 200, y: 160 }));
    const retry = unwrap(await store.research.placeNote(saved, { x: 20, y: 20 }));
    expect(retry.workspace.revision).toBe(notePlacement.workspace.revision);
    expect(unwrap(await store.research.listNotes(projectId))[0]).toMatchObject({ imageCount: 1, cover: { kind: "research", id: material.id } });
    expect(unwrap(await store.captureCloudSnapshot(projectId)).document.research).toHaveLength(3);
    const copyId = unwrap(await store.importBackup(unwrap(await store.exportBackup(projectId))));
    expect(unwrap(await store.research.loadNote(copyId, saved.id)).content).toEqual(content);
    expect(unwrap(await store.research.loadMaterial(copyId, material.id)).base64).toBe(material.base64);
    expect(unwrap(await store.loadWorkspace(copyId)).worktableDraft.memos?.[0].extractId).toBe(extract.id);
    expect(unwrap(await store.loadWorkspace(copyId)).worktableDraft.memos?.[1]).toMatchObject({ id: notePlacement.cardId, researchNoteId: saved.id });
    const afterDelete = unwrap(await store.research.deleteNote(projectId, saved.id));
    expect(afterDelete.worktableDraft.memos).toMatchObject([{ extractId: extract.id }]);
    expect(unwrap(await store.loadWorkspace(projectId)).worktableDraft.memos).toHaveLength(1);
    expect(unwrap(await store.research.deleteNote(projectId, saved.id)).revision).toBe(afterDelete.revision);
    expect(unwrap(await store.research.listNotes(projectId))).toEqual([]);
    expect(unwrap(await store.research.listExtracts(projectId))[0].snapshot).toBe(snapshot);
    unwrap(await store.deleteProject(projectId));
    expect(await store.research.listExtracts(projectId)).toEqual({ ok: false, error: "missing" });
  } finally { await store.close(); }
});

it("uses UTF-16 offsets and refuses ambiguous quote fallback", () => {
  const exact = "雨📷";
  const anchor = makeAnchor([{ id: "one", text: "Before 雨📷 after" }], { blockId: "one", offset: 7 }, { blockId: "one", offset: 7 + exact.length })!;
  expect(resolveAnchor([{ id: "one", text: "New: Before 雨📷 after" }], anchor))
    .toMatchObject({ status: "current", anchor: { start: { offset: 12 } } });
  expect(resolveAnchor([{ id: "one", text: "Before 晴☀ after" }], anchor))
    .toMatchObject({ status: "changed", anchor: { quote: { exact: "晴☀" } } });
  expect(resolveAnchor([{ id: "one", text: "Before  after" }], anchor)).toEqual({ status: "orphaned" });
  expect(resolveAnchor([{ id: "two", text: "Before 雨📷 after" }, { id: "three", text: "Before 雨📷 after" }], anchor))
    .toEqual({ status: "needs-review" });
});
