import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { MemoryProjectStore } from "../../src/platform/memory/MemoryProjectStore";
import type { FrameId, FrameSlotId, PhotoId, ProjectBackupV1, ProjectStore } from "../../src/contracts";
import { createWorktableEditor } from "../../src/modules/worktable/worktableEditor";
import { defaultFrameCrop, frameTemplateRects, frameTemplateSource, FRAME_MM_TO_PT } from "../../src/modules/worktable/frameLayout";
import { backupBytes, backupFixture } from "../helpers/projectBackup";

const opened: IndexedDbProjectStore[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(opened.splice(0).map((s) => s.close())); });
function browserStore() { const s = IndexedDbProjectStore.open({ databaseName: `backup-${crypto.randomUUID()}` }); opened.push(s); return s; }

for (const [name, factory] of [["memory", () => new MemoryProjectStore()], ["IndexedDB", browserStore]] as const) describe(name, () => {
  it("restores Frame IDs and photo references independently of the original project", async () => {
    const source = factory();
    const imported = await source.importBackup(backupBytes());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const loaded = await source.loadWorkspace(imported.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const photoId = loaded.value.worktableDraft.placements[loaded.value.worktableDraft.entryOrder[0]].photoId;
    const template = frameTemplateSource("single");
    const widthPt = 210 * FRAME_MM_TO_PT, heightPt = 297 * FRAME_MM_TO_PT;
    const editor = createWorktableEditor(loaded.value.worktableDraft);
    const created = editor.execute({ type: "create-frame", frame: { id: "original-frame" as FrameId, name: "Test Frame", x: 10, y: 20, z: 10, displayScale: .5,
      page: { widthPt, heightPt, templateSource: template, slots: [{ id: "original-slot" as FrameSlotId, rect: frameTemplateRects(widthPt, heightPt, template)[0], photoId, crop: defaultFrameCrop("single") }] } } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await source.saveWorktable(imported.value, created.value, loaded.value.revision)).ok).toBe(true);
    const exported = await source.exportBackup(imported.value);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const copyStore = factory();
    const copy = await copyStore.importBackup(exported.value);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    const restored = await copyStore.loadWorkspace(copy.value);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const nextFrameId = restored.value.worktableDraft.frameOrder?.[0];
    expect(nextFrameId).toBeTruthy();
    expect(nextFrameId).not.toBe("original-frame");
    const slot = restored.value.worktableDraft.frames?.[nextFrameId!].page.slots[0];
    expect(slot?.id).not.toBe("original-slot");
    expect(slot?.photoId).not.toBe(photoId);
    expect(slot?.photoId).toBe(restored.value.worktableDraft.placements[restored.value.worktableDraft.entryOrder[0]].photoId as PhotoId);
  });

  it("round-trips the project, versions and photo manifest into a fresh store without ID collisions", async () => {
    const source: ProjectStore = factory();
    const first = await source.importBackup(backupBytes());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const exported = await source.exportBackup(first.value);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const target: ProjectStore = factory();
    const copies = await Promise.all([target.importBackup(exported.value), target.importBackup(exported.value)]);
    expect(copies.every((r) => r.ok)).toBe(true);
    if (!copies[0].ok || !copies[1].ok) return;
    expect(copies[0].value).not.toBe(copies[1].value);
    const secondExport = await target.exportBackup(copies[0].value);
    if (!secondExport.ok) throw Error("export failed");
    const copy = JSON.parse(new TextDecoder().decode(secondExport.value)) as ProjectBackupV1;
    const table = copy.project.worktableDraft;
    expect(copy.project.memo).toBe("Project memo");
    expect(copy.photoManifest.map((p) => p.relativePath).sort()).toEqual(["one.jpg", "two.jpg"]);
    const p1 = copy.photoManifest.find((p) => p.relativePath === "one.jpg")!.photoId;
    const p2 = copy.photoManifest.find((p) => p.relativePath === "two.jpg")!.photoId;
    const [item1, item2] = table.entryOrder;
    expect(item1).not.toBe(p1);
    expect(item2).not.toBe(p2);
    expect(item1).not.toBe(item2);
    expect(table.placements[item1]).toMatchObject({ id: item1, photoId: p1, x: 10, y: 20 });
    expect(table.placements[item2]).toMatchObject({ id: item2, photoId: p2, x: 210, y: 20 });
    expect(table.groups[0].photoIds).toEqual([item1, item2]);
    expect(table.links[0].photoIds).toEqual([item1, item2]);
    expect(table.memos?.[0]).toMatchObject({ text: "Opening idea", photoIds: [item1] });
    expect(copy.project.coverPhotoId).toBe(p1);
    expect(copy.project.photoStates[p1]).toEqual({ decision: "pick", pinned: true });
    expect(copy.sequences[0].items.filter((i) => i.kind === "photo").map((i) => i.photoId)).toEqual([p1, p2, p1]);
    expect(copy.sequences[0].readingUnits).toEqual(backupFixture().sequences[0].readingUnits);
    expect(table.pileOrder).toEqual([copy.sequences[0].id]);
    const current = copy.versions.find((v) => v.id === copy.sequences[0].currentVersionId)!;
    expect(current.sequenceId).toBe(copy.sequences[0].id);
    expect(copy.versions.some((v) => v.id === current.parentVersionId)).toBe(true);
    expect(copy.project.sources[0].id).toBe(copy.photoManifest[0].sourceId);
    expect(copy.project.sources[0].id).not.toBe("source");
  });

  it("rejects corrupt, unsupported and unsafe backups before writing any project", async () => {
    const store = factory();
    for (const invalid of [null, { ...backupFixture(), schemaVersion: 999 }, { ...backupFixture(), versions: [] }, { ...backupFixture(), photoManifest: [{ sourceId: "source", photoId: "p1", relativePath: "../one.jpg" }] }]) {
      expect((await store.importBackup(backupBytes(invalid))).ok).toBe(false);
    }
    expect(await store.listProjects()).toMatchObject({ ok: true, value: [] });
  });

  it("imports the previous backup schema and upgrades its Table instances", async () => {
    const store = factory();
    const legacy = { ...backupFixture(), schemaVersion: 2 };
    const imported = await store.importBackup(backupBytes(legacy));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const exported = await store.exportBackup(imported.value);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const copy = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1;
    const [itemId] = copy.project.worktableDraft.entryOrder;
    expect(copy.project.schemaVersion).toBe(10);
    expect(copy.project.layoutIds).toEqual([]);
    expect(copy.project.worktableDraft.frameOrder).toEqual([]);
    expect(copy.project.worktableDraft.frames).toEqual({});
    expect(copy.project.worktableDraft.placements[itemId]).toMatchObject({ id: itemId });
  });
});

it("rolls back the entire IndexedDB import if writing a photo record fails", async () => {
  const store = browserStore();
  await store.listProjects();
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
    if (this.name === "photo-index") throw new DOMException("Full", "QuotaExceededError");
    return add.call(this, value, key);
  });
  expect(await store.importBackup(backupBytes())).toMatchObject({ ok: false, error: { kind: "quota-exceeded" } });
  expect(await store.listProjects()).toMatchObject({ ok: true, value: [] });
});

it("installs a cloud snapshot under its stable project ID and replaces it atomically", async () => {
  const store = browserStore();
  const snapshot = backupFixture();
  expect(await store.installCloudSnapshot(snapshot)).toEqual({ ok: true, value: undefined });
  const id = snapshot.project.projectId;
  const first = await store.exportBackup(id);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect((JSON.parse(new TextDecoder().decode(first.value)) as ProjectBackupV1).project.name).toBe(snapshot.project.name);

  const updated = { ...snapshot, project: { ...snapshot.project, name: "Cloud edit" }, photoManifest: snapshot.photoManifest.slice(0, 1) };
  expect(await store.installCloudSnapshot(updated)).toEqual({ ok: true, value: undefined });
  const exported = await store.exportBackup(id);
  if (!exported.ok) throw new Error("Cloud snapshot missing");
  const document = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1;
  expect(document.project.projectId).toBe(id);
  expect(document.project.name).toBe("Cloud edit");
  expect(document.photoManifest).toHaveLength(1);
  expect((await store.listProjects()).ok).toBe(true);
});
