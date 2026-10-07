import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type CloudProjectSnapshot, type LayoutId, type LayoutPageId, type ProjectCloud, type ProjectId } from "../../contracts";
import { IndexedDbProjectStore } from "../browser/IndexedDbProjectStore";
import { CloudBackedProjectStore } from "./CloudBackedProjectStore";
import { STORE_NAMES } from "../browser/indexedDbSchema";
import { createEmptyLayout } from "../../modules/layout/layoutDocument";
import { backupBytes } from "../../../tests/helpers/projectBackup";

const id = "project-concurrency" as ProjectId;
const opened: CloudBackedProjectStore[] = [];
const caches: IndexedDbProjectStore[] = [];
afterEach(async () => { opened.splice(0).forEach((store) => store.dispose()); await Promise.all(caches.splice(0).map((cache) => cache.close())); });
function fixture() {
  const rows = new Map<ProjectId, CloudProjectSnapshot>();
  const cloud: ProjectCloud = {
    list: async () => ok([...rows.values()].map(({ document: _document, ...summary }) => summary)),
    pull: async (projectId) => rows.has(projectId) ? ok(structuredClone(rows.get(projectId)!)) : err({ kind: "not-found", projectId }),
    push: async (input) => {
      const previous = rows.get(input.projectId);
      if ((previous?.cloudRevision ?? null) !== input.expectedCloudRevision) return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: previous?.cloudRevision ?? 0 });
      const value = { projectId: input.projectId, name: input.name, schemaVersion: input.schemaVersion,
        cloudRevision: (previous?.cloudRevision ?? -1) + 1, updatedAt: "now", document: structuredClone(input.document) };
      rows.set(input.projectId, value); return ok(value);
    },
    delete: async (projectId) => { rows.delete(projectId); return ok(undefined); },
  };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const databaseName = `cloud-concurrency-${crypto.randomUUID()}`;
  const open = () => {
    const local = IndexedDbProjectStore.open({ databaseName }); caches.push(local);
    const store = new CloudBackedProjectStore(local, cloud, storage, databaseName); opened.push(store);
    return { local, store };
  };
  return { cloud, rows, open, storage, databaseName };
}
const gate = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };

describe("durable cloud sync across independent IndexedDB connections", () => {
  it("does not acknowledge an edit made by another tab during an upload", async () => {
    const f = fixture(), a = f.open(), b = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" });
    expect(await a.store.flushPending()).toBe(true);
    expect((await b.store.listProjects()).ok).toBe(true);
    const before = await a.store.loadWorkspace(id); if (!before.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...before.value, name: "Edit A" }, before.value.revision);
    const upload = gate(), originalPush = f.cloud.push;
    vi.spyOn(f.cloud, "push").mockImplementationOnce(async (input) => { await upload.promise; return originalPush(input); });
    const flushing = a.store.flushPending();
    await vi.waitFor(() => expect(f.cloud.push).toHaveBeenCalledOnce());
    const current = await b.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    expect((await b.store.saveWorkspace({ ...current.value, name: "Edit B" }, current.value.revision)).ok).toBe(true);
    upload.release(); await flushing;
    expect(await b.store.flushPending()).toBe(true);
    expect(f.rows.get(id)?.document.project.name).toBe("Edit B");
    const reopened = f.open();
    expect(await reopened.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Edit B" } });
  });

  it("does not install a stale pull over an edit committed while another tab opens", async () => {
    const f = fixture(), a = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const pull = gate(), originalPull = f.cloud.pull;
    vi.spyOn(f.cloud, "pull").mockImplementationOnce(async (projectId) => { const snapshot = await originalPull(projectId); await pull.promise; return snapshot; });
    const b = f.open(), opening = b.store.loadWorkspace(id);
    await vi.waitFor(() => expect(f.cloud.pull).toHaveBeenCalledOnce());
    const current = await a.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "New local edit" }, current.value.revision);
    pull.release();
    expect(await opening).toMatchObject({ ok: true, value: { name: "Before" } });
    expect((await b.store.retryProject(id)).ok).toBe(true);
    expect(await b.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "New local edit" } });
    expect(await a.store.flushPending()).toBe(true);
    expect(f.rows.get(id)?.name).toBe("New local edit");
  });

  it("commits the dirty revision atomically and leaves it unchanged for a rejected edit", async () => {
    const f = fixture(), a = f.open(), b = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const before = await a.local.readCloudSyncState(id); if (!before.ok || !before.value) throw Error("missing journal");
    const current = await b.local.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    expect((await b.local.saveWorkspace({ ...current.value, name: "Committed" }, current.value.revision)).ok).toBe(true);
    const snapshot = await a.local.captureCloudSnapshot(id);
    expect(snapshot).toMatchObject({ ok: true, value: { document: { project: { name: "Committed" } }, sync: { localRevision: before.value.localRevision + 1 } } });
    expect((await b.local.saveWorkspace({ ...current.value, name: "Rejected" }, current.value.revision)).ok).toBe(false);
    const rejected = await a.local.captureCloudSnapshot(id);
    expect(rejected).toMatchObject({ ok: true, value: { document: { project: { name: "Committed" } }, sync: { localRevision: before.value.localRevision + 1 } } });
    expect(await a.local.acknowledgeCloudSnapshot(id, before.value.localRevision, before.value.cloudRevision!))
      .toMatchObject({ ok: true, value: { localRevision: before.value.localRevision + 1, acknowledgedRevision: before.value.acknowledgedRevision } });
  });

  it("retains a recovery copy before replacing a conflict with the cloud version", async () => {
    const f = fixture(), a = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const remote = f.rows.get(id)!;
    f.rows.set(id, { ...remote, cloudRevision: remote.cloudRevision + 1, name: "Remote", document: { ...remote.document, project: { ...remote.document.project, name: "Remote" } } });
    const current = await a.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "Local conflict" }, current.value.revision);
    expect(await a.store.flushPending()).toBe(false);
    const reopened = f.open();
    expect(await reopened.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Local conflict" } });
    expect(reopened.store.getStatus(id)).toBe("conflict");
    const resolved = await a.store.resolveConflict(id); if (!resolved.ok) throw Error("resolution failed");
    expect(await a.local.loadWorkspace(resolved.value)).toMatchObject({ ok: true, value: { name: "Local conflict (restored)" } });
    expect(await a.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Remote" } });
    expect(a.store.getStatus(id)).toBe("saved");
    expect((await a.store.saveWorkspace({ ...current.value, name: "Stale draft" }, current.value.revision)).ok).toBe(false);
  });

  it("rolls back both the document and journal when the journal write transaction aborts", async () => {
    const f = fixture(), a = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const current = await a.local.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    const before = await a.local.readCloudSyncState(id), originalPut = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = originalPut.apply(this, args);
      if (this.name === STORE_NAMES.cloudSync) request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
    try { expect((await a.local.saveWorkspace({ ...current.value, name: "Never committed" }, current.value.revision)).ok).toBe(false); }
    finally { abort.mockRestore(); }
    expect(await a.local.loadWorkspace(id)).toEqual(current);
    expect(await a.local.readCloudSyncState(id)).toEqual(before);
  });

  it("keeps newer local edits when they arrive while conflict recovery is pulling cloud", async () => {
    const f = fixture(), a = f.open(), b = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending(); await b.store.listProjects();
    const remote = f.rows.get(id)!;
    f.rows.set(id, { ...remote, cloudRevision: remote.cloudRevision + 1, document: { ...remote.document, project: { ...remote.document.project, name: "Remote" } } });
    const current = await a.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "First local edit" }, current.value.revision); await a.store.flushPending();
    const pull = gate(), originalPull = f.cloud.pull;
    vi.spyOn(f.cloud, "pull").mockImplementationOnce(async (id) => { const snapshot = await originalPull(id); await pull.promise; return snapshot; });
    const recovering = a.store.resolveConflict(id);
    await vi.waitFor(() => expect(f.cloud.pull).toHaveBeenCalledOnce());
    try {
      const latest = await b.store.loadWorkspace(id); if (!latest.ok) throw Error("missing workspace");
      expect((await b.store.saveWorkspace({ ...latest.value, name: "Newer local edit" }, latest.value.revision)).ok).toBe(true);
    } finally { pull.release(); }
    expect((await recovering).ok).toBe(false);
    expect(await a.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Newer local edit" } });
    expect(a.store.getStatus(id)).toBe("conflict");
  });

  it("does not replace local content if the recovery copy cannot be stored", async () => {
    const f = fixture(), a = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const remote = f.rows.get(id)!;
    f.rows.set(id, { ...remote, cloudRevision: remote.cloudRevision + 1 });
    const current = await a.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "Local conflict" }, current.value.revision); await a.store.flushPending();
    const install = vi.spyOn(a.local, "installCloudSnapshot").mockResolvedValueOnce(err({ kind: "quota-exceeded" }));
    expect(await a.store.resolveConflict(id)).toEqual(err({ kind: "quota-exceeded" }));
    expect(install).toHaveBeenCalledOnce();
    expect(await a.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Local conflict" } });
    expect(a.store.getStatus(id)).toBe("conflict");
  });

  it("recovers after cloud committed but the durable acknowledgement failed", async () => {
    const f = fixture(), a = f.open();
    await a.store.createProject({ id, name: "Before", createdAt: "now" }); await a.store.flushPending();
    const current = await a.store.loadWorkspace(id); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "Committed remotely" }, current.value.revision);
    vi.spyOn(a.local, "acknowledgeCloudSnapshot").mockResolvedValueOnce(err({ kind: "unavailable", retryable: true }));
    expect(await a.store.flushPending()).toBe(false);
    expect(await a.store.flushPending()).toBe(true);
    expect(a.store.getStatus(id)).toBe("saved");
    expect(f.rows.get(id)?.name).toBe("Committed remotely");
  });

  it("migrates a legacy pending marker before uploading an unsynced local project", async () => {
    const f = fixture(), a = f.open();
    await a.local.createProject({ id, name: "Legacy pending edit", createdAt: "now" });
    const key = f.databaseName + ":" + id;
    f.storage.setItem(key, JSON.stringify({ revision: null, pending: true }));
    expect(await a.store.listProjects()).toMatchObject({ ok: true, value: [{ name: "Legacy pending edit" }] });
    expect(f.storage.getItem(key)).toBeNull();
    expect(await a.local.readCloudSyncState(id)).toMatchObject({ ok: true, value: { localRevision: 1, acknowledgedRevision: 0 } });
    expect(await a.store.flushPending()).toBe(true);
    expect(f.rows.get(id)?.name).toBe("Legacy pending edit");
  });

  it("rejects stale Sequence and Layout drafts after loading changed cloud documents", async () => {
    const f = fixture(), a = f.open();
    const imported = await a.store.importBackup(backupBytes()); if (!imported.ok) throw Error("fixture import failed");
    const projectId = imported.value, workspace = await a.store.loadWorkspace(projectId), listed = await a.store.listSequences(projectId);
    if (!workspace.ok || !listed.ok) throw Error("fixture load failed");
    const sequence = await a.store.loadSequence(listed.value[0].id); if (!sequence.ok) throw Error("missing Sequence");
    const layout = createEmptyLayout({ id: "conflict-layout" as LayoutId, projectId, sequenceId: sequence.value.id,
      pageId: "conflict-page" as LayoutPageId, name: "Original layout", createdAt: "now" });
    expect((await a.store.createLayout(projectId, workspace.value.revision, layout)).ok).toBe(true);
    expect(await a.store.flushPending()).toBe(true);
    const remote = f.rows.get(projectId)!;
    f.rows.set(projectId, { ...remote, cloudRevision: remote.cloudRevision + 1, document: { ...remote.document,
      sequences: remote.document.sequences.map((value) => ({ ...value, name: "Cloud Sequence" })),
      layouts: remote.document.layouts.map((value) => ({ ...value, name: "Cloud Layout" })),
    } });
    const current = await a.store.loadWorkspace(projectId); if (!current.ok) throw Error("missing workspace");
    await a.store.saveWorkspace({ ...current.value, name: "Local conflict" }, current.value.revision);
    expect(await a.store.flushPending()).toBe(false);
    expect((await a.store.resolveConflict(projectId)).ok).toBe(true);
    expect(await a.store.saveSequence(sequence.value, sequence.value.revision)).toMatchObject({ ok: false, error: { kind: "sequence-conflict" } });
    expect(await a.store.saveLayout(layout, layout.revision)).toMatchObject({ ok: false, error: { kind: "layout-conflict" } });
    expect(await a.store.loadSequence(sequence.value.id)).toMatchObject({ ok: true, value: { name: "Cloud Sequence" } });
    expect(await a.store.loadLayout(layout.id)).toMatchObject({ ok: true, value: { name: "Cloud Layout" } });
  });
});
