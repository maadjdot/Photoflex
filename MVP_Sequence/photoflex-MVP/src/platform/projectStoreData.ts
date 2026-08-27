import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  err,
  MVP_SEQUENCE_ITEM_LIMIT,
  ok,
  WORKSPACE_SCHEMA_VERSION,
  type CreateProjectInput,
  type ProjectBackupV1,
  type ProjectSummary,
  type ProjectWorkspace,
  type Result,
  type SequenceItem,
  type SourceRecord,
  type SequenceVersion,
  type VersionSummary,
  type WorkspaceRevision,
} from "../contracts";

export function createWorkspace(input: CreateProjectInput): ProjectWorkspace {
  const createdAt = input.createdAt;
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    projectId: input.id,
    name: input.name,
    memo: input.memo ?? "",
    expectedPhotoCount: input.expectedPhotoCount ?? null,
    sources: input.initialSource ? [input.initialSource] : [],
    poolPhotoIds: [],
    sequenceDraft: { projectId: input.id, items: [] },
    versionIds: [],
    revision: 0 as WorkspaceRevision,
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: createdAt,
  };
}

export const clone = <T>(value: T): T => structuredClone(value);

export type VersionProjectValidationError = {
  readonly kind: "invalid-version";
  readonly reason: string;
};

export function validateVersionForProject(
  projectId: ProjectWorkspace["projectId"],
  version: SequenceVersion,
): Result<true, VersionProjectValidationError> {
  if (version.projectId !== projectId) {
    return err({ kind: "invalid-version", reason: "版本不属于当前项目。" });
  }
  if (version.items.length > MVP_SEQUENCE_ITEM_LIMIT) {
    return err({ kind: "invalid-version", reason: `版本超过 ${MVP_SEQUENCE_ITEM_LIMIT} 项。` });
  }
  return ok(true);
}

export function toProjectSummary(workspace: ProjectWorkspace): ProjectSummary {
  return {
    id: workspace.projectId,
    name: workspace.name,
    updatedAt: workspace.updatedAt,
    lastOpenedAt: workspace.lastOpenedAt,
    sourceCount: workspace.sources.filter((source) => !source.removedAt).length,
    poolCount: workspace.poolPhotoIds.length,
    coverPhotoId: workspace.coverPhotoId,
  };
}

export function toVersionSummary(version: SequenceVersion): VersionSummary {
  const { id, projectId, parentVersionId, name, itemCount, createdAt } = version;
  return { id, projectId, parentVersionId, name, itemCount, createdAt };
}

export function isWorkspace(value: unknown): value is ProjectWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<ProjectWorkspace>;
  const sequenceDraft = workspace.sequenceDraft;
  const isSourceRecord = (source: unknown): source is SourceRecord => {
    if (!source || typeof source !== "object") return false;
    const record = source as Partial<SourceRecord>;
    return (
      typeof record.id === "string" &&
      typeof record.displayName === "string" &&
      typeof record.createdAt === "string" &&
      (record.removedAt === undefined || typeof record.removedAt === "string")
    );
  };
  const isSequenceItem = (item: unknown): item is SequenceItem => {
    if (!item || typeof item !== "object") return false;
    const sequenceItem = item as Partial<SequenceItem>;
    return typeof sequenceItem.id === "string" && typeof sequenceItem.photoId === "string";
  };

  const isResumeContext = (context: unknown): context is ProjectWorkspace["resumeContext"] => {
    if (context === undefined) return true;
    if (!context || typeof context !== "object") return false;
    const resume = context as NonNullable<ProjectWorkspace["resumeContext"]>;
    return (
      (resume.page === "project" || resume.page === "contact-sheet") &&
      resume.filter === "all" &&
      (resume.sourceId === undefined || typeof resume.sourceId === "string") &&
      (resume.anchorPhotoId === undefined || typeof resume.anchorPhotoId === "string") &&
      (resume.poolCollapsed === undefined || typeof resume.poolCollapsed === "boolean")
    );
  };

  return (
    workspace.schemaVersion === WORKSPACE_SCHEMA_VERSION &&
    typeof workspace.projectId === "string" &&
    typeof workspace.name === "string" &&
    typeof workspace.memo === "string" &&
    (workspace.expectedPhotoCount === null ||
      (typeof workspace.expectedPhotoCount === "number" &&
        Number.isInteger(workspace.expectedPhotoCount) &&
        workspace.expectedPhotoCount > 0)) &&
    Array.isArray(workspace.sources) &&
    workspace.sources.every(isSourceRecord) &&
    Array.isArray(workspace.poolPhotoIds) &&
    workspace.poolPhotoIds.every((photoId) => typeof photoId === "string") &&
    Array.isArray(workspace.versionIds) &&
    workspace.versionIds.every((versionId) => typeof versionId === "string") &&
    typeof workspace.revision === "number" &&
    Number.isInteger(workspace.revision) &&
    workspace.revision >= 0 &&
    typeof sequenceDraft === "object" &&
    sequenceDraft !== null &&
    sequenceDraft.projectId === workspace.projectId &&
    (sequenceDraft.baseVersionId === undefined || typeof sequenceDraft.baseVersionId === "string") &&
    Array.isArray(sequenceDraft.items) &&
    sequenceDraft.items.every(isSequenceItem) &&
    typeof workspace.createdAt === "string" &&
    typeof workspace.updatedAt === "string" &&
    typeof workspace.lastOpenedAt === "string" &&
    (workspace.coverPhotoId === undefined || typeof workspace.coverPhotoId === "string") &&
    isResumeContext(workspace.resumeContext)
  );
}

export function createBackup(
  workspace: ProjectWorkspace,
  versions: readonly SequenceVersion[],
): ProjectBackupV1 {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: "0.1.0",
    project: workspace,
    versions,
    photoManifest: [],
  };
}
