import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { MemoryProjectStore } from "../../src/platform/memory/MemoryProjectStore";
import type { ProjectBackupV1, ProjectStore } from "../../src/contracts";
import { backupBytes, backupFixture } from "../helpers/projectBackup";

const opened: IndexedDbProjectStore[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(opened.splice(0).map((s) => s.close())); });
function browserStore() { const s = IndexedDbProjectStore.open({ databaseName: `backup-${crypto.randomUUID()}` }); opened.push(s); return s; }

for (const [name, factory] of [["memory", () => new MemoryProjectStore()], ["IndexedDB", browserStore]] as const) describe(name, () => {
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
    expect(copy.project.schemaVersion).toBe(8);
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
