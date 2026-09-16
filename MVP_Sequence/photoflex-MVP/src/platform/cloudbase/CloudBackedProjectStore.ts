import { err, ok, type BackupError, type ProjectBackupV1, type ProjectCloud, type ProjectId, type ProjectStore, type Result, type SourceId } from "../../contracts";
import { jsonSemanticEqual } from "../../app/jsonSemanticEqual";
import { prepareBackupImport } from "../projectBackup";

export type CloudSaveStatus = "saved" | "saving" | "retrying" | "conflict";
export interface CloudSnapshotCache extends ProjectStore {
  installCloudSnapshot(document: ProjectBackupV1): Promise<Result<void, BackupError>>;
}

interface SyncRecord { readonly revision: number | null; readonly pending: boolean }
const unavailable = () => err({ kind: "unavailable" as const, retryable: true });

/** CloudBase owns the project list and canonical snapshots; IndexedDB is a working cache. */
export class CloudBackedProjectStore implements ProjectStore {
  private ready?: Promise<boolean>;
  private readonly known = new Set<ProjectId>();
  private readonly revisions = new Map<ProjectId, number | null>();
  private readonly generations = new Map<ProjectId, number>();
  private readonly states = new Map<ProjectId, CloudSaveStatus>();
  private readonly listeners = new Set<() => void>();
  private readonly inFlight = new Map<ProjectId, Promise<void>>();
  private readonly timers = new Map<ProjectId, ReturnType<typeof setTimeout>>();
  private readonly photoIndexRetries = new Map<SourceId, ReturnType<typeof setTimeout>>();
  private readonly activeWrites = new Map<ProjectId, number>();
  private disposed = false;

  constructor(private readonly local: CloudSnapshotCache, private readonly cloud: ProjectCloud, private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, private readonly prefix: string) {}

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getStatus(projectId: ProjectId): CloudSaveStatus { return this.states.get(projectId) ?? "saved"; }
  hasPending(): boolean { return [...this.known].some((id) => Boolean(this.record(id)?.pending)); }
  private status(id: ProjectId, state: CloudSaveStatus): void {
    if (this.states.get(id) === state) return;
    this.states.set(id, state);
    this.listeners.forEach((listener) => listener());
  }
  private key(id: ProjectId): string { return `${this.prefix}:${id}`; }
  private record(id: ProjectId): SyncRecord | undefined {
    try {
      const value = this.storage.getItem(this.key(id));
      if (!value) return undefined;
      const parsed = JSON.parse(value) as SyncRecord;
      return (parsed.revision === null || (Number.isSafeInteger(parsed.revision) && parsed.revision >= 0)) && typeof parsed.pending === "boolean" ? parsed : undefined;
    } catch { return undefined; }
  }
  private saveRecord(id: ProjectId, pending: boolean): void {
    this.storage.setItem(this.key(id), JSON.stringify({ revision: this.revisions.get(id) ?? null, pending }));
  }

  private async initialize(): Promise<boolean> {
    const listed = await this.cloud.list();
    if (!listed.ok) return false;
    for (const summary of listed.value) {
      const id = summary.projectId;
      const pulled = await this.cloud.pull(id);
      if (!pulled.ok || pulled.value.document.project.projectId !== id) return false;
      const cloudRevision = pulled.value.cloudRevision;
      this.known.add(id);
      const record = this.record(id);
      if (record?.pending) {
        const cached = await this.local.loadWorkspace(id);
        if (cached.ok) {
          if (record.revision !== cloudRevision) {
            const exported = await this.local.exportBackup(id);
            if (!exported.ok) return false;
            const document = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1;
            const content = ({ project, sequences, versions, photoManifest }: ProjectBackupV1) => ({ project, sequences, versions, photoManifest });
            if (!jsonSemanticEqual(content(document), content(pulled.value.document))) { this.status(id, "conflict"); continue; }
            this.revisions.set(id, cloudRevision);
            this.saveRecord(id, false);
            this.status(id, "saved");
            continue;
          }
          this.revisions.set(id, record.revision);
          this.generations.set(id, 1);
          this.schedule(id);
          continue;
        }
      }
      const installed = await this.local.installCloudSnapshot(pulled.value.document);
      if (!installed.ok) return false;
      this.revisions.set(id, cloudRevision);
      this.saveRecord(id, false);
      this.status(id, "saved");
    }
    const cached = await this.local.listProjects();
    if (!cached.ok) return false;
    for (const project of cached.value) {
      const id = project.id;
      if (this.known.has(id)) continue;
      const record = this.record(id);
      if (!record?.pending) continue; // Old local-only work is intentionally not imported.
      this.known.add(id);
      this.revisions.set(id, record.revision);
      this.generations.set(id, 1);
      this.schedule(id);
    }
    return true;
  }
  private async ensureReady(): Promise<boolean> {
    if (!this.ready) this.ready = this.initialize();
    try {
      const ready = await this.ready;
      if (!ready) this.ready = undefined;
      return ready;
    } catch {
      this.ready = undefined;
      return false;
    }
  }

  private changed(id: ProjectId): void {
    this.known.add(id);
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    this.schedule(id);
  }
  async photoIndexChanged(sourceId: SourceId): Promise<void> {
    if (this.disposed) return;
    if (!(await this.ensureReady())) { this.retryPhotoIndexChange(sourceId); return; }
    for (const id of this.known) {
      const workspace = await this.local.loadWorkspace(id);
      if (workspace.ok && workspace.value.sources.some((source) => source.id === sourceId)) {
        try { this.saveRecord(id, true); this.changed(id); }
        catch { this.status(id, "retrying"); this.retryPhotoIndexChange(sourceId); }
      }
    }
  }
  private retryPhotoIndexChange(sourceId: SourceId): void {
    if (this.disposed || this.photoIndexRetries.has(sourceId)) return;
    this.photoIndexRetries.set(sourceId, setTimeout(() => {
      this.photoIndexRetries.delete(sourceId);
      void this.photoIndexChanged(sourceId);
    }, 3000));
  }
  private schedule(id: ProjectId, delay = 100): void {
    if (this.disposed || this.states.get(id) === "conflict") return;
    this.status(id, "saving");
    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.drain(id); }, delay));
  }
  private async drain(id: ProjectId): Promise<void> {
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    const work = (async () => {
      while (!this.disposed && this.record(id)?.pending && this.states.get(id) !== "conflict") {
        if (this.activeWrites.get(id)) { this.schedule(id); return; }
        const generation = this.generations.get(id) ?? 0;
        const exported = await this.local.exportBackup(id);
        if (!exported.ok) { this.retry(id); return; }
        let document: ProjectBackupV1;
        try { document = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1; }
        catch { this.retry(id); return; }
        const pushed = await this.cloud.push({ projectId: id, name: document.project.name, schemaVersion: document.project.schemaVersion, document, expectedCloudRevision: this.revisions.get(id) ?? null });
        if (!pushed.ok) {
          if (pushed.error.kind === "conflict") this.status(id, "conflict");
          else this.retry(id);
          return;
        }
        this.revisions.set(id, pushed.value.cloudRevision);
        const pending = generation !== (this.generations.get(id) ?? 0);
        try { this.saveRecord(id, pending); }
        catch { this.retry(id); return; }
        if (!pending) this.status(id, "saved");
      }
    })();
    this.inFlight.set(id, work);
    try { await work; } finally { this.inFlight.delete(id); }
  }
  private retry(id: ProjectId): void {
    this.status(id, "retrying");
    this.schedule(id, 3000);
    this.status(id, "retrying");
  }
  async flushPending(): Promise<boolean> {
    if (!(await this.ensureReady())) return false;
    for (const id of this.known) {
      if (!this.record(id)?.pending) continue;
      const timer = this.timers.get(id);
      if (timer) { clearTimeout(timer); this.timers.delete(id); }
      await this.drain(id);
    }
    return [...this.known].every((id) => !this.record(id)?.pending);
  }
  private async write<T, E>(id: ProjectId, action: () => Promise<Result<T, E>>): Promise<Result<T, E>> {
    if (!(await this.ensureReady())) return unavailable() as Result<T, E>;
    // The pending marker must be durable before the local transaction commits.
    const wasPending = this.record(id)?.pending ?? false;
    try { this.saveRecord(id, true); }
    catch { return unavailable() as Result<T, E>; }
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    this.activeWrites.set(id, (this.activeWrites.get(id) ?? 0) + 1);
    let result: Result<T, E>;
    try { result = await action(); }
    catch {
      if (this.known.has(id)) this.schedule(id);
      return unavailable() as Result<T, E>;
    }
    finally {
      const remaining = (this.activeWrites.get(id) ?? 1) - 1;
      if (remaining) this.activeWrites.set(id, remaining);
      else this.activeWrites.delete(id);
    }
    if (result.ok) this.changed(id);
    else if (!wasPending && this.generations.get(id) === generation && !this.activeWrites.has(id)) {
      try { this.saveRecord(id, false); }
      catch { if (this.known.has(id)) this.schedule(id); }
    } else if (this.known.has(id)) this.schedule(id);
    return result;
  }

  async listProjects(): ReturnType<ProjectStore["listProjects"]> {
    if (!(await this.ensureReady())) return unavailable();
    const listed = await this.local.listProjects();
    return listed.ok ? ok(listed.value.filter((project) => this.known.has(project.id))) : listed;
  }
  async createProject(...args: Parameters<ProjectStore["createProject"]>): ReturnType<ProjectStore["createProject"]> { return this.write(args[0].id, () => this.local.createProject(...args)); }
  async loadWorkspace(...args: Parameters<ProjectStore["loadWorkspace"]>): ReturnType<ProjectStore["loadWorkspace"]> {
    if (!(await this.ensureReady())) return unavailable();
    return this.known.has(args[0]) ? this.local.loadWorkspace(...args) : err({ kind: "not-found", entity: "project", id: args[0] });
  }
  async saveWorkspace(...args: Parameters<ProjectStore["saveWorkspace"]>): ReturnType<ProjectStore["saveWorkspace"]> { return this.write(args[0].projectId, () => this.local.saveWorkspace(...args)); }
  async saveWorktable(...args: Parameters<ProjectStore["saveWorktable"]>): ReturnType<ProjectStore["saveWorktable"]> { return this.write(args[0], () => this.local.saveWorktable(...args)); }
  async createSequence(...args: Parameters<ProjectStore["createSequence"]>): ReturnType<ProjectStore["createSequence"]> { return this.write(args[0], () => this.local.createSequence(...args)); }
  async listSequences(...args: Parameters<ProjectStore["listSequences"]>): ReturnType<ProjectStore["listSequences"]> { return this.local.listSequences(...args); }
  async loadSequence(...args: Parameters<ProjectStore["loadSequence"]>): ReturnType<ProjectStore["loadSequence"]> { return this.local.loadSequence(...args); }
  async saveSequence(...args: Parameters<ProjectStore["saveSequence"]>): ReturnType<ProjectStore["saveSequence"]> { return this.write(args[0].projectId, () => this.local.saveSequence(...args)); }
  async deleteSequences(...args: Parameters<ProjectStore["deleteSequences"]>): ReturnType<ProjectStore["deleteSequences"]> { return this.write(args[0], () => this.local.deleteSequences(...args)); }
  async createVersion(...args: Parameters<ProjectStore["createVersion"]>): ReturnType<ProjectStore["createVersion"]> { return this.write(args[0], () => this.local.createVersion(...args)); }
  async saveSequenceVersion(...args: Parameters<ProjectStore["saveSequenceVersion"]>): ReturnType<ProjectStore["saveSequenceVersion"]> { return this.write(args[0].projectId, () => this.local.saveSequenceVersion(...args)); }
  async deleteVersion(...args: Parameters<ProjectStore["deleteVersion"]>): ReturnType<ProjectStore["deleteVersion"]> { return this.write(args[0], () => this.local.deleteVersion(...args)); }
  async listVersions(...args: Parameters<ProjectStore["listVersions"]>): ReturnType<ProjectStore["listVersions"]> { return this.local.listVersions(...args); }
  async loadVersion(...args: Parameters<ProjectStore["loadVersion"]>): ReturnType<ProjectStore["loadVersion"]> { return this.local.loadVersion(...args); }
  async deleteProject(id: ProjectId): ReturnType<ProjectStore["deleteProject"]> {
    if (!(await this.ensureReady())) return unavailable();
    const timer = this.timers.get(id);
    if (timer) { clearTimeout(timer); this.timers.delete(id); }
    await this.drain(id);
    if (this.record(id)?.pending || this.states.get(id) === "conflict") return unavailable();
    const revision = this.revisions.get(id);
    if (revision !== undefined && revision !== null) {
      const deleted = await this.cloud.delete(id, revision);
      if (!deleted.ok) return unavailable();
    }
    const result = await this.local.deleteProject(id);
    if (result.ok) { this.known.delete(id); this.revisions.delete(id); this.storage.removeItem(this.key(id)); }
    return result;
  }
  async exportBackup(...args: Parameters<ProjectStore["exportBackup"]>): ReturnType<ProjectStore["exportBackup"]> { return this.local.exportBackup(...args); }
  async importBackup(...args: Parameters<ProjectStore["importBackup"]>): ReturnType<ProjectStore["importBackup"]> {
    if (!(await this.ensureReady())) return unavailable();
    const prepared = prepareBackupImport(args[0]);
    if (!prepared.ok) return prepared;
    const id = prepared.value.backup.project.projectId;
    try { this.saveRecord(id, true); }
    catch { return unavailable(); }
    const installed = await this.local.installCloudSnapshot(prepared.value.backup);
    if (!installed.ok) return installed;
    this.changed(id);
    return ok(id);
  }
  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const timer of this.photoIndexRetries.values()) clearTimeout(timer);
    this.photoIndexRetries.clear();
    this.listeners.clear();
  }
}
