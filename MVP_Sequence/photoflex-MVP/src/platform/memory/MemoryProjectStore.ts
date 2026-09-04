import {
  err,
  ok,
  type BackupError,
  type CorruptDataError,
  type CreateProjectError,
  type CreateProjectInput,
  type DeleteError,
  type LoadError,
  type ProjectId,
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
  isWorkspace,
  toProjectSummary,
  toVersionSummary,
  validateVersionForProject,
  validateSequenceForProject,
} from "../projectStoreData";
import { toSequenceSummary } from "../../modules/sequence";

export interface MemoryProjectDatabase {
  readonly projects: Map<ProjectId, ProjectWorkspace>;
  readonly versions: Map<VersionId, SequenceVersion>;
  readonly sequences: Map<SequenceId, SequenceDocument>;
  readonly corruptProjectIds: Set<ProjectId>;
}

export const createMemoryProjectDatabase = (): MemoryProjectDatabase => ({
  projects: new Map(),
  versions: new Map(),
  sequences: new Map(),
  corruptProjectIds: new Set(),
});

interface MemoryProjectStoreOptions {
  readonly unavailable?: boolean;
  readonly quotaExceeded?: boolean;
}

export class MemoryProjectStore implements ProjectStore {
  constructor(
    private readonly database = createMemoryProjectDatabase(),
    private readonly options: MemoryProjectStoreOptions = {},
  ) {}

  async listProjects(): Promise<
    Result<readonly ProjectSummary[], CorruptDataError | { kind: "unavailable"; retryable: boolean }>
  > {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    const corruptId = this.database.corruptProjectIds.values().next().value;
    if (corruptId) return err({ kind: "corrupt-data", entityId: corruptId });
    return ok(
      [...this.database.projects.values()]
        .map(toProjectSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async createProject(
    input: CreateProjectInput,
  ): Promise<Result<ProjectWorkspace, CreateProjectError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    if (this.database.projects.has(input.id)) {
      return err({ kind: "project-id-exists", projectId: input.id });
    }
    const workspace = createWorkspace(input);
    this.database.projects.set(input.id, clone(workspace));
    return ok(workspace);
  }

  async loadWorkspace(projectId: ProjectId): Promise<Result<ProjectWorkspace, LoadError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.database.corruptProjectIds.has(projectId)) {
      return err({ kind: "corrupt-data", entityId: projectId });
    }
    const workspace = this.database.projects.get(projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
    if (!isWorkspace(workspace)) return err({ kind: "corrupt-data", entityId: projectId });
    return ok(clone(workspace));
  }

  async saveWorkspace(
    workspace: ProjectWorkspace,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    const current = this.database.projects.get(workspace.projectId);
    if (!current) {
      return err({ kind: "not-found", entity: "project", id: workspace.projectId });
    }
    if (current.revision !== expectedRevision) {
      return err({
        kind: "conflict",
        expectedRevision,
        actualRevision: current.revision,
      });
    }
    const revision = (expectedRevision + 1) as WorkspaceRevision;
    this.database.projects.set(workspace.projectId, clone({ ...workspace, revision }));
    return ok({ revision });
  }

  async saveWorktable(
    projectId: ProjectId,
    draft: WorktableDraft,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>> {
    if (draft.projectId !== projectId) return err({ kind: "not-found", entity: "project", id: projectId });
    const current = this.database.projects.get(projectId);
    if (!current) return err({ kind: "not-found", entity: "project", id: projectId });
    return this.saveWorkspace({ ...current, worktableDraft: draft, updatedAt: new Date().toISOString() }, expectedRevision);
  }

  async createVersion(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    version: SequenceVersion,
  ): Promise<
    Result<{ readonly summary: VersionSummary; readonly revision: WorkspaceRevision }, VersionWriteError>
  > {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    const workspace = this.database.projects.get(projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
    if (workspace.revision !== expectedRevision) {
      return err({ kind: "conflict", expectedRevision, actualRevision: workspace.revision });
    }
    const validation = validateVersionForProject(projectId, version);
    if (!validation.ok) return err(validation.error);
    if (this.database.versions.has(version.id)) {
      return err({ kind: "version-id-exists", versionId: version.id });
    }

    const revision = (expectedRevision + 1) as WorkspaceRevision;
    const nextWorkspace = {
      ...workspace,
      versionIds: [...workspace.versionIds, version.id],
      revision,
      updatedAt: version.createdAt,
    };
    this.database.versions.set(version.id, clone(version));
    this.database.projects.set(projectId, clone(nextWorkspace));
    return ok({ summary: toVersionSummary(version), revision });
  }

  async saveSequenceVersion(
    input: SaveSequenceVersionInput,
  ): Promise<Result<{ readonly summary: VersionSummary; readonly workspaceRevision: WorkspaceRevision; readonly sequenceRevision: SequenceRevision }, SaveSequenceVersionError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    const workspace = this.database.projects.get(input.projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: input.projectId });
    if (workspace.revision !== input.expectedWorkspaceRevision) return err({ kind: "conflict", expectedRevision: input.expectedWorkspaceRevision, actualRevision: workspace.revision });
    const sequence = this.database.sequences.get(input.sequence.id);
    if (!sequence) return err({ kind: "not-found", entity: "sequence", id: input.sequence.id });
    if (sequence.projectId !== input.projectId || input.version.sequenceId !== sequence.id) return err({ kind: "version-sequence-mismatch" });
    if (sequence.revision !== input.expectedSequenceRevision) return err({ kind: "sequence-conflict", expectedRevision: input.expectedSequenceRevision, actualRevision: sequence.revision });
    const sequenceValidation = validateSequenceForProject(input.projectId, input.sequence);
    if (!sequenceValidation.ok) return sequenceValidation;
    const versionValidation = validateVersionForProject(input.projectId, input.version);
    if (!versionValidation.ok) return versionValidation;
    const existing = this.database.versions.get(input.version.id);
    if (input.mode === "overwrite") {
      if (!existing) return err({ kind: "version-not-found", versionId: input.version.id });
      if (existing.sequenceId !== sequence.id) return err({ kind: "version-sequence-mismatch" });
      if (existing.name !== input.version.name) return err({ kind: "version-name-immutable" });
    } else {
      if (existing) return err({ kind: "version-id-exists", versionId: input.version.id });
      if ([...this.database.versions.values()].some((version) => version.projectId === input.projectId && version.name.toLocaleLowerCase() === input.version.name.toLocaleLowerCase())) return err({ kind: "version-name-exists", name: input.version.name });
    }
    const updatedAt = input.version.updatedAt ?? new Date().toISOString();
    const savedVersion = clone({ ...input.version, updatedAt });
    const nextSequenceRevision = (input.expectedSequenceRevision + 1) as SequenceRevision;
    const savedSequence = clone({ ...input.sequence, currentVersionId: input.version.id, revision: nextSequenceRevision, updatedAt });
    const nextWorkspaceRevision = (input.expectedWorkspaceRevision + 1) as WorkspaceRevision;
    const nextWorkspace = clone({ ...workspace, revision: nextWorkspaceRevision, updatedAt, versionIds: input.mode === "save-as" ? [...workspace.versionIds, input.version.id] : workspace.versionIds });
    this.database.versions.set(input.version.id, savedVersion);
    this.database.sequences.set(sequence.id, savedSequence);
    this.database.projects.set(input.projectId, nextWorkspace);
    return ok({ summary: toVersionSummary(savedVersion), workspaceRevision: nextWorkspaceRevision, sequenceRevision: nextSequenceRevision });
  }

  async deleteVersion(projectId: ProjectId, versionId: VersionId, expectedWorkspaceRevision: WorkspaceRevision): Promise<Result<{ readonly revision: WorkspaceRevision }, DeleteVersionError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    const workspace = this.database.projects.get(projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
    if (workspace.revision !== expectedWorkspaceRevision) return err({ kind: "conflict", expectedRevision: expectedWorkspaceRevision, actualRevision: workspace.revision });
    const version = this.database.versions.get(versionId);
    if (!version || version.projectId !== projectId) return err({ kind: "version-not-found", versionId });
    const sequence = this.database.sequences.get(version.sequenceId);
    if (sequence?.currentVersionId === versionId) return err({ kind: "cannot-delete-current-version", versionId });
    const revision = (expectedWorkspaceRevision + 1) as WorkspaceRevision;
    this.database.versions.delete(versionId);
    this.database.projects.set(projectId, clone({ ...workspace, versionIds: workspace.versionIds.filter((id) => id !== versionId), revision, updatedAt: new Date().toISOString() }));
    return ok({ revision });
  }

  async createSequence(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    sequence: SequenceDocument,
    initialVersion: SequenceVersion,
    worktableDraft: WorktableDraft,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: WorkspaceRevision }, SequenceWriteError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    const workspace = this.database.projects.get(projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
    if (workspace.revision !== expectedRevision) return err({ kind: "conflict", expectedRevision, actualRevision: workspace.revision });
    const validation = validateSequenceForProject(projectId, sequence);
    if (!validation.ok) return validation;
    const versionValidation = validateVersionForProject(projectId, initialVersion);
    if (!versionValidation.ok || initialVersion.sequenceId !== sequence.id || initialVersion.id !== sequence.currentVersionId) return err({ kind: "invalid-sequence", reason: "Initial version does not match Sequence." });
    if (this.database.sequences.has(sequence.id)) return err({ kind: "sequence-id-exists", sequenceId: sequence.id });
    if (this.database.versions.has(initialVersion.id)) return err({ kind: "invalid-sequence", reason: "Initial version already exists." });
    if ([...this.database.sequences.values()].some((item) => item.projectId === projectId && item.name.toLocaleLowerCase() === sequence.name.toLocaleLowerCase())) {
      return err({ kind: "sequence-name-exists", name: sequence.name });
    }
    const revision = (expectedRevision + 1) as WorkspaceRevision;
    this.database.sequences.set(sequence.id, clone(sequence));
    this.database.versions.set(initialVersion.id, clone(initialVersion));
    this.database.projects.set(projectId, clone({ ...workspace, worktableDraft, sequenceIds: [...workspace.sequenceIds, sequence.id], versionIds: [...workspace.versionIds, initialVersion.id], revision, updatedAt: sequence.updatedAt }));
    return ok({ summary: toSequenceSummary(sequence), revision });
  }

  async listSequences(projectId: ProjectId): Promise<Result<readonly SequenceSummary[], LoadError>> {
    const loaded = await this.loadWorkspace(projectId);
    if (!loaded.ok) return loaded;
    const summaries: SequenceSummary[] = [];
    for (const sequenceId of loaded.value.sequenceIds) {
      const sequence = this.database.sequences.get(sequenceId);
      if (!sequence) return err({ kind: "corrupt-data", entityId: sequenceId });
      summaries.push(toSequenceSummary(sequence));
    }
    return ok(summaries);
  }

  async loadSequence(sequenceId: SequenceId): Promise<Result<SequenceDocument, LoadError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    const sequence = this.database.sequences.get(sequenceId);
    return sequence ? ok(clone(sequence)) : err({ kind: "not-found", entity: "sequence", id: sequenceId });
  }

  async saveSequence(
    sequence: SequenceDocument,
    expectedRevision: SequenceRevision,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: SequenceRevision }, SequenceWriteError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.options.quotaExceeded) return err({ kind: "quota-exceeded" });
    const current = this.database.sequences.get(sequence.id);
    if (!current) return err({ kind: "not-found", entity: "sequence", id: sequence.id });
    if (current.revision !== expectedRevision) return err({ kind: "sequence-conflict", expectedRevision, actualRevision: current.revision });
    const validation = validateSequenceForProject(sequence.projectId, sequence);
    if (!validation.ok) return validation;
    if ([...this.database.sequences.values()].some((item) => item.id !== sequence.id && item.projectId === sequence.projectId && item.name.toLocaleLowerCase() === sequence.name.toLocaleLowerCase())) {
      return err({ kind: "sequence-name-exists", name: sequence.name });
    }
    const revision = (expectedRevision + 1) as SequenceRevision;
    const saved = { ...sequence, revision };
    this.database.sequences.set(sequence.id, clone(saved));
    return ok({ summary: toSequenceSummary(saved), revision });
  }

  async listVersions(projectId: ProjectId): Promise<Result<readonly VersionSummary[], LoadError>> {
    const loaded = await this.loadWorkspace(projectId);
    if (!loaded.ok) return loaded;
    const versions: VersionSummary[] = [];
    for (const versionId of loaded.value.versionIds) {
      const version = this.database.versions.get(versionId);
      if (!version) return err({ kind: "corrupt-data", entityId: versionId });
      versions.push(toVersionSummary(version));
    }
    return ok(versions);
  }

  async loadVersion(versionId: VersionId): Promise<Result<SequenceVersion, LoadError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    const version = this.database.versions.get(versionId);
    if (!version) return err({ kind: "not-found", entity: "version", id: versionId });
    return ok(clone(version));
  }

  async deleteProject(projectId: ProjectId): Promise<Result<void, DeleteError>> {
    if (this.options.unavailable) return err({ kind: "unavailable", retryable: true });
    if (this.database.corruptProjectIds.has(projectId)) {
      return err({ kind: "corrupt-data", entityId: projectId });
    }
    const workspace = this.database.projects.get(projectId);
    if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
    for (const versionId of workspace.versionIds) this.database.versions.delete(versionId);
    for (const sequenceId of workspace.sequenceIds) this.database.sequences.delete(sequenceId);
    this.database.projects.delete(projectId);
    this.database.corruptProjectIds.delete(projectId);
    return ok(undefined);
  }

  async exportBackup(projectId: ProjectId): Promise<Result<Uint8Array, LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const versions: SequenceVersion[] = [];
    const sequences: SequenceDocument[] = [];
    for (const versionId of workspace.value.versionIds) {
      const loaded = await this.loadVersion(versionId);
      if (!loaded.ok) return loaded;
      versions.push(loaded.value);
    }
    for (const sequenceId of workspace.value.sequenceIds) {
      const loaded = await this.loadSequence(sequenceId);
      if (!loaded.ok) return loaded;
      sequences.push(loaded.value);
    }
    return ok(new TextEncoder().encode(JSON.stringify(createBackup(workspace.value, versions, sequences))));
  }

  async importBackup(_bytes: Uint8Array): Promise<Result<ProjectId, BackupError>> {
    return err({ kind: "unavailable", retryable: false });
  }
}
