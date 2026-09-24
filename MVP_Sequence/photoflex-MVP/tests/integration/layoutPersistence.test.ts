import { afterEach, describe, expect, it } from "vitest";
import type { LayoutId, LayoutObjectId, LayoutPageId, PhotoId, ProjectBackupV1, ProjectStore } from "../../src/contracts";
import { applyLayoutCommand, createEmptyLayout } from "../../src/modules/layout/layoutDocument";
import { MM_TO_PT } from "../../src/modules/page-layout/pageGeometry";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { MemoryProjectStore } from "../../src/platform/memory/MemoryProjectStore";
import { backupBytes } from "../helpers/projectBackup";

const opened: IndexedDbProjectStore[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((store) => store.close())); });
function browserStore() { const store = IndexedDbProjectStore.open({ databaseName: `layout-${crypto.randomUUID()}` }); opened.push(store); return store; }

for (const [name, factory] of [["memory", () => new MemoryProjectStore()], ["IndexedDB", browserStore]] as const) describe(`${name} Layout persistence`, () => {
  it("creates one Layout per Sequence, saves revisions and copies page/photo references through backup", async () => {
    const store: ProjectStore = factory();
    const imported = await store.importBackup(backupBytes());
    if (!imported.ok) throw Error("fixture import failed");
    const workspace = await store.loadWorkspace(imported.value);
    const sequences = await store.listSequences(imported.value);
    if (!workspace.ok || !sequences.ok) throw Error("fixture load failed");
    const first = createEmptyLayout({ id: "layout-original" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
      pageId: "page-original" as LayoutPageId, name: "Opening", createdAt: "2026-09-24T00:00:00.000Z" });
    const created = await store.createLayout(imported.value, workspace.value.revision, first);
    expect(created.ok).toBe(true);
    const duplicate = await store.createLayout(imported.value, created.ok ? created.value.revision : workspace.value.revision, { ...first, id: "layout-duplicate" as LayoutId });
    expect(duplicate).toMatchObject({ ok: false, error: { kind: "layout-exists-for-sequence" } });

    const originalExport = await store.exportBackup(imported.value);
    if (!originalExport.ok) throw Error("export failed");
    const sourceManifest = (JSON.parse(new TextDecoder().decode(originalExport.value)) as ProjectBackupV1).photoManifest;
    const sourcePhoto = sourceManifest.find((photo) => photo.relativePath === "one.jpg")!.photoId;
    const frame = { kind: "image-frame" as const, id: "frame-original" as LayoutObjectId,
      rect: { x: 20, y: 20, width: 200, height: 240 }, photoId: sourcePhoto,
      crop: { mode: "fill" as const, zoom: 1.4, focal: { x: .4, y: .6 } } };
    const edited = { ...first, pages: [{ ...first.pages[0], objects: [frame] }, { id: "page-second" as LayoutPageId, objects: [] }] };
    const saved = await store.saveLayout(edited, first.revision);
    expect(saved.ok).toBe(true);
    expect(await store.saveLayout({ ...edited, name: "Stale" }, first.revision)).toMatchObject({ ok: false, error: { kind: "layout-conflict" } });
    const loaded = await store.loadLayout(first.id);
    expect(loaded).toMatchObject({ ok: true, value: { name: "Opening", pages: [{ objects: [frame] }, { objects: [] }] } });
    expect(await store.listLayouts(imported.value)).toMatchObject({ ok: true, value: [{ id: first.id, pageCount: 2 }] });

    if (!loaded.ok || !saved.ok) throw Error("saved layout unavailable");
    const resized = applyLayoutCommand(loaded.value, { type: "set-page-size", widthPt: 148 * MM_TO_PT, heightPt: 210 * MM_TO_PT });
    if (!resized.ok) throw Error("resize rejected");
    expect((await store.saveLayout(resized.value, saved.value.revision)).ok).toBe(true);
    expect(await store.loadLayout(first.id)).toMatchObject({ ok: true, value: { pageSpec: { widthPt: 148 * MM_TO_PT, heightPt: 210 * MM_TO_PT } } });

    const exported = await store.exportBackup(imported.value);
    if (!exported.ok) throw Error("export failed");
    const copyStore: ProjectStore = factory();
    const copyId = await copyStore.importBackup(exported.value);
    if (!copyId.ok) throw Error("copy failed");
    const copyBytes = await copyStore.exportBackup(copyId.value);
    if (!copyBytes.ok) throw Error("copy export failed");
    const copy = JSON.parse(new TextDecoder().decode(copyBytes.value)) as ProjectBackupV1;
    expect(copy.layouts).toHaveLength(1);
    expect(copy.layouts[0].id).not.toBe(first.id);
    expect(copy.layouts[0].sequenceId).toBe(copy.sequences[0].id);
    expect(copy.layouts[0].pages[0].id).not.toBe(first.pages[0].id);
    expect(copy.layouts[0].pages[0].objects[0].id).not.toBe(frame.id);
    const copiedPhoto = copy.photoManifest.find((photo) => photo.relativePath === "one.jpg")!.photoId;
    expect((copy.layouts[0].pages[0].objects[0] as { photoId: PhotoId }).photoId).toBe(copiedPhoto);
    expect(copiedPhoto).not.toBe(sourcePhoto);
    expect((await copyStore.deleteProject(copyId.value)).ok).toBe(true);
    expect(await copyStore.loadLayout(copy.layouts[0].id)).toMatchObject({ ok: false, error: { kind: "not-found" } });
  });

  it("removes the associated Layout when its Sequence or project is deleted", async () => {
    const store: ProjectStore = factory();
    const imported = await store.importBackup(backupBytes());
    if (!imported.ok) throw Error("fixture import failed");
    const workspace = await store.loadWorkspace(imported.value);
    const sequences = await store.listSequences(imported.value);
    if (!workspace.ok || !sequences.ok) throw Error("fixture load failed");
    const layout = createEmptyLayout({ id: "layout-delete" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
      pageId: "page-delete" as LayoutPageId, name: "Delete", createdAt: "2026-09-24T00:00:00.000Z" });
    const created = await store.createLayout(imported.value, workspace.value.revision, layout);
    if (!created.ok) throw Error("create failed");
    const draft = { ...workspace.value.worktableDraft, pileOrder: [], pilePlacements: {} };
    const removed = await store.deleteSequences(imported.value, [layout.sequenceId], created.value.revision, draft);
    expect(removed).toMatchObject({ ok: true, value: { layoutIds: [] } });
    expect(await store.loadLayout(layout.id)).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(await store.listLayouts(imported.value)).toMatchObject({ ok: true, value: [] });
    expect((await store.deleteProject(imported.value)).ok).toBe(true);
  });
});
