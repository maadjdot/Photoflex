import {
  err,
  ok,
  type LoadError,
  type ProjectId,
  type ProjectWorkspace,
  type Result,
  type ResumeContext,
  type SaveError,
  type SequenceCommandError,
  type SequenceDocument,
  type SequenceId,
  type SequenceSummary,
  type SequenceVersion,
  type SequenceWriteError,
  type WorktableCommandError,
  type WorktableDraft,
  type WorktablePoint,
  type SequenceRevision,
  type ProjectBackupV1,
  type BackupError,
} from "../contracts";
import type { AppDependencies } from "./dependencies";
import { createWorktableEditor } from "../modules/worktable";

export type CoordinatorPausedError = { readonly kind: "writes-paused" };
export type ProjectWriteScope = { readonly kind: "workspace" } | { readonly kind: "sequence"; readonly sequenceId: SequenceId };
export type CoordinatorWorkspaceError = SaveError | { readonly kind: "workspace-not-ready" } | CoordinatorPausedError;
export type CoordinatorWorkspaceResult = Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>;
export type WorktableUpdate = WorktableDraft | ((current: WorktableDraft) => WorktableDraft);
export type ResumeContextUpdate = ResumeContext | ((current: ResumeContext | undefined) => ResumeContext);

export interface ProjectWriteSnapshot {
  readonly loading: boolean;
  readonly workspace?: ProjectWorkspace;
  readonly error?: string;
  readonly saving: boolean;
  readonly writeState: "idle" | "saving" | "failed";
}

export interface CreateSequenceTransaction {
  readonly sequence: SequenceDocument;
  readonly initialVersion: SequenceVersion;
  readonly worktableDraft: WorktableDraft;
}

export interface CreateSequenceBundleInput {
  readonly sequence: SequenceDocument;
  readonly initialVersion: SequenceVersion;
  readonly pile: WorktablePoint & { readonly width: number; readonly height: number };
}

export interface SequenceWriteResult {
  readonly sequence: SequenceDocument;
  readonly summary: SequenceSummary;
  /** The workspace draft committed by a structural sequence transaction. */
  readonly worktableDraft?: WorktableDraft;
}

/** Persistence capabilities required by one Sequence editing session. */
export interface SequenceWritePort {
  loadSequence(sequenceId: SequenceId): ReturnType<AppDependencies["projectStore"]["loadSequence"]>;
  saveSequenceDraft(sequence: SequenceDocument): Promise<Result<SequenceWriteResult, LoadError | SequenceWriteError | CoordinatorPausedError>>;
  retrySequence(sequenceId: SequenceId): Promise<boolean>;
  flushSequence(sequenceId: SequenceId): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
}

export interface ProjectWriteCoordinator extends SequenceWritePort {
  readonly projectId: ProjectId;
  getSnapshot(): ProjectWriteSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  load(): Promise<void>;
  saveWorkspace(update: ProjectWorkspace | ((current: ProjectWorkspace) => ProjectWorkspace)): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
  updateResumeContext(update: ResumeContextUpdate, touchLastOpened?: boolean): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
  saveWorktable(update: WorktableUpdate): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
  createSequence(input: CreateSequenceTransaction): Promise<Result<SequenceWriteResult, SequenceWriteError | CoordinatorWorkspaceError | CoordinatorPausedError>>;
  createSequenceBundle(input: CreateSequenceBundleInput): Promise<Result<SequenceWriteResult, SequenceWriteError | WorktableCommandError | CoordinatorWorkspaceError | CoordinatorPausedError>>;
  deleteSequences(sequenceIds: readonly SequenceId[], worktableDraft: WorktableDraft): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
  listSequences(): ReturnType<AppDependencies["projectStore"]["listSequences"]>;
  loadVersion(versionId: SequenceVersion["id"]): ReturnType<AppDependencies["projectStore"]["loadVersion"]>;
  listVersions(): ReturnType<AppDependencies["projectStore"]["listVersions"]>;
  editSequence<EditError>(
    sequenceId: SequenceId,
    update: (current: SequenceDocument) => SequenceDocument | Result<SequenceDocument, EditError>,
  ): Promise<Result<SequenceWriteResult, LoadError | SequenceWriteError | EditError | CoordinatorPausedError>>;
  retry(scope?: ProjectWriteScope): Promise<boolean>;
  flush(): Promise<Result<ProjectWorkspace, CoordinatorWorkspaceError | CoordinatorPausedError>>;
  flushAll(): Promise<CoordinatorWorkspaceResult>;
  hasUnsavedWork(): boolean;
  exportRecoveryBackup(): Promise<Result<Uint8Array, LoadError>>;
  restoreRecoveryCopy(): Promise<Result<ProjectId, LoadError | BackupError>>;
}

/**
 * Project-level write seam. UI modules submit intent here; this class is the
 * only Table-facing module that knows workspace revisions and store methods.
 */
export class ProjectWriteCoordinatorImpl implements ProjectWriteCoordinator {
  readonly projectId: ProjectId;
  private readonly dependencies: AppDependencies;
  private readonly listeners = new Set<() => void>();
  private snapshot: ProjectWriteSnapshot = { loading: true, saving: false, writeState: "idle" };
  private workspace?: ProjectWorkspace;
  private queue: Promise<unknown> = Promise.resolve();
  private loadGeneration = 0;
  private active = true;
  private pendingWrites = 0;
  private readonly pausedScopes = new Set<string>();
  private readonly retryTasks = new Map<string, { readonly scope: ProjectWriteScope; readonly run: () => Promise<unknown> }>();
  private latestWorktableDraft?: WorktableDraft;
  private readonly latestSequenceDrafts = new Map<SequenceId, SequenceDocument>();
  private readonly acknowledgedSequenceRevisions = new Map<SequenceId, SequenceRevision>();
  private draftGeneration = 0;

  constructor(dependencies: AppDependencies, projectId: ProjectId) {
    this.dependencies = dependencies;
    this.projectId = projectId;
    this.saveWorkspace = this.saveWorkspace.bind(this);
    this.updateResumeContext = this.updateResumeContext.bind(this);
    this.saveWorktable = this.saveWorktable.bind(this);
    this.createSequence = this.createSequence.bind(this);
    this.createSequenceBundle = this.createSequenceBundle.bind(this);
    this.deleteSequences = this.deleteSequences.bind(this);
    this.listSequences = this.listSequences.bind(this);
    this.loadSequence = this.loadSequence.bind(this);
    this.loadVersion = this.loadVersion.bind(this);
    this.listVersions = this.listVersions.bind(this);
    this.saveSequenceDraft = this.saveSequenceDraft.bind(this);
    this.editSequence = this.editSequence.bind(this);
    this.retrySequence = this.retrySequence.bind(this);
    this.flushSequence = this.flushSequence.bind(this);
    this.flush = this.flush.bind(this);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose() {
    this.active = false;
    this.loadGeneration += 1;
    this.listeners.clear();
  }

  async load() {
    await this.queue;
    // A refresh must never erase the only copy of a failed draft or its retry.
    if (this.pausedScopes.size) return;
    const generation = ++this.loadGeneration;
    this.active = true;
    this.workspace = undefined;
    this.pausedScopes.clear();
    this.retryTasks.clear();
    this.latestSequenceDrafts.clear();
    this.updateSnapshot({ loading: true, workspace: undefined, error: undefined, saving: false, writeState: "idle" });
    const result = await this.dependencies.projectStore.loadWorkspace(this.projectId);
    if (!this.active || generation !== this.loadGeneration) return;
    if (result.ok) {
      this.workspace = result.value;
      this.updateSnapshot({ loading: false, workspace: result.value, error: undefined, saving: false, writeState: "idle" });
    } else {
      this.updateSnapshot({ loading: false, workspace: undefined, error: "项目数据无法读取，请返回 Home 重试。", saving: false, writeState: "idle" });
    }
  }

  saveWorkspace(update: ProjectWorkspace | ((current: ProjectWorkspace) => ProjectWorkspace)): Promise<CoordinatorWorkspaceResult> {
    return this.enqueue(async () => {
      const current = this.currentWorkspace();
      if (!current) return err({ kind: "workspace-not-ready" });
      const requested = typeof update === "function" ? update(current) : update;
      if (requested.projectId !== this.projectId) return err({ kind: "workspace-not-ready" });
      if (requested === current) return ok(current);
      const next = { ...requested, revision: current.revision };
      const result = await this.dependencies.projectStore.saveWorkspace(next, current.revision);
      if (!result.ok) return result;
      const saved = { ...next, revision: result.value.revision };
      this.commitWorkspace(saved);
      return ok(saved);
    });
  }

  updateResumeContext(update: ResumeContextUpdate, touchLastOpened = false): Promise<CoordinatorWorkspaceResult> {
    return this.saveWorkspace((current) => {
      const resumeContext = typeof update === "function" ? update(current.resumeContext) : update;
      return {
        ...current,
        resumeContext,
        ...(touchLastOpened ? { lastOpenedAt: new Date().toISOString() } : {}),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  saveWorktable(update: WorktableUpdate): Promise<CoordinatorWorkspaceResult> {
    this.draftGeneration += 1;
    const current = this.currentWorkspace();
    const draft = current && (typeof update === "function" ? update(current.worktableDraft) : update);
    if (draft && (!current || !sameWorktableDraft(draft, current.worktableDraft))) this.latestWorktableDraft = draft;
    return this.enqueue(() => this.performWorktableSave(draft), () => this.performWorktableSave(this.latestWorktableDraft));
  }

  private async performWorktableSave(draft?: WorktableDraft): Promise<CoordinatorWorkspaceResult> {
    const current = this.currentWorkspace();
    if (!current || !draft || draft.projectId !== this.projectId) return err({ kind: "workspace-not-ready" } as const);
    if (draft === current.worktableDraft) return ok(current);
    const result = await this.dependencies.projectStore.saveWorktable(this.projectId, draft, current.revision);
    if (!result.ok) return result;
    const saved = { ...current, worktableDraft: draft, updatedAt: new Date().toISOString(), revision: result.value.revision };
    this.commitWorkspace(saved);
    if (this.latestWorktableDraft === draft) this.latestWorktableDraft = undefined;
    return ok(saved);
  }

  createSequence(input: CreateSequenceTransaction): Promise<Result<SequenceWriteResult, SequenceWriteError | CoordinatorWorkspaceError | CoordinatorPausedError>> {
    return this.enqueue(async () => {
      const current = this.currentWorkspace();
      if (!current || input.worktableDraft.projectId !== this.projectId) return err({ kind: "workspace-not-ready" } as const);
      const result = await this.dependencies.projectStore.createSequence(
        this.projectId,
        current.revision,
        input.sequence,
        input.initialVersion,
        input.worktableDraft,
      );
      if (!result.ok) return result;
      const savedWorkspace = {
        ...current,
        worktableDraft: input.worktableDraft,
        sequenceIds: [...current.sequenceIds, input.sequence.id],
        versionIds: [...current.versionIds, input.initialVersion.id],
        revision: result.value.revision,
        updatedAt: new Date().toISOString(),
      };
      this.commitWorkspace(savedWorkspace);
      return ok({ sequence: input.sequence, summary: result.value.summary, worktableDraft: input.worktableDraft });
    });
  }

  createSequenceBundle(input: CreateSequenceBundleInput) {
    return this.enqueue(async () => {
      const current = this.currentWorkspace();
      if (!current) return err({ kind: "workspace-not-ready" } as const);
      const editor = createWorktableEditor(current.worktableDraft);
      const placement = editor.execute({
        type: "place-sequence-pile",
        placement: {
          sequenceId: input.sequence.id,
          x: input.pile.x,
          y: input.pile.y,
          z: maximumWorktableZ(current.worktableDraft) + 1,
          width: input.pile.width,
          height: input.pile.height,
        },
      });
      if (!placement.ok) return placement;
      const result = await this.dependencies.projectStore.createSequence(this.projectId, current.revision, input.sequence, input.initialVersion, placement.value);
      if (!result.ok) return result;
      const savedWorkspace = { ...current, worktableDraft: placement.value, sequenceIds: [...current.sequenceIds, input.sequence.id], versionIds: [...current.versionIds, input.initialVersion.id], revision: result.value.revision, updatedAt: new Date().toISOString() };
      this.commitWorkspace(savedWorkspace);
      return ok({ sequence: input.sequence, summary: result.value.summary, worktableDraft: placement.value });
    });
  }

  deleteSequences(sequenceIds: readonly SequenceId[], worktableDraft: WorktableDraft): Promise<CoordinatorWorkspaceResult> {
    return this.enqueue(async () => {
      const current = this.currentWorkspace();
      if (!current || worktableDraft.projectId !== this.projectId) return err({ kind: "workspace-not-ready" });
      const result = await this.dependencies.projectStore.deleteSequences(this.projectId, sequenceIds, current.revision, worktableDraft);
      if (!result.ok) return result;
      const saved = {
        ...current,
        worktableDraft,
        sequenceIds: result.value.sequenceIds,
        versionIds: result.value.versionIds,
        updatedAt: new Date().toISOString(),
        revision: result.value.revision,
      };
      this.commitWorkspace(saved);
      return ok(saved);
    });
  }

  listSequences() {
    return this.dependencies.projectStore.listSequences(this.projectId);
  }

  async loadSequence(sequenceId: SequenceId) {
    await this.queue;
    const result = await this.dependencies.projectStore.loadSequence(sequenceId);
    return result;
  }

  loadVersion(versionId: SequenceVersion["id"]) {
    return this.dependencies.projectStore.loadVersion(versionId);
  }

  listVersions() {
    return this.dependencies.projectStore.listVersions(this.projectId);
  }

  saveSequenceDraft(sequence: SequenceDocument): Promise<Result<SequenceWriteResult, LoadError | SequenceWriteError | CoordinatorPausedError>> {
    this.draftGeneration += 1;
    this.latestSequenceDrafts.set(sequence.id, sequence);
    return this.enqueue(
      () => this.performSequenceSave(sequence),
      () => this.performSequenceSave(this.latestSequenceDrafts.get(sequence.id) ?? sequence),
      { kind: "sequence", sequenceId: sequence.id },
    );
  }

  private async performSequenceSave(sequence: SequenceDocument): Promise<Result<SequenceWriteResult, LoadError | SequenceWriteError | CoordinatorPausedError>> {
    // Only advance through this coordinator's successful writes. Reading the
    // latest database revision here would legitimize an external overwrite.
    const revision = Math.max(sequence.revision, this.acknowledgedSequenceRevisions.get(sequence.id) ?? sequence.revision) as SequenceRevision;
    const next = { ...sequence, revision, updatedAt: new Date().toISOString() };
    const result = await this.dependencies.projectStore.saveSequence(next, revision);
    if (!result.ok) return result;
    this.acknowledgedSequenceRevisions.set(sequence.id, result.value.revision);
    if (this.latestSequenceDrafts.get(sequence.id) === sequence) this.latestSequenceDrafts.delete(sequence.id);
    return ok({ sequence: { ...next, revision: result.value.revision }, summary: result.value.summary });
  }

  editSequence<EditError>(
    sequenceId: SequenceId,
    update: (current: SequenceDocument) => SequenceDocument | Result<SequenceDocument, EditError>,
  ) {
    return this.enqueue(async () => {
      const loaded = await this.dependencies.projectStore.loadSequence(sequenceId);
      if (!loaded.ok) return loaded;
      const requested = update(loaded.value);
      const next = isResult(requested) ? requested : ok(requested);
      if (!next.ok) return next;
      const document = { ...next.value, revision: loaded.value.revision, updatedAt: new Date().toISOString() };
      const result = await this.dependencies.projectStore.saveSequence(document, loaded.value.revision);
      if (!result.ok) return result;
      this.acknowledgedSequenceRevisions.set(sequenceId, result.value.revision);
      return ok({ sequence: { ...document, revision: result.value.revision }, summary: result.value.summary });
    }, undefined, { kind: "sequence", sequenceId });
  }

  async retry(scope?: ProjectWriteScope): Promise<boolean> {
    const retryTask = scope ? this.retryTasks.get(writeScopeKey(scope)) : lastMapValue(this.retryTasks);
    if (!retryTask) return false;
    const scopeKey = writeScopeKey(retryTask.scope);
    this.retryTasks.delete(scopeKey);
    this.pausedScopes.delete(scopeKey);
    this.refreshWriteSnapshot();
    const result = await this.enqueue(retryTask.run, retryTask.run, retryTask.scope);
    return !isResult(result) || result.ok;
  }

  retrySequence(sequenceId: SequenceId) {
    return this.retry({ kind: "sequence", sequenceId });
  }

  flush(): Promise<CoordinatorWorkspaceResult> {
    return this.flushScope({ kind: "workspace" });
  }

  hasUnsavedWork() { return this.pendingWrites > 0 || this.pausedScopes.size > 0 || this.latestSequenceDrafts.size > 0 || Boolean(this.latestWorktableDraft); }

  async flushAll(): Promise<CoordinatorWorkspaceResult> {
    let pending;
    do { pending = this.queue; await pending; } while (pending !== this.queue);
    if (this.hasUnsavedWork()) return err({ kind: "writes-paused" });
    const current = this.currentWorkspace();
    return current ? ok(current) : err({ kind: "workspace-not-ready" });
  }

  async exportRecoveryBackup(): Promise<Result<Uint8Array, LoadError>> {
    await this.queue;
    const exported = await this.dependencies.projectStore.exportBackup(this.projectId);
    if (!exported.ok) return exported;
    const backup = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1;
    const recovery = {
      ...backup,
      project: { ...backup.project, ...(this.latestWorktableDraft ? { worktableDraft: this.latestWorktableDraft } : {}) },
      sequences: backup.sequences.map((sequence) => this.latestSequenceDrafts.get(sequence.id) ?? sequence),
    };
    return ok(new TextEncoder().encode(JSON.stringify(recovery)));
  }

  async restoreRecoveryCopy(): Promise<Result<ProjectId, LoadError | BackupError>> {
    const generation = this.draftGeneration;
    const exported = await this.exportRecoveryBackup();
    if (!exported.ok) return exported;
    const imported = await this.dependencies.projectStore.importBackup(exported.value);
    // Edits made while a slow import is running still need their own recovery.
    if (generation !== this.draftGeneration) return err({ kind: "unavailable", retryable: true });
    if (imported.ok) {
      this.pausedScopes.clear();
      this.retryTasks.clear();
      this.latestSequenceDrafts.clear();
      this.latestWorktableDraft = undefined;
      this.refreshWriteSnapshot();
    }
    return imported;
  }

  flushSequence(sequenceId: SequenceId): Promise<CoordinatorWorkspaceResult> {
    return this.flushScope({ kind: "sequence", sequenceId });
  }

  private flushScope(scope: ProjectWriteScope): Promise<CoordinatorWorkspaceResult> {
    return this.enqueue(async () => {
      const current = this.currentWorkspace();
      return current ? ok(current) : err({ kind: "workspace-not-ready" });
    }, undefined, scope);
  }

  private currentWorkspace() {
    return this.active && this.workspace?.projectId === this.projectId ? this.workspace : undefined;
  }

  private commitWorkspace(workspace: ProjectWorkspace) {
    if (!this.active) return;
    this.workspace = workspace;
    this.updateSnapshot({
      workspace,
      loading: false,
      error: undefined,
      saving: this.pendingWrites > 0,
      writeState: this.workspaceWriteState(),
    });
  }

  private updateSnapshot(next: ProjectWriteSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private enqueue<T>(
    task: () => Promise<T>,
    retryTask: (() => Promise<unknown>) | undefined = task,
    scope: ProjectWriteScope = { kind: "workspace" },
  ): Promise<T> {
    const scopeKey = writeScopeKey(scope);
    this.pendingWrites += 1;
    this.refreshWriteSnapshot();
    if (this.pausedScopes.has(scopeKey)) {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      this.refreshWriteSnapshot();
      return Promise.resolve(err({ kind: "writes-paused" } as const) as T);
    }
    const run = async () => {
      if (this.pausedScopes.has(scopeKey)) return err({ kind: "writes-paused" } as const) as T;
      const result = await task();
      if (isResult(result) && !result.ok && shouldPause(result.error)) {
        this.pausedScopes.add(scopeKey);
        this.retryTasks.set(scopeKey, { scope, run: retryTask });
        this.reportWriteFailure(scope, result.error);
      }
      return result;
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.then(() => undefined, () => undefined);
    void pending.then(() => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      this.refreshWriteSnapshot();
    }, () => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      this.refreshWriteSnapshot();
    });
    return pending;
  }

  private refreshWriteSnapshot() {
    this.updateSnapshot({
      ...this.snapshot,
      saving: this.pendingWrites > 0,
      writeState: this.workspaceWriteState(),
    });
  }

  private workspaceWriteState(): ProjectWriteSnapshot["writeState"] {
    if (this.pausedScopes.has(writeScopeKey({ kind: "workspace" }))) return "failed";
    return this.pendingWrites > 0 ? "saving" : "idle";
  }

  private reportWriteFailure(scope: ProjectWriteScope, error: unknown) {
    const errorKind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "unknown";
    const sequenceRevision = scope.kind === "sequence" ? this.latestSequenceDrafts.get(scope.sequenceId)?.revision : undefined;
    this.dependencies.diagnostics?.report({
      name: "write-failure",
      projectId: this.projectId,
      scope: writeScopeKey(scope),
      workspaceRevision: this.workspace?.revision,
      ...(sequenceRevision === undefined ? {} : { sequenceRevision }),
      errorKind,
    });
  }
}

function isResult<T>(value: T | Result<T, unknown>): value is Result<T, unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}

function shouldPause(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("kind" in error)) return false;
  return ["conflict", "sequence-conflict", "quota-exceeded", "unavailable", "unsupported-storage-schema", "migration-failed", "not-found"].includes(String(error.kind));
}

function writeScopeKey(scope: ProjectWriteScope) {
  return scope.kind === "workspace" ? "workspace" : `sequence:${scope.sequenceId}`;
}

function lastMapValue<K, V>(values: Map<K, V>): V | undefined {
  let last: V | undefined;
  values.forEach((value) => { last = value; });
  return last;
}

export function createProjectWriteCoordinator(dependencies: AppDependencies, projectId: ProjectId) {
  return new ProjectWriteCoordinatorImpl(dependencies, projectId);
}

function maximumWorktableZ(draft: WorktableDraft) {
  return Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z));
}

function sameWorktableDraft(left: WorktableDraft, right: WorktableDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type ProjectWriteSequenceError = SequenceWriteError | SequenceCommandError;
