import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type CloudProjectSnapshot, type ProjectCloud, type ProjectId } from "../../contracts";
import { IndexedDbProjectStore } from "../browser/IndexedDbProjectStore";
import { STORE_NAMES } from "../browser/indexedDbSchema";
import { CloudBackedProjectStore } from "./CloudBackedProjectStore";

const id = "cached-project" as ProjectId, badId = "broken-project" as ProjectId;
const stores: CloudBackedProjectStore[] = [], caches: IndexedDbProjectStore[] = [];
afterEach(async () => { stores.splice(0).forEach((store) => store.dispose()); await Promise.all(caches.splice(0).map((cache) => cache.close())); vi.restoreAllMocks(); });
function fixture() {
  const rows = new Map<ProjectId, CloudProjectSnapshot>();
  let offline = false;
  const cloud: ProjectCloud = {
    list: vi.fn(async () => offline ? err({ kind: "unavailable", retryable: true } as const) : ok([...rows.values()].map(({ document: _document, ...summary }) => summary))),
    pull: vi.fn(async (projectId: ProjectId) => offline ? err({ kind: "unavailable", retryable: true } as const) : rows.has(projectId) ? ok(structuredClone(rows.get(projectId)!)) : err({ kind: "not-found", projectId } as const)),
    push: async (input) => {
      if (offline) return err({ kind: "unavailable", retryable: true });
      const previous = rows.get(input.projectId);
      if ((previous?.cloudRevision ?? null) !== input.expectedCloudRevision) return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: previous?.cloudRevision ?? 0 });
      const value = { projectId: input.projectId, name: input.name, schemaVersion: input.schemaVersion,
        cloudRevision: (previous?.cloudRevision ?? -1) + 1, updatedAt: "2026-10-07", document: structuredClone(input.document) };
      rows.set(input.projectId, value); return ok(value);
    },
    delete: async (projectId) => { rows.delete(projectId); return ok(undefined); },
  };
  const databaseName = `cache-availability-${crypto.randomUUID()}`;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const open = (name = databaseName) => {
    const local = IndexedDbProjectStore.open({ databaseName: name }); caches.push(local);
    const store = new CloudBackedProjectStore(local, cloud, storage, name); stores.push(store);
    return { local, store };
  };
  const seed = async () => { const first = open(); await first.store.createProject({ id, name: "Cached", createdAt: "2026-10-07" }); expect(await first.store.flushPending()).toBe(true); first.store.dispose(); return first; };
  return { rows, cloud, storage, databaseName, open, seed, setOffline: (value: boolean) => { offline = value; } };
}
async function readRaw(databaseName: string, action: (db: IDBDatabase) => Promise<void>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { await action(db); } finally { db.close(); }
}

describe("account-scoped cache availability", () => {
  it("reopens offline, saves and reopens pending edits, then syncs after reconnecting", async () => {
    const f = fixture(), first = await f.seed(); await first.local.close();
    f.setOffline(true);
    const second = f.open();
    expect(await second.store.listProjects()).toMatchObject({ ok: true, value: [{ id, name: "Cached" }] });
    const loaded = await second.store.loadWorkspace(id); if (!loaded.ok) throw Error("offline cache missing");
    expect(second.store.getStatus(id)).toBe("cached");
    expect((await second.store.saveWorkspace({ ...loaded.value, name: "Offline edit" }, loaded.value.revision)).ok).toBe(true);
    expect(await second.store.flushPending()).toBe(false);
    expect(second.store.getStatus(id)).toBe("retrying");
    second.store.dispose(); await second.local.close();
    const third = f.open();
    expect(await third.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Offline edit" } });
    expect(third.store.hasPending()).toBe(true);
    f.setOffline(false);
    expect(await third.store.flushPending()).toBe(true);
    expect(f.rows.get(id)?.document.project.name).toBe("Offline edit");
    expect(third.store.getStatus(id)).toBe("saved");
  });

  it("reads a registered cache without waiting for an unresolved cloud list", async () => {
    const f = fixture(); await f.seed();
    let release!: (value: Awaited<ReturnType<ProjectCloud["list"]>>) => void;
    vi.mocked(f.cloud.list).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const opened = f.open();
    try {
      expect(await opened.store.listProjects()).toMatchObject({ ok: true, value: [{ id }] });
      expect(await opened.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Cached" } });
    } finally { release(ok([])); }
  });

  it("keeps unregistered local projects hidden and another account unavailable offline", async () => {
    const f = fixture(), first = await f.seed();
    const oldId = "local-only" as ProjectId;
    await first.local.createProject({ id: oldId, name: "Legacy local", createdAt: "2026-10-07" });
    f.setOffline(true);
    const reopened = f.open();
    expect(await reopened.store.listProjects()).toMatchObject({ ok: true, value: [{ id }] });
    expect(await reopened.store.loadWorkspace(oldId)).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect((await first.local.loadWorkspace(oldId)).ok).toBe(true);
    const other = f.open(f.databaseName + "-other-account");
    expect(await other.store.listProjects()).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });

  it("lists summaries without pulling any project and isolates an invalid cloud snapshot", async () => {
    const f = fixture(); await f.seed();
    const remote = f.rows.get(id)!;
    f.rows.set(badId, { ...remote, projectId: badId, name: "Broken", document: { ...remote.document, project: { ...remote.document.project, projectId: badId, worktableDraft: null } } } as unknown as CloudProjectSnapshot);
    vi.mocked(f.cloud.pull).mockClear();
    const fresh = f.open(f.databaseName + "-fresh-device");
    const listed = await fresh.store.listProjects();
    expect(listed.ok && listed.value.map((summary) => summary.id).sort()).toEqual([badId, id].sort());
    expect(f.cloud.pull).not.toHaveBeenCalled();
    expect(await fresh.store.loadWorkspace(badId)).toMatchObject({ ok: false, error: { kind: "corrupt-data", entityId: badId } });
    const failedVersion = fresh.store.getProjectListVersion();
    expect((await fresh.store.loadWorkspace(badId)).ok).toBe(false);
    expect(fresh.store.getProjectListVersion()).toBe(failedVersion);
    expect(await fresh.store.listProjects()).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ id: badId, loadError: "corrupt-data" })]) });
    expect(await fresh.store.loadWorkspace(id)).toMatchObject({ ok: true, value: { name: "Cached" } });
    expect(fresh.store.getProjectIssue(badId)).toMatchObject({ kind: "corrupt-data" });
    const recovered = await fresh.store.exportRecoveryData(badId); if (!recovered.ok) throw Error("raw snapshot missing");
    expect(JSON.parse(new TextDecoder().decode(recovered.value)).cloudSnapshot.document.project.worktableDraft).toBeNull();
    expect((await fresh.local.loadWorkspace(badId)).ok).toBe(false);
    expect((await fresh.store.listProjects()).ok).toBe(true);
  });

  it("retains a corrupt local row, identifies it in the list and exports its raw data", async () => {
    const f = fixture(), first = await f.seed();
    await readRaw(f.databaseName, async (db) => {
      const tx = db.transaction(STORE_NAMES.projects, "readwrite");
      tx.objectStore(STORE_NAMES.projects).put({ projectId: badId, name: "Damaged local", worktableDraft: null });
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    });
    expect(await first.local.listProjects()).toMatchObject({ ok: true, value: expect.arrayContaining([{ id: badId, name: "Damaged local", loadError: "corrupt-data", updatedAt: "", lastOpenedAt: "", sourceCount: 0, tableCount: 0 }]) });
    expect(await first.local.loadWorkspace(badId)).toMatchObject({ ok: false, error: { kind: "corrupt-data", entityId: badId } });
    expect((await first.local.loadWorkspace(id)).ok).toBe(true);
    const data = await first.local.exportRecoveryData(badId); if (!data.ok) throw Error("raw local record missing");
    expect(JSON.parse(new TextDecoder().decode(data.value)).project).toEqual({ projectId: badId, name: "Damaged local", worktableDraft: null });
    const remote = f.rows.get(id)!;
    f.rows.set(badId, { ...remote, projectId: badId, document: { ...remote.document, project: { ...remote.document.project, projectId: badId } } });
    const reopened = f.open(); await reopened.store.listProjects();
    await vi.waitFor(() => expect(f.cloud.list).toHaveBeenCalled());
    expect(await reopened.store.loadWorkspace(badId)).toMatchObject({ ok: false, error: { kind: "corrupt-data" } });
    expect(await first.local.exportRecoveryData(badId)).toEqual(data);
  });

  it("retries a temporarily unreadable project without blocking other projects", async () => {
    const f = fixture(); await f.seed();
    const remote = f.rows.get(id)!;
    f.rows.set(badId, { ...remote, projectId: badId, name: "Recovered", document: { ...remote.document,
      project: { ...remote.document.project, projectId: badId, name: "Recovered", worktableDraft: { ...remote.document.project.worktableDraft, projectId: badId } } } });
    const fresh = f.open(f.databaseName + "-fresh-device"); await fresh.store.listProjects();
    vi.mocked(f.cloud.pull).mockResolvedValueOnce(err({ kind: "unavailable", retryable: true }));
    expect((await fresh.store.loadWorkspace(badId)).ok).toBe(false);
    expect((await fresh.store.loadWorkspace(id)).ok).toBe(true);
    expect((await fresh.store.retryProject(badId)).ok).toBe(true);
    expect(await fresh.store.loadWorkspace(badId)).toMatchObject({ ok: true, value: { name: "Recovered" } });
    expect(fresh.store.getProjectIssue(badId)).toBeUndefined();
  });
});
