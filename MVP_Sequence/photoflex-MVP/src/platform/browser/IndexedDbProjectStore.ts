import {
  err,
  ok,
  type BackupError,
  type CorruptDataError,
  type CreateProjectError,
  type CreateProjectInput,
  type DeleteError,
  type LoadError,
  type LayoutDocument,
  type LayoutId,
  type LayoutRevision,
  type LayoutSummary,
  type LayoutWriteError,
  type ProjectId,
  type ProjectBackupV1,
  type ProjectStore,
  type ProjectSummary,
  type ProjectWorkspace,
  type Result,
  type SaveError,
  type SequenceVersion,
  type SequenceDocument,
  type SequenceId,
  type SequenceRevision,
  type SequenceSummary,
  type SequenceWriteError,
  type WorktableDraft,
  type StorageAccessError,
  type VersionId,
  type VersionSummary,
  type VersionWriteError,
  type SaveSequenceVersionInput,
  type SaveSequenceVersionError,
  type DeleteVersionError,
  type WorkspaceRevision,
} from "../../contracts";
import {
  clone,
  createBackup,
  createWorkspace,
  isSequenceDocument,
  toLayoutSummary,
  validateLayoutForProject,
  isWorkspace,
  toProjectSummary,
  toVersionSummary,
  validateVersionForProject,
  validateSequenceForProject,
} from "../projectStoreData";
import { toSequenceSummary } from "../../modules/sequence";
import { openPhotoFlexDatabase, STORE_NAMES } from "./indexedDbSchema";
import { prepareBackupImport } from "../projectBackup";
import type { PhotoRef } from "../../contracts";

interface IndexedDbProjectStoreOptions {
  readonly indexedDB?: IDBFactory;
  readonly databaseName?: string;
  readonly onBlocked?: () => void;
  readonly onVersionChange?: () => void;
}

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const isQuotaError = (error: DOMException | null) => error?.name === "QuotaExceededError";

export class IndexedDbProjectStore implements ProjectStore {
  private constructor(
    private readonly database: Promise<Result<IDBDatabase, StorageAccessError>>,
  ) {}

  static open(options: IndexedDbProjectStoreOptions = {}): IndexedDbProjectStore {
    return new IndexedDbProjectStore(openPhotoFlexDatabase(options));
  }

  async close(): Promise<void> {
    const opened = await this.database;
    if (opened.ok) opened.value.close();
  }

  async listProjects(): Promise<Result<readonly ProjectSummary[], CorruptDataError | StorageAccessError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readonly");
      const records = await requestValue<unknown[]>(
        transaction.objectStore(STORE_NAMES.projects).getAll(),
      );
      const corrupt = records.find((record) => !isWorkspace(record));
      if (corrupt) return err({ kind: "corrupt-data", entityId: "unknown-project" });
      return ok(
        records
          .filter(isWorkspace)
          .map(toProjectSummary)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async createProject(
    input: CreateProjectInput,
  ): Promise<Result<ProjectWorkspace, CreateProjectError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const workspace = createWorkspace(input);

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readwrite");
      const store = transaction.objectStore(STORE_NAMES.projects);
      let result: Result<ProjectWorkspace, CreateProjectError> = ok(workspace);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const existing = store.get(input.id);
      existing.onsuccess = () => {
        if (existing.result) {
          result = err({ kind: "project-id-exists", projectId: input.id });
        } else {
          store.add(clone(workspace));
        }
      };
    });
  }

  async loadWorkspace(projectId: ProjectId): Promise<Result<ProjectWorkspace, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readonly");
      const workspace = await requestValue<ProjectWorkspace | undefined>(
        transaction.objectStore(STORE_NAMES.projects).get(projectId),
      );
      if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
      if (!isWorkspace(workspace)) return err({ kind: "corrupt-data", entityId: projectId });
      return ok(clone(workspace));
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async saveWorkspace(
    workspace: ProjectWorkspace,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    if (!isWorkspace(workspace)) return err({ kind: "unavailable", retryable: false });

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readwrite");
      const store = transaction.objectStore(STORE_NAMES.projects);
      let result: Result<{ readonly revision: WorkspaceRevision }, SaveError> = err({
        kind: "unavailable",
        retryable: true,
      });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const read = store.get(workspace.projectId);
      read.onsuccess = () => {
        const current = read.result as ProjectWorkspace | undefined;
        if (!current) {
          result = err({ kind: "not-found", entity: "project", id: workspace.projectId });
          return;
        }
        if (current.revision !== expectedRevision) {
          result = err({
            kind: "conflict",
            expectedRevision,
            actualRevision: current.revision,
          });
          return;
        }
        const revision = (expectedRevision + 1) as WorkspaceRevision;
        store.put(clone({ ...workspace, revision }));
        result = ok({ revision });
      };
    });
  }

  async saveWorktable(
    projectId: ProjectId,
    draft: WorktableDraft,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>> {
    if (draft.projectId !== projectId) return err({ kind: "not-found", entity: "project", id: projectId });
    const loaded = await this.loadWorkspace(projectId);
    if (!loaded.ok) {
      if (loaded.error.kind === "corrupt-data") return err({ kind: "unavailable", retryable: false });
      return err(loaded.error);
    }
    if (loaded.value.revision !== expectedRevision) {
      return err({ kind: "conflict", expectedRevision, actualRevision: loaded.value.revision });
    }
    return this.saveWorkspace({ ...loaded.value, worktableDraft: draft, updatedAt: new Date().toISOString() }, expectedRevision);
  }

  async createSequence(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    sequence: SequenceDocument,
    initialVersion: SequenceVersion,
    worktableDraft: WorktableDraft,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: WorkspaceRevision }, SequenceWriteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const validation = validateSequenceForProject(projectId, sequence);
    if (!validation.ok) return validation;
    const versionValidation = validateVersionForProject(projectId, initialVersion);
    if (!versionValidation.ok || initialVersion.sequenceId !== sequence.id || initialVersion.id !== sequence.currentVersionId) return err({ kind: "invalid-sequence", reason: "Initial version does not match Sequence." });
    return new Promise((resolve) => {
      const transaction = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.sequences, STORE_NAMES.versions], "readwrite");
      const projects = transaction.objectStore(STORE_NAMES.projects);
      const sequences = transaction.objectStore(STORE_NAMES.sequences);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      let result: Result<{ readonly summary: SequenceSummary; readonly revision: WorkspaceRevision }, SequenceWriteError> = err({ kind: "unavailable", retryable: true });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => resolve(isQuotaError(transaction.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) { result = err({ kind: "not-found", entity: "project", id: projectId }); return; }
        if (workspace.revision !== expectedRevision) { result = err({ kind: "conflict", expectedRevision, actualRevision: workspace.revision }); return; }
        const existingRequest = sequences.index("by-project-id").getAll(projectId);
        existingRequest.onsuccess = () => {
          const existing = existingRequest.result as SequenceDocument[];
          if (existing.some((item) => item.id === sequence.id)) { result = err({ kind: "sequence-id-exists", sequenceId: sequence.id }); return; }
          if (existing.some((item) => item.name.toLocaleLowerCase() === sequence.name.toLocaleLowerCase())) { result = err({ kind: "sequence-name-exists", name: sequence.name }); return; }
          const revision = (expectedRevision + 1) as WorkspaceRevision;
          sequences.add(clone(sequence));
          versions.add(clone(initialVersion));
          projects.put(clone({ ...workspace, worktableDraft, sequenceIds: [...workspace.sequenceIds, sequence.id], versionIds: [...workspace.versionIds, initialVersion.id], revision, updatedAt: sequence.updatedAt }));
          result = ok({ summary: toSequenceSummary(sequence), revision });
        };
      };
    });
  }

  async listSequences(projectId: ProjectId): Promise<Result<readonly SequenceSummary[], LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const records = await requestValue<SequenceDocument[]>(opened.value.transaction(STORE_NAMES.sequences, "readonly").objectStore(STORE_NAMES.sequences).index("by-project-id").getAll(projectId));
      const byId = new Map(records.map((sequence) => [sequence.id, sequence]));
      const summaries: SequenceSummary[] = [];
      for (const sequenceId of workspace.value.sequenceIds) {
        const sequence = byId.get(sequenceId);
        if (!sequence) return err({ kind: "corrupt-data", entityId: sequenceId });
        summaries.push(toSequenceSummary(sequence));
      }
      return ok(summaries);
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async loadSequence(sequenceId: SequenceId): Promise<Result<SequenceDocument, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const sequence = await requestValue<unknown>(opened.value.transaction(STORE_NAMES.sequences, "readonly").objectStore(STORE_NAMES.sequences).get(sequenceId));
      if (sequence === undefined) return err({ kind: "not-found", entity: "sequence", id: sequenceId });
      return isSequenceDocument(sequence)
        ? ok(clone(sequence))
        : err({ kind: "corrupt-data", entityId: sequenceId });
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async saveSequence(
    sequence: SequenceDocument,
    expectedRevision: SequenceRevision,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: SequenceRevision }, SequenceWriteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const validation = validateSequenceForProject(sequence.projectId, sequence);
    if (!validation.ok) return validation;
    return new Promise((resolve) => {
      const transaction = opened.value.transaction(STORE_NAMES.sequences, "readwrite");
      const store = transaction.objectStore(STORE_NAMES.sequences);
      let result: Result<{ readonly summary: SequenceSummary; readonly revision: SequenceRevision }, SequenceWriteError> = err({ kind: "unavailable", retryable: true });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => resolve(isQuotaError(transaction.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const allRequest = store.index("by-project-id").getAll(sequence.projectId);
      allRequest.onsuccess = () => {
        const records = allRequest.result as SequenceDocument[];
        const current = records.find((item) => item.id === sequence.id);
        if (!current) { result = err({ kind: "not-found", entity: "sequence", id: sequence.id }); return; }
        if (current.revision !== expectedRevision) { result = err({ kind: "sequence-conflict", expectedRevision, actualRevision: current.revision }); return; }
        if (records.some((item) => item.id !== sequence.id && item.name.toLocaleLowerCase() === sequence.name.toLocaleLowerCase())) { result = err({ kind: "sequence-name-exists", name: sequence.name }); return; }
        const revision = (expectedRevision + 1) as SequenceRevision;
        const saved = { ...sequence, revision };
        store.put(clone(saved));
        result = ok({ summary: toSequenceSummary(saved), revision });
      };
    });
  }

  async deleteSequences(
    projectId: ProjectId,
    sequenceIds: readonly SequenceId[],
    expectedWorkspaceRevision: WorkspaceRevision,
    worktableDraft: WorktableDraft,
  ): Promise<Result<{ readonly revision: WorkspaceRevision; readonly sequenceIds: readonly SequenceId[]; readonly versionIds: readonly VersionId[]; readonly layoutIds: readonly LayoutId[] }, SaveError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    if (worktableDraft.projectId !== projectId) return err({ kind: "not-found", entity: "project", id: projectId });
    return new Promise((resolve) => {
      const transaction = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.sequences, STORE_NAMES.versions, STORE_NAMES.layouts], "readwrite");
      const projects = transaction.objectStore(STORE_NAMES.projects);
      const sequences = transaction.objectStore(STORE_NAMES.sequences);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      const layouts = transaction.objectStore(STORE_NAMES.layouts);
      const ids = [...new Set(sequenceIds)];
      let result: Result<{ readonly revision: WorkspaceRevision; readonly sequenceIds: readonly SequenceId[]; readonly versionIds: readonly VersionId[]; readonly layoutIds: readonly LayoutId[] }, SaveError> = err({ kind: "unavailable", retryable: true });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => resolve(isQuotaError(transaction.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) { result = err({ kind: "not-found", entity: "project", id: projectId }); return; }
        if (workspace.revision !== expectedWorkspaceRevision) { result = err({ kind: "conflict", expectedRevision: expectedWorkspaceRevision, actualRevision: workspace.revision }); return; }
        const sequenceRequest = sequences.index("by-project-id").getAll(projectId);
        sequenceRequest.onsuccess = () => {
          const records = sequenceRequest.result as SequenceDocument[];
          const selected = records.filter((sequence) => ids.includes(sequence.id));
          const missing = ids.find((id) => !selected.some((sequence) => sequence.id === id));
          if (missing) { result = err({ kind: "not-found", entity: "sequence", id: missing }); return; }
          const removed = new Set(ids);
          const versionRequest = versions.index("by-project-id").getAll(projectId);
          versionRequest.onsuccess = () => {
            const allVersions = versionRequest.result as SequenceVersion[];
            const removedVersionIds = new Set(allVersions.filter((version) => removed.has(version.sequenceId)).map((version) => version.id));
            const layoutRequest = layouts.index("by-project-id").getAll(projectId);
            layoutRequest.onsuccess = () => {
              const allLayouts = layoutRequest.result as LayoutDocument[];
              const removedLayoutIds = new Set(allLayouts.filter((layout) => removed.has(layout.sequenceId)).map((layout) => layout.id));
              removedVersionIds.forEach((id) => versions.delete(id));
              removedLayoutIds.forEach((id) => layouts.delete(id));
              ids.forEach((id) => sequences.delete(id));
              const revision = (expectedWorkspaceRevision + 1) as WorkspaceRevision;
              const sequenceIds = workspace.sequenceIds.filter((id) => !removed.has(id));
              const versionIds = workspace.versionIds.filter((id) => !removedVersionIds.has(id));
              const layoutIds = workspace.layoutIds.filter((id) => !removedLayoutIds.has(id));
              projects.put(clone({ ...workspace, sequenceIds, versionIds, layoutIds, worktableDraft, revision, updatedAt: new Date().toISOString() }));
              result = ok({ revision, sequenceIds, versionIds, layoutIds });
            };
          };
        };
      };
    });
  }

  async createVersion(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    version: SequenceVersion,
  ): Promise<
    Result<{ readonly summary: VersionSummary; readonly revision: WorkspaceRevision }, VersionWriteError>
  > {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const validation = validateVersionForProject(projectId, version);
    if (!validation.ok) return err(validation.error);

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(
        [STORE_NAMES.projects, STORE_NAMES.versions],
        "readwrite",
      );
      const projects = transaction.objectStore(STORE_NAMES.projects);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      let result: Result<
        { readonly summary: VersionSummary; readonly revision: WorkspaceRevision },
        VersionWriteError
      > = err({ kind: "unavailable", retryable: true });

      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) {
          result = err({ kind: "not-found", entity: "project", id: projectId });
          return;
        }
        if (workspace.revision !== expectedRevision) {
          result = err({
            kind: "conflict",
            expectedRevision,
            actualRevision: workspace.revision,
          });
          return;
        }
        const versionRequest = versions.get(version.id);
        versionRequest.onsuccess = () => {
          if (versionRequest.result) {
            result = err({ kind: "version-id-exists", versionId: version.id });
            return;
          }
          const revision = (expectedRevision + 1) as WorkspaceRevision;
          versions.add(clone(version));
          projects.put(
            clone({
              ...workspace,
              versionIds: [...workspace.versionIds, version.id],
              revision,
              updatedAt: version.createdAt,
            }),
          );
          result = ok({ summary: toVersionSummary(version), revision });
        };
      };
    });
  }

  async saveSequenceVersion(
    input: SaveSequenceVersionInput,
  ): Promise<Result<{ readonly summary: VersionSummary; readonly workspaceRevision: WorkspaceRevision; readonly sequenceRevision: SequenceRevision }, SaveSequenceVersionError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const sequenceValidation = validateSequenceForProject(input.projectId, input.sequence);
    if (!sequenceValidation.ok) return sequenceValidation;
    const versionValidation = validateVersionForProject(input.projectId, input.version);
    if (!versionValidation.ok) return versionValidation;
    return new Promise((resolve) => {
      const transaction = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.sequences, STORE_NAMES.versions], "readwrite");
      const projects = transaction.objectStore(STORE_NAMES.projects), sequences = transaction.objectStore(STORE_NAMES.sequences), versions = transaction.objectStore(STORE_NAMES.versions);
      let result: Result<{ readonly summary: VersionSummary; readonly workspaceRevision: WorkspaceRevision; readonly sequenceRevision: SequenceRevision }, SaveSequenceVersionError> = err({ kind: "unavailable", retryable: true });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => resolve(isQuotaError(transaction.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const projectRequest = projects.get(input.projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) { result = err({ kind: "not-found", entity: "project", id: input.projectId }); return; }
        if (workspace.revision !== input.expectedWorkspaceRevision) { result = err({ kind: "conflict", expectedRevision: input.expectedWorkspaceRevision, actualRevision: workspace.revision }); return; }
        const sequenceRequest = sequences.get(input.sequence.id);
        sequenceRequest.onsuccess = () => {
          const currentSequence = sequenceRequest.result as SequenceDocument | undefined;
          if (!currentSequence) { result = err({ kind: "not-found", entity: "sequence", id: input.sequence.id }); return; }
          if (currentSequence.revision !== input.expectedSequenceRevision) { result = err({ kind: "sequence-conflict", expectedRevision: input.expectedSequenceRevision, actualRevision: currentSequence.revision }); return; }
          const versionRequest = versions.get(input.version.id);
          versionRequest.onsuccess = () => {
            const existing = versionRequest.result as SequenceVersion | undefined;
            if (input.mode === "overwrite" && !existing) { result = err({ kind: "version-not-found", versionId: input.version.id }); return; }
            if (existing && (existing.sequenceId !== input.sequence.id || existing.projectId !== input.projectId)) { result = err({ kind: "version-sequence-mismatch" }); return; }
            if (input.mode === "overwrite" && existing && existing.name !== input.version.name) { result = err({ kind: "version-name-immutable" }); return; }
            const allRequest = versions.index("by-project-id").getAll(input.projectId);
            allRequest.onsuccess = () => {
              const all = allRequest.result as SequenceVersion[];
              if (input.mode === "save-as" && (existing || all.some((item) => item.name.toLocaleLowerCase() === input.version.name.toLocaleLowerCase()))) { result = err(existing ? { kind: "version-id-exists", versionId: input.version.id } : { kind: "version-name-exists", name: input.version.name }); return; }
              const updatedAt = input.version.updatedAt ?? new Date().toISOString();
              const savedVersion = clone({ ...input.version, updatedAt });
              const sequenceRevision = (input.expectedSequenceRevision + 1) as SequenceRevision;
              const workspaceRevision = (input.expectedWorkspaceRevision + 1) as WorkspaceRevision;
              sequences.put(clone({ ...input.sequence, currentVersionId: input.version.id, revision: sequenceRevision, updatedAt }));
              versions.put(savedVersion);
              projects.put(clone({ ...workspace, revision: workspaceRevision, updatedAt, versionIds: input.mode === "save-as" ? [...workspace.versionIds, input.version.id] : workspace.versionIds }));
              result = ok({ summary: toVersionSummary(savedVersion), workspaceRevision, sequenceRevision });
            };
          };
        };
      };
    });
  }

  async deleteVersion(projectId: ProjectId, versionId: VersionId, expectedWorkspaceRevision: WorkspaceRevision): Promise<Result<{ readonly revision: WorkspaceRevision }, DeleteVersionError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    return new Promise((resolve) => {
      const transaction = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.sequences, STORE_NAMES.versions], "readwrite");
      const projects = transaction.objectStore(STORE_NAMES.projects), sequences = transaction.objectStore(STORE_NAMES.sequences), versions = transaction.objectStore(STORE_NAMES.versions);
      let result: Result<{ readonly revision: WorkspaceRevision }, DeleteVersionError> = err({ kind: "unavailable", retryable: true });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => resolve(isQuotaError(transaction.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) { result = err({ kind: "not-found", entity: "project", id: projectId }); return; }
        if (workspace.revision !== expectedWorkspaceRevision) { result = err({ kind: "conflict", expectedRevision: expectedWorkspaceRevision, actualRevision: workspace.revision }); return; }
        const versionRequest = versions.get(versionId);
        versionRequest.onsuccess = () => {
          const version = versionRequest.result as SequenceVersion | undefined;
          if (!version || version.projectId !== projectId) { result = err({ kind: "version-not-found", versionId }); return; }
          const sequenceRequest = sequences.get(version.sequenceId);
          sequenceRequest.onsuccess = () => {
            const sequence = sequenceRequest.result as SequenceDocument | undefined;
            if (sequence?.currentVersionId === versionId) { result = err({ kind: "cannot-delete-current-version", versionId }); return; }
            const revision = (expectedWorkspaceRevision + 1) as WorkspaceRevision;
            versions.delete(versionId);
            projects.put(clone({ ...workspace, versionIds: workspace.versionIds.filter((id) => id !== versionId), revision, updatedAt: new Date().toISOString() }));
            result = ok({ revision });
          };
        };
      };
    });
  }

  async listVersions(projectId: ProjectId): Promise<Result<readonly VersionSummary[], LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.versions, "readonly");
      const versions = await requestValue<SequenceVersion[]>(
        transaction.objectStore(STORE_NAMES.versions).index("by-project-id").getAll(projectId),
      );
      const byId = new Map(versions.map((version) => [version.id, version]));
      const summaries: VersionSummary[] = [];
      for (const versionId of workspace.value.versionIds) {
        const version = byId.get(versionId);
        if (!version) return err({ kind: "corrupt-data", entityId: versionId });
        summaries.push(toVersionSummary(version));
      }
      return ok(summaries);
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async loadVersion(versionId: VersionId): Promise<Result<SequenceVersion, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.versions, "readonly");
      const version = await requestValue<SequenceVersion | undefined>(
        transaction.objectStore(STORE_NAMES.versions).get(versionId),
      );
      return version
        ? ok(clone(version))
        : err({ kind: "not-found", entity: "version", id: versionId });
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async deleteProject(projectId: ProjectId): Promise<Result<void, DeleteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const loaded = await this.loadWorkspace(projectId);
    if (!loaded.ok) {
      return err(loaded.error);
    }

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(
        [STORE_NAMES.projects, STORE_NAMES.versions, STORE_NAMES.sequences, STORE_NAMES.layouts],
        "readwrite",
      );
      transaction.oncomplete = () => resolve(ok(undefined));
      transaction.onabort = () => resolve(err({ kind: "unavailable", retryable: true }));
      transaction.objectStore(STORE_NAMES.projects).delete(projectId);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      for (const versionId of loaded.value.versionIds) versions.delete(versionId);
      const sequences = transaction.objectStore(STORE_NAMES.sequences);
      for (const sequenceId of loaded.value.sequenceIds) sequences.delete(sequenceId);
      const layouts = transaction.objectStore(STORE_NAMES.layouts);
      for (const layoutId of loaded.value.layoutIds) layouts.delete(layoutId);
    });
  }

  async exportBackup(projectId: ProjectId): Promise<Result<Uint8Array, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      // Read all documents in one transaction: a concurrent edit cannot split a backup.
      const tx = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.versions, STORE_NAMES.sequences, STORE_NAMES.layouts, STORE_NAMES.photoIndex], "readonly");
      const [project, allVersions, allSequences, allLayouts, allPhotos] = await Promise.all([
        requestValue<ProjectWorkspace | undefined>(tx.objectStore(STORE_NAMES.projects).get(projectId)),
        requestValue<SequenceVersion[]>(tx.objectStore(STORE_NAMES.versions).index("by-project-id").getAll(projectId)),
        requestValue<SequenceDocument[]>(tx.objectStore(STORE_NAMES.sequences).index("by-project-id").getAll(projectId)),
        requestValue<LayoutDocument[]>(tx.objectStore(STORE_NAMES.layouts).index("by-project-id").getAll(projectId)),
        requestValue<PhotoRef[]>(tx.objectStore(STORE_NAMES.photoIndex).getAll()),
      ]);
      if (!project) return err({ kind: "not-found", entity: "project", id: projectId });
      if (!isWorkspace(project) || project.versionIds.some((id) => !allVersions.some((v) => v.id === id)) || project.sequenceIds.some((id) => !allSequences.some((s) => s.id === id)) || project.layoutIds.some((id) => !allLayouts.some((layout) => layout.id === id && validateLayoutForProject(projectId, layout).ok))) return err({ kind: "corrupt-data", entityId: projectId });
      const sourceIds = new Set(project.sources.map((s) => s.id));
      const backup = { ...createBackup(project, allVersions.filter((v) => project.versionIds.includes(v.id)), allSequences.filter((s) => project.sequenceIds.includes(s.id)), allLayouts.filter((layout) => project.layoutIds.includes(layout.id))), photoManifest: allPhotos.filter((p) => sourceIds.has(p.sourceId)).map(({ id: photoId, ...p }) => ({ ...p, photoId })) };
      return ok(new TextEncoder().encode(JSON.stringify(backup)));
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async importBackup(bytes: Uint8Array): Promise<Result<ProjectId, BackupError>> {
    const prepared = prepareBackupImport(bytes);
    if (!prepared.ok) return prepared;
    const opened = await this.database;
    if (!opened.ok) return opened;
    const { backup, photos } = prepared.value;
    try {
      const tx = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.versions, STORE_NAMES.sequences, STORE_NAMES.layouts, STORE_NAMES.photoIndex], "readwrite");
      return await new Promise((resolve) => {
        let writeError: unknown;
        tx.oncomplete = () => resolve(ok(backup.project.projectId));
        tx.onabort = () => resolve(isQuotaError(tx.error) || (writeError instanceof DOMException && writeError.name === "QuotaExceededError") ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
        tx.onerror = () => {}; // The abort event reports the atomic failure.
        try {
          tx.objectStore(STORE_NAMES.projects).add(backup.project);
          backup.versions.forEach((v) => tx.objectStore(STORE_NAMES.versions).add(v));
          backup.sequences.forEach((s) => tx.objectStore(STORE_NAMES.sequences).add(s));
          backup.layouts.forEach((layout) => tx.objectStore(STORE_NAMES.layouts).add(layout));
          photos.forEach((p) => tx.objectStore(STORE_NAMES.photoIndex).add(p));
        } catch (error) { writeError = error; tx.abort(); }
      });
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async installCloudSnapshot(document: ProjectBackupV1): Promise<Result<void, BackupError>> {
    const prepared = prepareBackupImport(new TextEncoder().encode(JSON.stringify(document)), true);
    if (!prepared.ok) return prepared;
    const opened = await this.database;
    if (!opened.ok) return opened;
    const { backup, photos } = prepared.value;
    return new Promise((resolve) => {
      const tx = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.versions, STORE_NAMES.sequences, STORE_NAMES.layouts, STORE_NAMES.photoIndex], "readwrite");
      const projects = tx.objectStore(STORE_NAMES.projects);
      const versions = tx.objectStore(STORE_NAMES.versions);
      const sequences = tx.objectStore(STORE_NAMES.sequences);
      const layouts = tx.objectStore(STORE_NAMES.layouts);
      const photoIndex = tx.objectStore(STORE_NAMES.photoIndex);
      tx.oncomplete = () => resolve(ok(undefined));
      tx.onabort = () => resolve(isQuotaError(tx.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const existing = projects.get(backup.project.projectId);
      existing.onsuccess = () => {
        const previous = existing.result as ProjectWorkspace | undefined;
        const allPhotos = photoIndex.getAll();
        allPhotos.onsuccess = () => {
          try {
            if (previous) {
              previous.versionIds.forEach((id) => versions.delete(id));
              previous.sequenceIds.forEach((id) => sequences.delete(id));
              previous.layoutIds.forEach((id) => layouts.delete(id));
              const oldSources = new Set(previous.sources.map((source) => source.id));
              (allPhotos.result as PhotoRef[]).filter((photo) => oldSources.has(photo.sourceId)).forEach((photo) => photoIndex.delete(photo.id));
            }
            projects.put(clone(backup.project));
            backup.versions.forEach((version) => versions.put(clone(version)));
            backup.sequences.forEach((sequence) => sequences.put(clone(sequence)));
            backup.layouts.forEach((layout) => layouts.put(clone(layout)));
            photos.forEach((photo) => photoIndex.put(clone(photo)));
          } catch { tx.abort(); }
        };
      };
    });
  }

  async createLayout(projectId: ProjectId, expectedRevision: WorkspaceRevision, layout: LayoutDocument): Promise<Result<{ readonly summary: LayoutSummary; readonly revision: WorkspaceRevision }, LayoutWriteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const validation = validateLayoutForProject(projectId, layout);
    if (!validation.ok || layout.revision !== 0) return err({ kind: "invalid-layout", reason: "Invalid initial Layout." });
    return new Promise((resolve) => {
      const tx = opened.value.transaction([STORE_NAMES.projects, STORE_NAMES.sequences, STORE_NAMES.layouts], "readwrite");
      const projects = tx.objectStore(STORE_NAMES.projects), sequences = tx.objectStore(STORE_NAMES.sequences), layouts = tx.objectStore(STORE_NAMES.layouts);
      let result: Result<{ readonly summary: LayoutSummary; readonly revision: WorkspaceRevision }, LayoutWriteError> = err({ kind: "unavailable", retryable: true });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => resolve(isQuotaError(tx.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) { result = err({ kind: "not-found", entity: "project", id: projectId }); return; }
        if (workspace.revision !== expectedRevision) { result = err({ kind: "conflict", expectedRevision, actualRevision: workspace.revision }); return; }
        const sequenceRequest = sequences.get(layout.sequenceId);
        sequenceRequest.onsuccess = () => {
          const sequence = sequenceRequest.result as SequenceDocument | undefined;
          if (!sequence || sequence.projectId !== projectId || !workspace.sequenceIds.includes(layout.sequenceId)) { result = err({ kind: "not-found", entity: "sequence", id: layout.sequenceId }); return; }
          const idRequest = layouts.get(layout.id);
          idRequest.onsuccess = () => {
            if (idRequest.result) { result = err({ kind: "layout-id-exists", layoutId: layout.id }); return; }
            const sequenceLayoutRequest = layouts.index("by-sequence-id").get(layout.sequenceId);
            sequenceLayoutRequest.onsuccess = () => {
              if (sequenceLayoutRequest.result) { result = err({ kind: "layout-exists-for-sequence", sequenceId: layout.sequenceId }); return; }
              const revision = (expectedRevision + 1) as WorkspaceRevision;
              layouts.add(clone(layout));
              projects.put(clone({ ...workspace, layoutIds: [...workspace.layoutIds, layout.id], revision, updatedAt: layout.updatedAt }));
              result = ok({ summary: toLayoutSummary(layout), revision });
            };
          };
        };
      };
    });
  }

  async listLayouts(projectId: ProjectId): Promise<Result<readonly LayoutSummary[], LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const rows = await requestValue<unknown[]>(opened.value.transaction(STORE_NAMES.layouts, "readonly").objectStore(STORE_NAMES.layouts).index("by-project-id").getAll(projectId));
      const byId = new Map(rows.filter((row): row is LayoutDocument => typeof row === "object" && row !== null && "id" in row).map((row) => [row.id, row]));
      const summaries: LayoutSummary[] = [];
      for (const layoutId of workspace.value.layoutIds) {
        const layout = byId.get(layoutId);
        if (!layout || !validateLayoutForProject(projectId, layout).ok) return err({ kind: "corrupt-data", entityId: layoutId });
        summaries.push(toLayoutSummary(layout));
      }
      if (rows.length !== summaries.length) return err({ kind: "corrupt-data", entityId: projectId });
      return ok(summaries);
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async loadLayout(layoutId: LayoutId): Promise<Result<LayoutDocument, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const layout = await requestValue<unknown>(opened.value.transaction(STORE_NAMES.layouts, "readonly").objectStore(STORE_NAMES.layouts).get(layoutId));
      if (layout === undefined) return err({ kind: "not-found", entity: "layout", id: layoutId });
      if (!layout || typeof layout !== "object" || !("projectId" in layout) || !validateLayoutForProject((layout as LayoutDocument).projectId, layout as LayoutDocument).ok) return err({ kind: "corrupt-data", entityId: layoutId });
      return ok(clone(layout as LayoutDocument));
    } catch { return err({ kind: "unavailable", retryable: true }); }
  }

  async saveLayout(layout: LayoutDocument, expectedRevision: LayoutRevision): Promise<Result<{ readonly summary: LayoutSummary; readonly revision: LayoutRevision }, LayoutWriteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    return new Promise((resolve) => {
      const tx = opened.value.transaction(STORE_NAMES.layouts, "readwrite");
      const store = tx.objectStore(STORE_NAMES.layouts);
      let result: Result<{ readonly summary: LayoutSummary; readonly revision: LayoutRevision }, LayoutWriteError> = err({ kind: "unavailable", retryable: true });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => resolve(isQuotaError(tx.error) ? err({ kind: "quota-exceeded" }) : err({ kind: "unavailable", retryable: true }));
      const request = store.get(layout.id);
      request.onsuccess = () => {
        const current = request.result as LayoutDocument | undefined;
        if (!current) { result = err({ kind: "not-found", entity: "layout", id: layout.id }); return; }
        if (current.revision !== expectedRevision) { result = err({ kind: "layout-conflict", expectedRevision, actualRevision: current.revision }); return; }
        const validation = validateLayoutForProject(current.projectId, layout);
        if (!validation.ok || layout.sequenceId !== current.sequenceId) { result = err({ kind: "invalid-layout", reason: "Layout identity changed or content is invalid." }); return; }
        const revision = (expectedRevision + 1) as LayoutRevision;
        const saved = { ...layout, revision };
        store.put(clone(saved));
        result = ok({ summary: toLayoutSummary(saved), revision });
      };
    });
  }
}
