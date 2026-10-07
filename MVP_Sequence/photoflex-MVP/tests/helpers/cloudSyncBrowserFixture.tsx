import { createRoot } from "react-dom/client";
import { err, ok, type AccountSession, type CloudProjectSnapshot, type ProjectCloud, type ProjectId } from "../../src/contracts";
import { M1App } from "../../src/app/M1App";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { MemoryPhotoSource } from "../../src/platform/memory/MemoryPhotoSource";
import { CloudBackedProjectStore } from "../../src/platform/cloudbase/CloudBackedProjectStore";

/** Test-only cloud fixture. Each Playwright context owns its fake rows and local database. */
export async function mountCloudSyncFixture({ databaseName, seed = false, home = false }: { databaseName: string; seed?: boolean; home?: boolean }) {
  const id = "sync-project" as ProjectId, rowKey = databaseName + ":fake-cloud";
  const read = (): Record<string, CloudProjectSnapshot> => JSON.parse(localStorage.getItem(rowKey) ?? "{}");
  const offlineKey = rowKey + ":offline", offline = () => localStorage.getItem(offlineKey) === "true";
  const write = (rows: Record<string, CloudProjectSnapshot>) => localStorage.setItem(rowKey, JSON.stringify(rows));
  const gateKey = rowKey + ":upload-gate", releases = new Set<() => void>();
  const readGate = (): { name: string; started: boolean; released: boolean } | null => JSON.parse(localStorage.getItem(gateKey) ?? "null");
  const cloud: ProjectCloud = {
    list: async () => offline() ? err({ kind: "unavailable", retryable: true }) : ok(Object.values(read()).map(({ document: _document, ...summary }) => summary)),
    pull: async (projectId) => offline() ? err({ kind: "unavailable", retryable: true }) : read()[projectId] ? ok(read()[projectId]) : err({ kind: "not-found", projectId }),
    push: async (input) => {
      if (offline()) return err({ kind: "unavailable", retryable: true });
      const gate = readGate();
      if (gate && input.name === gate.name && !gate.started) {
        // Either tab may own the upload lock. The fake backend gate must be
        // shared too, so the test holds the request whoever uploads it.
        localStorage.setItem(gateKey, JSON.stringify({ ...gate, started: true }));
        await new Promise<void>((resolve) => {
          const released = () => {
            if (!readGate()?.released) return;
            window.removeEventListener("storage", changed); releases.delete(released); resolve();
          };
          const changed = (event: StorageEvent) => { if (event.key === gateKey) released(); };
          window.addEventListener("storage", changed); releases.add(released); released();
        });
      }
      const rows = read(), previous = rows[input.projectId];
      if ((previous?.cloudRevision ?? null) !== input.expectedCloudRevision) return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: previous?.cloudRevision ?? 0 });
      const snapshot = { projectId: input.projectId, name: input.name, schemaVersion: input.schemaVersion,
        cloudRevision: (previous?.cloudRevision ?? -1) + 1, updatedAt: new Date().toISOString(), document: input.document };
      rows[input.projectId] = snapshot; write(rows); return ok(snapshot);
    },
    delete: async (projectId) => { const rows = read(); delete rows[projectId]; write(rows); return ok(undefined); },
  };
  const local = IndexedDbProjectStore.open({ databaseName });
  const store = new CloudBackedProjectStore(local, cloud, localStorage, databaseName);
  if (seed) {
    const created = await store.createProject({ id, name: "Before", createdAt: new Date().toISOString() });
    if (!created.ok || !(await store.flushPending())) throw Error("cloud fixture creation failed");
  } else if (!(await store.listProjects()).ok) throw Error("cloud fixture could not open");
  const accountSession: AccountSession = {
    getCurrentUser: async () => ok({ id: "test-account", email: "test@example.invalid" }), subscribe: () => () => {},
    signIn: async () => err({ kind: "unavailable", retryable: false }), signUp: async () => err({ kind: "unavailable", retryable: false }),
    signOut: async () => ok(undefined),
  };
  const host = document.createElement("div"); host.id = "cloud-sync-fixture";
  host.style.cssText = "position:fixed;inset:0;z-index:200;background:#fff;overflow:auto";
  document.body.append(host);
  location.hash = home ? "#/" : "#/projects/" + id + "/table";
  createRoot(host).render(<M1App dependencies={{ projectStore: store, photoSource: new MemoryPhotoSource(), accountSession, cloudSave: store }} />);
  return {
    id, store, local,
    setOffline(value: boolean) { localStorage.setItem(offlineKey, String(value)); if (!value) window.dispatchEvent(new Event("online")); },
    addDamagedProject() {
      const rows = read(), previous = rows[id], projectId = "damaged-cloud-project" as ProjectId;
      rows[projectId] = { ...previous, projectId, name: "Damaged project", document: { ...previous.document,
        project: { ...previous.document.project, projectId, worktableDraft: null } } } as unknown as CloudProjectSnapshot;
      write(rows);
    },
    holdNextUpload(name: string) { localStorage.setItem(gateKey, JSON.stringify({ name, started: false, released: false })); },
    uploadStarted: () => Boolean(readGate()?.started),
    releaseUpload() { const gate = readGate(); if (gate) localStorage.setItem(gateKey, JSON.stringify({ ...gate, released: true })); releases.forEach((release) => release()); },
    remoteName: () => read()[id]?.document.project.name,
    async editName(name: string) {
      // Opening Table can update lastOpenedAt. Retry that optimistic conflict so
      // the fixture edits the latest document, as the page coordinator does.
      for (let attempt = 0; attempt < 3; attempt++) {
        const workspace = await store.loadWorkspace(id); if (!workspace.ok) throw Error("missing workspace");
        const saved = await store.saveWorkspace({ ...workspace.value, name }, workspace.value.revision);
        if (saved.ok) return;
        if (saved.error.kind !== "conflict") throw Error("fixture edit failed: " + JSON.stringify(saved.error));
      }
      throw Error("fixture could not obtain the latest workspace revision");
    },
    remoteEdit(name: string) {
      const rows = read(), previous = rows[id];
      rows[id] = { ...previous, name, cloudRevision: previous.cloudRevision + 1,
        document: { ...previous.document, project: { ...previous.document.project, name } } }; write(rows);
    },
  };
}
