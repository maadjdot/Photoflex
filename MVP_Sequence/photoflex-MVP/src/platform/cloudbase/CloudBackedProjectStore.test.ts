import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type CloudProjectSnapshot, type LayoutId, type LayoutPageId, type ProjectCloud, type ProjectId, type SourceId } from "../../contracts";
import { createEmptyLayout } from "../../modules/layout/layoutDocument";
import { backupBytes } from "../../../tests/helpers/projectBackup";
import { MemoryProjectStore } from "../memory/MemoryProjectStore";
import { CloudBackedProjectStore } from "./CloudBackedProjectStore";

const id = "b1990192-73a2-4a09-a21a-d3c47fa164e6" as ProjectId;
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
function cloudFixture() {
  const rows = new Map<ProjectId, CloudProjectSnapshot>();
  let unavailable = false;
  const cloud: ProjectCloud = {
    async list() { return ok([...rows.values()].map(({ document: _document, ...summary }) => summary)); },
    async pull(projectId) { return rows.has(projectId) ? ok(rows.get(projectId)!) : err({ kind: "not-found", projectId }); },
    async push(input) {
      if (unavailable) return err({ kind: "unavailable", retryable: true });
      const previous = rows.get(input.projectId);
      if ((previous?.cloudRevision ?? null) !== input.expectedCloudRevision) return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: previous?.cloudRevision ?? 0 });
      const value = { projectId: input.projectId, name: input.name, schemaVersion: input.schemaVersion, cloudRevision: (previous?.cloudRevision ?? -1) + 1, updatedAt: "2026-09-16T00:00:00.000Z", document: input.document };
      rows.set(input.projectId, value);
      return ok(value);
    },
    async delete(projectId, revision) {
      const previous = rows.get(projectId);
      if (!previous) return ok(undefined);
      if (previous.cloudRevision !== revision) return err({ kind: "conflict", expectedRevision: revision, actualRevision: previous.cloudRevision });
      rows.delete(projectId);
      return ok(undefined);
    },
  };
  return { cloud, rows, setUnavailable(value: boolean) { unavailable = value; } };
}

const opened: CloudBackedProjectStore[] = [];
function open(local: MemoryProjectStore, cloud: ProjectCloud, accountStorage = storage()) {
  const store = new CloudBackedProjectStore(local, cloud, accountStorage, "cloud-test:user-1");
  opened.push(store);
  return store;
}
afterEach(() => { opened.forEach((store) => store.dispose()); opened.length = 0; });

describe("CloudBackedProjectStore", () => {
  it("syncs a Layout document and its edits into another browser", async () => {
    const { cloud } = cloudFixture();
    const first = open(new MemoryProjectStore(), cloud);
    const imported = await first.importBackup(backupBytes());
    if (!imported.ok) throw Error("fixture import failed");
    const workspace = await first.loadWorkspace(imported.value);
    const sequences = await first.listSequences(imported.value);
    if (!workspace.ok || !sequences.ok) throw Error("fixture load failed");
    const layout = createEmptyLayout({ id: "cloud-layout" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
      pageId: "cloud-page" as LayoutPageId, name: "Initial", createdAt: "2026-09-24T00:00:00.000Z" });
    expect((await first.createLayout(imported.value, workspace.value.revision, layout)).ok).toBe(true);
    expect((await first.saveLayout({ ...layout, name: "Cloud Layout" }, layout.revision)).ok).toBe(true);
    expect(await first.flushPending()).toBe(true);
    const second = open(new MemoryProjectStore(), cloud);
    expect(await second.loadWorkspace(imported.value)).toMatchObject({ ok: true, value: { layoutIds: [layout.id] } });
    expect(await second.loadLayout(layout.id)).toMatchObject({ ok: true, value: { name: "Cloud Layout", revision: 1 } });
  });

  it("creates, autosaves, and opens the same project ID in another browser", async () => {
    const { cloud, rows } = cloudFixture();
    const first = open(new MemoryProjectStore(), cloud);
    const created = await first.createProject({ id, name: "Cloud original", createdAt: "2026-09-16T00:00:00.000Z" });
    expect(created.ok).toBe(true);
    expect(await first.flushPending()).toBe(true);
    expect(rows.get(id)?.name).toBe("Cloud original");

    const second = open(new MemoryProjectStore(), cloud);
    const listed = await second.listProjects();
    expect(listed.ok && listed.value.map((project) => project.id)).toEqual([id]);
    const loaded = await second.loadWorkspace(id);
    expect(loaded.ok && loaded.value.name).toBe("Cloud original");
    if (!loaded.ok) return;
    const saved = await second.saveWorkspace({ ...loaded.value, name: "Edited elsewhere" }, loaded.value.revision);
    expect(saved.ok).toBe(true);
    expect(await second.flushPending()).toBe(true);
    const third = open(new MemoryProjectStore(), cloud);
    const reopened = await third.loadWorkspace(id);
    expect(reopened.ok && reopened.value.name).toBe("Edited elsewhere");
  });

  it("hides old local-only projects without deleting their data", async () => {
    const { cloud } = cloudFixture();
    const local = new MemoryProjectStore();
    await local.createProject({ id, name: "Old local", createdAt: "2026-09-16T00:00:00.000Z" });
    const store = open(local, cloud);
    const listed = await store.listProjects();
    expect(listed.ok && listed.value).toEqual([]);
    expect((await local.loadWorkspace(id)).ok).toBe(true);
  });

  it("keeps local edits and retries automatically after a cloud outage", async () => {
    const fixture = cloudFixture();
    const store = open(new MemoryProjectStore(), fixture.cloud);
    fixture.setUnavailable(true);
    await store.createProject({ id, name: "Pending", createdAt: "2026-09-16T00:00:00.000Z" });
    expect(await store.flushPending()).toBe(false);
    expect(store.getStatus(id)).toBe("retrying");
    fixture.setUnavailable(false);
    expect(await store.flushPending()).toBe(true);
    expect(fixture.rows.get(id)?.name).toBe("Pending");
  });

  it("does not overwrite concurrent cloud changes", async () => {
    const fixture = cloudFixture();
    const store = open(new MemoryProjectStore(), fixture.cloud);
    await store.createProject({ id, name: "Original", createdAt: "2026-09-16T00:00:00.000Z" });
    await store.flushPending();
    const external = fixture.rows.get(id)!;
    fixture.rows.set(id, { ...external, cloudRevision: external.cloudRevision + 1, name: "External" });
    const local = await store.loadWorkspace(id);
    if (!local.ok) throw new Error("Missing local workspace");
    await store.saveWorkspace({ ...local.value, name: "Local edit" }, local.value.revision);
    expect(await store.flushPending()).toBe(false);
    expect(store.getStatus(id)).toBe("conflict");
    expect(fixture.rows.get(id)?.name).toBe("External");
    const retained = await store.loadWorkspace(id);
    expect(retained.ok && retained.value.name).toBe("Local edit");
  });

  it("refuses a local write when its durable pending marker cannot be stored", async () => {
    const fixture = cloudFixture();
    const local = new MemoryProjectStore();
    const accountStorage = storage();
    const setItem = vi.spyOn(accountStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage disabled", "QuotaExceededError"); });
    const store = open(local, fixture.cloud, accountStorage);
    const created = await store.createProject({ id, name: "Never untracked", createdAt: "2026-09-16T00:00:00.000Z" });
    expect(created).toEqual({ ok: false, error: { kind: "unavailable", retryable: true } });
    expect((await local.loadWorkspace(id)).ok).toBe(false);
    expect(fixture.rows.has(id)).toBe(false);
    setItem.mockRestore();
  });

  it("does not import a recovery copy without a pending marker", async () => {
    const source = new MemoryProjectStore();
    await source.createProject({ id, name: "Recovery", createdAt: "2026-09-16T00:00:00.000Z" });
    const backup = await source.exportBackup(id);
    if (!backup.ok) throw new Error("Missing backup");
    const local = new MemoryProjectStore();
    const accountStorage = storage();
    vi.spyOn(accountStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage disabled", "QuotaExceededError"); });
    const store = open(local, cloudFixture().cloud, accountStorage);
    expect(await store.importBackup(backup.value)).toEqual({ ok: false, error: { kind: "unavailable", retryable: true } });
    const projects = await local.listProjects();
    expect(projects.ok && projects.value).toEqual([]);
  });

  it("keeps the marker pending while a local write is still in progress", async () => {
    const fixture = cloudFixture();
    const local = new MemoryProjectStore();
    const accountStorage = storage();
    const store = open(local, fixture.cloud, accountStorage);
    await store.createProject({ id, name: "Before", createdAt: "2026-09-16T00:00:00.000Z" });
    expect(await store.flushPending()).toBe(true);
    const loaded = await store.loadWorkspace(id);
    if (!loaded.ok) throw new Error("Missing local workspace");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = local.saveWorkspace.bind(local);
    const save = vi.spyOn(local, "saveWorkspace").mockImplementation(async (...args) => { await gate; return original(...args); });
    const pending = store.saveWorkspace({ ...loaded.value, name: "After" }, loaded.value.revision);
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(JSON.parse(accountStorage.getItem(`cloud-test:user-1:${id}`)!).pending).toBe(true);
    expect(await store.flushPending()).toBe(false);
    release();
    expect((await pending).ok).toBe(true);
    expect(await store.flushPending()).toBe(true);
    expect(fixture.rows.get(id)?.name).toBe("After");
  });

  it("clears a new pending marker when the local transaction rejects the edit", async () => {
    const fixture = cloudFixture();
    const accountStorage = storage();
    const store = open(new MemoryProjectStore(), fixture.cloud, accountStorage);
    await store.createProject({ id, name: "Original", createdAt: "2026-09-16T00:00:00.000Z" });
    await store.flushPending();
    const loaded = await store.loadWorkspace(id);
    if (!loaded.ok) throw new Error("Missing local workspace");
    const rejected = await store.saveWorkspace({ ...loaded.value, name: "Rejected" }, -1 as typeof loaded.value.revision);
    expect(rejected.ok).toBe(false);
    expect(JSON.parse(accountStorage.getItem(`cloud-test:user-1:${id}`)!).pending).toBe(false);
    expect(store.hasPending()).toBe(false);
    expect(fixture.rows.get(id)?.name).toBe("Original");
  });

  it("acknowledges a matching cloud copy after a restart with a stale pending revision", async () => {
    const fixture = cloudFixture();
    const local = new MemoryProjectStore();
    const accountStorage = storage();
    const first = open(local, fixture.cloud, accountStorage);
    await first.createProject({ id, name: "Before", createdAt: "2026-09-16T00:00:00.000Z" });
    await first.flushPending();
    const loaded = await first.loadWorkspace(id);
    if (!loaded.ok) throw new Error("Missing local workspace");
    await first.saveWorkspace({ ...loaded.value, name: "After" }, loaded.value.revision);
    first.dispose();
    const exported = await local.exportBackup(id);
    if (!exported.ok) throw new Error("Missing local backup");
    const previous = fixture.rows.get(id)!;
    fixture.rows.set(id, { ...previous, name: "After", cloudRevision: previous.cloudRevision + 1, document: JSON.parse(new TextDecoder().decode(exported.value)) });
    const reopened = open(local, fixture.cloud, accountStorage);
    expect((await reopened.listProjects()).ok).toBe(true);
    expect(reopened.getStatus(id)).toBe("saved");
    expect(JSON.parse(accountStorage.getItem(`cloud-test:user-1:${id}`)!).pending).toBe(false);
  });

  it("retries a photo-index marker that could not be recorded after a scan", async () => {
    const fixture = cloudFixture();
    const accountStorage = storage();
    const store = open(new MemoryProjectStore(), fixture.cloud, accountStorage);
    const sourceId = "c1990192-73a2-4a09-a21a-d3c47fa164e6" as SourceId;
    await store.createProject({ id, name: "Photos", createdAt: "2026-09-16T00:00:00.000Z", initialSource: { id: sourceId, displayName: "Folder", createdAt: "2026-09-16T00:00:00.000Z" } });
    await store.flushPending();
    const original = accountStorage.setItem.bind(accountStorage);
    let failOnce = true;
    vi.spyOn(accountStorage, "setItem").mockImplementation((key, value) => {
      if (failOnce) { failOnce = false; throw new DOMException("Storage disabled", "QuotaExceededError"); }
      original(key, value);
    });
    vi.useFakeTimers();
    try {
      await store.photoIndexChanged(sourceId);
      expect(store.getStatus(id)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(3000);
      expect(accountStorage.getItem(`cloud-test:user-1:${id}`)).toContain('"pending":true');
      expect(await store.flushPending()).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
