import { err, ok, type BackupError, type CloudProjectSummary, type LoadError, type ProjectCloud, type ProjectId, type ProjectStore, type Result, type SourceId } from "../../contracts";
import { jsonSemanticEqual } from "../jsonSemanticEqual";
import { prepareBackupImport } from "../projectBackup";
import { cloudSnapshotContent as content, cloudSyncPending, type CloudSnapshotCache, type CloudSyncSeed, type CloudSyncState } from "../cloudSync";
import { withProjectSyncLock } from "./projectSyncLock";
export type { CloudSnapshotCache } from "../cloudSync";

export type CloudSaveStatus = "saved" | "saving" | "retrying" | "conflict" | "cached";
export interface CloudUploadMetric {
  readonly snapshotBytes: number;
  readonly captureMs: number;
  readonly uploadMs: number;
  readonly localRevision: number;
  readonly requestCode?: string;
  readonly httpStatus?: number;
  readonly outcome: "uploaded" | "capture-failed" | "exception" | "unauthenticated" | "not-found" | "conflict" | "invalid-snapshot" | "unavailable";
}
const unavailable = () => err({ kind: "unavailable" as const, retryable: true });
const peers = new Map<string, Set<CloudBackedProjectStore>>();

/** IndexedDB owns the durable outbox; cloud acknowledgements apply only to the uploaded local revision. */
export class CloudBackedProjectStore implements ProjectStore {
  private ready?: Promise<boolean>;
  private readonly known = new Set<ProjectId>();
  private readonly syncStates = new Map<ProjectId, CloudSyncState>();
  private readonly states = new Map<ProjectId, CloudSaveStatus>();
  private readonly listeners = new Set<() => void>();
  private readonly inFlight = new Map<ProjectId, Promise<void>>();
  private readonly timers = new Map<ProjectId, ReturnType<typeof setTimeout>>();
  private readonly photoIndexRetries = new Map<SourceId, ReturnType<typeof setTimeout>>();
  private readonly activeWrites = new Map<ProjectId, number>();
  private readonly catalog = new Map<ProjectId, CloudProjectSummary>();
  private readonly verified = new Set<ProjectId>();
  private readonly openedProjects = new Set<ProjectId>();
  private readonly projectLoads = new Map<ProjectId, Promise<Result<void, LoadError>>>();
  private readonly projectIssues = new Map<ProjectId, LoadError>();
  private readonly failedSnapshots = new Map<ProjectId, Uint8Array>();
  private readonly projectRetries = new Map<ProjectId, ReturnType<typeof setTimeout>>();
  private readonly uploadMetrics = new Map<ProjectId, CloudUploadMetric>();
  private catalogRequest?: Promise<boolean>;
  private catalogRetry?: ReturnType<typeof setTimeout>;
  private projectListVersion = 0;
  private readonly onOnline = () => { void this.refreshCatalog(); for (const id of this.openedProjects) void this.retryProject(id); };
  private readonly channel?: BroadcastChannel;
  private disposed = false;

  constructor(private readonly local: CloudSnapshotCache, private readonly cloud: ProjectCloud,
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, private readonly prefix: string) {
    const group = peers.get(prefix) ?? new Set(); group.add(this); peers.set(prefix, group);
    if (typeof window !== "undefined" && typeof BroadcastChannel === "function") {
      this.channel = new BroadcastChannel(prefix);
      this.channel.onmessage = (event) => { if (typeof event.data === "string") void this.observed(event.data as ProjectId); };
    }
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getStatus(id: ProjectId): CloudSaveStatus { return this.states.get(id) ?? "saved"; }
  getProjectListVersion(): number { return this.projectListVersion; }
  getProjectIssue(id: ProjectId): LoadError | undefined { return this.projectIssues.get(id); }
  /** Local timings and sizes only. No names, photos, credentials or snapshot content. */
  getLastUploadMetric(id: ProjectId): CloudUploadMetric | undefined { return this.uploadMetrics.get(id); }
  private catalogChanged(): void { this.projectListVersion++; this.listeners.forEach((listener) => listener()); }
  getConflictProjectIds(): readonly ProjectId[] { return [...this.known].filter((id) => this.getStatus(id) === "conflict").sort(); }
  hasPending(): boolean { return [...this.syncStates.values()].some(cloudSyncPending) || this.activeWrites.size > 0; }
  private status(id: ProjectId, state: CloudSaveStatus): void {
    if (this.states.get(id) === state) return;
    this.states.set(id, state); this.listeners.forEach((listener) => listener());
  }
  private legacyRecord(id: ProjectId): CloudSyncSeed | undefined {
    try {
      const value = this.storage.getItem(this.prefix + ":" + id);
      if (!value) return undefined;
      const parsed = JSON.parse(value) as CloudSyncSeed;
      return (parsed.revision === null || (Number.isSafeInteger(parsed.revision) && parsed.revision >= 0)) && typeof parsed.pending === "boolean" ? parsed : undefined;
    } catch { return undefined; }
  }
  private async seed(id: ProjectId): Promise<boolean> {
    const legacy = this.legacyRecord(id);
    const result = await this.local.readCloudSyncState(id, legacy ?? { revision: null, pending: false });
    if (!result.ok || !result.value) return false;
    // Remove the old marker only after its replacement has durably committed.
    if (legacy) { try { this.storage.removeItem(this.prefix + ":" + id); } catch { /* IndexedDB remains authoritative. */ } }
    this.accept(result.value); return true;
  }
  private accept(state: CloudSyncState): void {
    this.syncStates.set(state.projectId, state);
    this.status(state.projectId, state.conflict ? "conflict" : cloudSyncPending(state) || this.activeWrites.has(state.projectId)
      ? (this.states.get(state.projectId) === "retrying" ? "retrying" : "saving") : this.verified.has(state.projectId) ? "saved" : "cached");
  }
  private async refresh(id: ProjectId): Promise<CloudSyncState | undefined> {
    const result = await this.local.readCloudSyncState(id);
    if (!result.ok) { this.status(id, "retrying"); return undefined; }
    if (result.value) this.accept(result.value);
    else {
      const removed = this.known.has(id) || this.catalog.has(id);
      this.syncStates.delete(id); this.known.delete(id); this.catalog.delete(id); this.verified.delete(id);
      this.openedProjects.delete(id); this.projectIssues.delete(id); this.failedSnapshots.delete(id); this.status(id, "saved");
      if (removed) this.catalogChanged();
    }
    return result.value;
  }
  private async observed(id: ProjectId): Promise<void> {
    if (this.disposed) return;
    const state = await this.refresh(id);
    if (!state) return;
    if (!cloudSyncPending(state) && state.cloudRevision !== null) { this.verified.add(id); this.accept(state); }
    const workspace = await this.local.loadWorkspace(id);
    if (!workspace.ok || this.disposed) return;
    if (!this.known.has(id)) { this.known.add(id); this.catalogChanged(); }
    if (cloudSyncPending(state) && !state.conflict) this.schedule(id);
  }
  private broadcast(id: ProjectId): void {
    if (this.disposed) return;
    this.channel?.postMessage(id);
    for (const peer of peers.get(this.prefix) ?? []) if (peer !== this) void peer.observed(id);
  }
  private lock<T>(id: ProjectId, action: () => Promise<T>): Promise<T> { return withProjectSyncLock(this.prefix + ":upload:" + id, action); }

  private async initialize(): Promise<boolean> {
    const cached = await this.local.listProjects();
    if (!cached.ok) return false;
    for (const project of cached.value) {
      let record = await this.local.readCloudSyncState(project.id);
      if (!record.ok) continue;
      const legacy = this.legacyRecord(project.id);
      if (!record.value && legacy && (legacy.pending || legacy.revision !== null)) {
        if (!(await this.seed(project.id))) continue;
        record = await this.local.readCloudSyncState(project.id);
      }
      if (!record.ok || !record.value) continue;
      this.known.add(project.id); this.accept(record.value);
      if (cloudSyncPending(record.value) && !record.value.conflict && !project.loadError) this.schedule(project.id);
    }
    // Only the scoped, durably registered cache can bypass an unavailable cloud list.
    if (this.known.size) { void this.refreshCatalog(); return true; }
    return this.refreshCatalog();
  }
  private async refreshCatalog(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.catalogRequest) return this.catalogRequest;
    const request = (async () => {
      const listed = await this.cloud.list();
      if (this.disposed) return false;
      if (!listed.ok) {
        if (!this.catalogRetry) this.catalogRetry = setTimeout(() => { this.catalogRetry = undefined; void this.refreshCatalog(); }, 3000);
        return false;
      }
      if (this.catalogRetry) { clearTimeout(this.catalogRetry); this.catalogRetry = undefined; }
      const changed = !jsonSemanticEqual([...this.catalog.values()], listed.value);
      this.catalog.clear();
      for (const summary of listed.value) { this.catalog.set(summary.projectId, summary); this.known.add(summary.projectId); }
      if (changed) this.catalogChanged();
      return true;
    })().catch(() => {
      if (!this.disposed && !this.catalogRetry) this.catalogRetry = setTimeout(() => { this.catalogRetry = undefined; void this.refreshCatalog(); }, 3000);
      return false;
    });
    this.catalogRequest = request;
    try { return await request; } finally { this.catalogRequest = undefined; }
  }
  private async reconcileProject(id: ProjectId): Promise<Result<void, LoadError>> {
    const existing = this.projectLoads.get(id);
    if (existing) return existing;
    const work = this.lock(id, async (): Promise<Result<void, LoadError>> => {
        const cached = await this.local.loadWorkspace(id);
        // Preserve malformed local records verbatim for recovery instead of
        // replacing them with a cloud copy as an incidental read side effect.
        if (!cached.ok && cached.error.kind === "corrupt-data") return cached;
        const pulled = await this.cloud.pull(id);
        if (this.disposed) return unavailable();
        if (!pulled.ok) return pulled.error.kind === "invalid-snapshot" ? err({ kind: "corrupt-data", entityId: id }) : unavailable();
        const valid = prepareBackupImport(new TextEncoder().encode(JSON.stringify(pulled.value.document)), true);
        if (!valid.ok || valid.value.backup.project.projectId !== id) {
          this.failedSnapshots.set(id, new TextEncoder().encode(JSON.stringify(pulled.value)));
          return err({ kind: "corrupt-data", entityId: id });
        }
        this.failedSnapshots.delete(id);
        if (!(await this.seed(id))) return unavailable();
        const state = await this.refresh(id);
        if (!state) return unavailable();
        if (cloudSyncPending(state)) {
          if (state.cloudRevision !== pulled.value.cloudRevision) {
            const snapshot = await this.local.captureCloudSnapshot(id);
            if (!snapshot.ok) return snapshot;
            const same = jsonSemanticEqual(content(snapshot.value.document), content(pulled.value.document));
            const updated = same ? await this.local.acknowledgeCloudSnapshot(id, snapshot.value.sync.localRevision, pulled.value.cloudRevision)
              : await this.local.markCloudConflict(id);
            if (!updated.ok) return updated;
            if (same) this.verified.add(id);
            this.accept(updated.value); this.broadcast(id);
          }
          const current = await this.refresh(id);
          if (current && cloudSyncPending(current) && !current.conflict) this.schedule(id);
          return ok(undefined);
        }
        const result = await this.local.installCloudSnapshot(pulled.value.document, { cloudRevision: pulled.value.cloudRevision, expectedLocalRevision: state.localRevision });
        if (result.ok) this.verified.add(id);
        const current = await this.refresh(id);
        if (!result.ok && result.error.kind !== "invalid-backup") return unavailable();
        if (current && cloudSyncPending(current) && !current.conflict) this.schedule(id);
        this.broadcast(id); return current ? ok(undefined) : unavailable();
      }).catch(() => unavailable());
    this.projectLoads.set(id, work);
    try {
      const result = await work;
      if (this.disposed) return result;
      const previousIssue = this.projectIssues.get(id);
      if (result.ok) this.projectIssues.delete(id);
      else {
        this.projectIssues.set(id, result.error);
        if (result.error.kind === "unavailable" && !this.projectRetries.has(id)) this.projectRetries.set(id, setTimeout(() => {
          this.projectRetries.delete(id); void this.retryProject(id);
        }, 3000));
      }
      if (result.ok || !jsonSemanticEqual(previousIssue, result.error)) this.catalogChanged();
      return result;
    } finally { this.projectLoads.delete(id); }
  }
  async retryProject(id: ProjectId): Promise<Result<void, LoadError>> {
    if (!(await this.ensureReady()) || !this.known.has(id)) return unavailable();
    const timer = this.projectRetries.get(id); if (timer) { clearTimeout(timer); this.projectRetries.delete(id); }
    return this.reconcileProject(id);
  }
  private async ensureReady(): Promise<boolean> {
    if (!this.ready) this.ready = this.initialize();
    try { const ready = await this.ready; if (!ready) this.ready = undefined; return ready; }
    catch { this.ready = undefined; return false; }
  }
  async photoIndexChanged(sourceId: SourceId): Promise<void> {
    if (this.disposed) return;
    if (!(await this.ensureReady())) { this.retryPhotoIndexChange(sourceId); return; }
    for (const id of this.known) {
      const workspace = await this.local.loadWorkspace(id);
      if (!workspace.ok || !workspace.value.sources.some((source) => source.id === sourceId)) continue;
      const marked = await this.local.markCloudPending(id);
      if (marked.ok) { this.accept(marked.value); this.broadcast(id); this.schedule(id); }
      else { this.status(id, "retrying"); this.retryPhotoIndexChange(sourceId); }
    }
  }
  private retryPhotoIndexChange(sourceId: SourceId): void {
    if (this.disposed || this.photoIndexRetries.has(sourceId)) return;
    this.photoIndexRetries.set(sourceId, setTimeout(() => { this.photoIndexRetries.delete(sourceId); void this.photoIndexChanged(sourceId); }, 3000));
  }
  private schedule(id: ProjectId, delay = 100): void {
    if (this.disposed || this.states.get(id) === "conflict") return;
    this.status(id, "saving");
    const existing = this.timers.get(id); if (existing) clearTimeout(existing);
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.drain(id); }, delay));
  }
  private async drain(id: ProjectId): Promise<void> {
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    const work = this.lock(id, async () => {
      while (!this.disposed) {
        const state = await this.refresh(id);
        if (!state || !cloudSyncPending(state) || state.conflict) return;
        if (this.activeWrites.has(id)) { this.schedule(id); return; }
        const captureStart = performance.now();
        const snapshot = await this.local.captureCloudSnapshot(id);
        if (!snapshot.ok) {
          this.uploadMetrics.set(id, { snapshotBytes: 0, captureMs: performance.now() - captureStart, uploadMs: 0, localRevision: state.localRevision, outcome: "capture-failed" });
          this.retry(id); return;
        }
        const { document, sync } = snapshot.value;
        if (!cloudSyncPending(sync) || sync.conflict) { this.accept(sync); return; }
        const snapshotBytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
        const captureMs = performance.now() - captureStart, uploadStart = performance.now();
        let pushed: Awaited<ReturnType<ProjectCloud["push"]>>;
        try {
          pushed = await this.cloud.push({ projectId: id, name: document.project.name, schemaVersion: document.project.schemaVersion,
            document, expectedCloudRevision: sync.cloudRevision });
        } catch (error) {
          this.uploadMetrics.set(id, { snapshotBytes, captureMs, uploadMs: performance.now() - uploadStart, localRevision: sync.localRevision, outcome: "exception" });
          throw error;
        }
        this.uploadMetrics.set(id, { snapshotBytes, captureMs, uploadMs: performance.now() - uploadStart, localRevision: sync.localRevision,
          outcome: pushed.ok ? "uploaded" : pushed.error.kind,
          ...(!pushed.ok && pushed.error.kind === "unavailable" ? { requestCode: pushed.error.requestCode, httpStatus: pushed.error.httpStatus } : {}),
        });
        let revision: number;
        if (!pushed.ok) {
          if (pushed.error.kind !== "conflict") { this.retry(id); return; }
          const remote = await this.cloud.pull(id);
          if (remote.ok && jsonSemanticEqual(content(document), content(remote.value.document))) revision = remote.value.cloudRevision;
          else {
            const marked = await this.local.markCloudConflict(id);
            if (marked.ok) { this.accept(marked.value); this.broadcast(id); } else this.retry(id);
            return;
          }
        } else revision = pushed.value.cloudRevision;
        const acknowledged = await this.local.acknowledgeCloudSnapshot(id, sync.localRevision, revision);
        if (!acknowledged.ok) { this.retry(id); return; }
        this.verified.add(id); this.accept(acknowledged.value); this.broadcast(id);
      }
    }).catch(() => { if (!this.disposed) this.retry(id); });
    this.inFlight.set(id, work);
    try { await work; } finally { this.inFlight.delete(id); }
  }
  private retry(id: ProjectId): void { this.schedule(id, 3000); this.status(id, "retrying"); }
  async flushPending(): Promise<boolean> {
    if (!(await this.ensureReady())) return false;
    for (const id of this.syncStates.keys()) {
      const timer = this.timers.get(id); if (timer) { clearTimeout(timer); this.timers.delete(id); }
      await this.drain(id);
    }
    for (const id of this.syncStates.keys()) { const state = await this.refresh(id); if (!state || cloudSyncPending(state) || state.conflict) return false; }
    return this.activeWrites.size === 0;
  }
  private async write<T, E>(id: ProjectId, action: () => Promise<Result<T, E>>): Promise<Result<T, E>> {
    if (!(await this.ensureReady()) || !(await this.seed(id))) return unavailable() as Result<T, E>;
    this.activeWrites.set(id, (this.activeWrites.get(id) ?? 0) + 1);
    if (this.getStatus(id) !== "conflict") this.status(id, "saving");
    let result: Result<T, E>;
    try { result = await withProjectSyncLock(this.prefix + ":write:" + id, action); } catch { result = unavailable() as Result<T, E>; }
    finally { const remaining = (this.activeWrites.get(id) ?? 1) - 1; if (remaining) this.activeWrites.set(id, remaining); else this.activeWrites.delete(id); }
    const state = await this.refresh(id);
    if (result.ok) this.known.add(id);
    if (state && cloudSyncPending(state) && !state.conflict) this.schedule(id);
    if (result.ok) this.broadcast(id);
    return result;
  }

  async listProjects(): ReturnType<ProjectStore["listProjects"]> {
    if (!(await this.ensureReady())) return unavailable();
    const listed = await this.local.listProjects();
    if (!listed.ok) return listed;
    const summaries = new Map(listed.value.filter((project) => this.known.has(project.id)).map((project) => [project.id, project]));
    for (const summary of this.catalog.values()) if (!summaries.has(summary.projectId)) summaries.set(summary.projectId, {
      id: summary.projectId, name: summary.name, updatedAt: summary.updatedAt, lastOpenedAt: "", sourceCount: 0, tableCount: 0,
    });
    return ok([...summaries.values()].map((summary) => this.projectIssues.get(summary.id)?.kind === "corrupt-data"
      ? { ...summary, loadError: "corrupt-data" as const } : summary).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }
  async createProject(...args: Parameters<ProjectStore["createProject"]>): ReturnType<ProjectStore["createProject"]> { return this.write(args[0].id, () => this.local.createProject(...args)); }
  async loadWorkspace(...args: Parameters<ProjectStore["loadWorkspace"]>): ReturnType<ProjectStore["loadWorkspace"]> {
    if (!(await this.ensureReady())) return unavailable();
    const id = args[0];
    if (!this.known.has(id)) return err({ kind: "not-found", entity: "project", id });
    const cached = await this.local.loadWorkspace(id);
    const sync = await this.local.readCloudSyncState(id);
    if (cached.ok && sync.ok && sync.value) {
      if (!this.openedProjects.has(id)) {
        this.openedProjects.add(id);
        if (!cloudSyncPending(sync.value) && !sync.value.conflict && !this.verified.has(id)) void this.reconcileProject(id);
      }
      return cached;
    }
    const installed = await this.reconcileProject(id);
    if (!installed.ok) return installed;
    this.openedProjects.add(id);
    return this.local.loadWorkspace(id);
  }
  async saveWorkspace(...args: Parameters<ProjectStore["saveWorkspace"]>): ReturnType<ProjectStore["saveWorkspace"]> { return this.write(args[0].projectId, () => this.local.saveWorkspace(...args)); }
  async saveWorktable(...args: Parameters<ProjectStore["saveWorktable"]>): ReturnType<ProjectStore["saveWorktable"]> { return this.write(args[0], () => this.local.saveWorktable(...args)); }
  async createSequence(...args: Parameters<ProjectStore["createSequence"]>): ReturnType<ProjectStore["createSequence"]> { return this.write(args[0], () => this.local.createSequence(...args)); }
  async listSequences(...args: Parameters<ProjectStore["listSequences"]>): ReturnType<ProjectStore["listSequences"]> { return this.local.listSequences(...args); }
  async loadSequence(...args: Parameters<ProjectStore["loadSequence"]>): ReturnType<ProjectStore["loadSequence"]> { return this.local.loadSequence(...args); }
  async saveSequence(...args: Parameters<ProjectStore["saveSequence"]>): ReturnType<ProjectStore["saveSequence"]> { return this.write(args[0].projectId, () => this.local.saveSequence(...args)); }
  async createLayout(...args: Parameters<ProjectStore["createLayout"]>): ReturnType<ProjectStore["createLayout"]> { return this.write(args[0], () => this.local.createLayout(...args)); }
  async listLayouts(...args: Parameters<ProjectStore["listLayouts"]>): ReturnType<ProjectStore["listLayouts"]> { return this.local.listLayouts(...args); }
  async loadLayout(...args: Parameters<ProjectStore["loadLayout"]>): ReturnType<ProjectStore["loadLayout"]> { return this.local.loadLayout(...args); }
  async saveLayout(...args: Parameters<ProjectStore["saveLayout"]>): ReturnType<ProjectStore["saveLayout"]> { return this.write(args[0].projectId, () => this.local.saveLayout(...args)); }
  async deleteSequences(...args: Parameters<ProjectStore["deleteSequences"]>): ReturnType<ProjectStore["deleteSequences"]> { return this.write(args[0], () => this.local.deleteSequences(...args)); }
  async createVersion(...args: Parameters<ProjectStore["createVersion"]>): ReturnType<ProjectStore["createVersion"]> { return this.write(args[0], () => this.local.createVersion(...args)); }
  async saveSequenceVersion(...args: Parameters<ProjectStore["saveSequenceVersion"]>): ReturnType<ProjectStore["saveSequenceVersion"]> { return this.write(args[0].projectId, () => this.local.saveSequenceVersion(...args)); }
  async deleteVersion(...args: Parameters<ProjectStore["deleteVersion"]>): ReturnType<ProjectStore["deleteVersion"]> { return this.write(args[0], () => this.local.deleteVersion(...args)); }
  async listVersions(...args: Parameters<ProjectStore["listVersions"]>): ReturnType<ProjectStore["listVersions"]> { return this.local.listVersions(...args); }
  async loadVersion(...args: Parameters<ProjectStore["loadVersion"]>): ReturnType<ProjectStore["loadVersion"]> { return this.local.loadVersion(...args); }
  async deleteProject(id: ProjectId): ReturnType<ProjectStore["deleteProject"]> {
    if (!(await this.ensureReady())) return unavailable();
    await this.drain(id);
    try {
      return await this.lock(id, () => withProjectSyncLock(this.prefix + ":write:" + id, async () => {
        const state = await this.refresh(id);
        if (!state || cloudSyncPending(state) || state.conflict) return unavailable();
        if (state.cloudRevision !== null) { const deleted = await this.cloud.delete(id, state.cloudRevision); if (!deleted.ok) return unavailable(); }
        const result = await this.local.deleteProject(id);
        if (result.ok) { this.known.delete(id); this.catalog.delete(id); this.syncStates.delete(id); this.status(id, "saved"); this.catalogChanged(); this.broadcast(id); }
        return result;
      }));
    } catch { return unavailable(); }
  }
  async exportBackup(...args: Parameters<ProjectStore["exportBackup"]>): ReturnType<ProjectStore["exportBackup"]> { return this.local.exportBackup(...args); }
  async exportRecoveryData(id: ProjectId): Promise<Result<Uint8Array, LoadError>> {
    if (!(await this.ensureReady()) || !this.known.has(id)) return unavailable();
    const failed = this.failedSnapshots.get(id);
    if (failed) return ok(new TextEncoder().encode(JSON.stringify({ format: "photoflex-project-recovery", projectId: id,
      cloudSnapshot: JSON.parse(new TextDecoder().decode(failed)) })));
    return this.local.exportRecoveryData ? this.local.exportRecoveryData(id) : unavailable();
  }
  async importBackup(bytes: Uint8Array): ReturnType<ProjectStore["importBackup"]> {
    const prepared = prepareBackupImport(bytes); if (!prepared.ok) return prepared;
    const id = prepared.value.backup.project.projectId;
    return this.write(id, async () => { const installed = await this.local.installCloudSnapshot(prepared.value.backup); return installed.ok ? ok(id) : installed; });
  }
  async saveConflictCopy(id: ProjectId): Promise<Result<ProjectId, LoadError | BackupError>> {
    if (!(await this.ensureReady())) return unavailable();
    const snapshot = await this.local.captureCloudSnapshot(id);
    return snapshot.ok ? this.importBackup(new TextEncoder().encode(JSON.stringify(snapshot.value.document))) : snapshot;
  }
  async resolveConflict(id: ProjectId): Promise<Result<ProjectId, LoadError | BackupError>> {
    if (!(await this.ensureReady())) return unavailable();
    try {
      return await this.lock(id, async () => {
        const snapshot = await this.local.captureCloudSnapshot(id);
        if (!snapshot.ok) return snapshot;
        if (!snapshot.value.sync.conflict) return err({ kind: "invalid-backup", reason: "This project no longer has a cloud conflict." });
        const copy = await this.importBackup(new TextEncoder().encode(JSON.stringify(snapshot.value.document)));
        if (!copy.ok) return copy;
        const pulled = await this.cloud.pull(id);
        if (!pulled.ok || pulled.value.document.project.projectId !== id) return unavailable();
        const installed = await this.local.installCloudSnapshot(pulled.value.document, { cloudRevision: pulled.value.cloudRevision,
          expectedLocalRevision: snapshot.value.sync.localRevision, replacePending: true });
        if (!installed.ok) return installed;
        await this.refresh(id); this.broadcast(id);
        return copy;
      });
    } catch { return unavailable(); }
  }
  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    if (this.catalogRetry) clearTimeout(this.catalogRetry);
    for (const timer of this.projectRetries.values()) clearTimeout(timer); this.projectRetries.clear();
    for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear();
    for (const timer of this.photoIndexRetries.values()) clearTimeout(timer); this.photoIndexRetries.clear();
    this.channel?.close();
    const group = peers.get(this.prefix); group?.delete(this); if (!group?.size) peers.delete(this.prefix);
    this.listeners.clear();
    this.uploadMetrics.clear();
  }
}
