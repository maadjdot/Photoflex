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
import { createEmptyWorktable, migratePoolToWorktable } from "../modules/worktable";

export function createWorkspace(input: CreateProjectInput): ProjectWorkspace {
  const createdAt = input.createdAt;
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    projectId: input.id,
    name: input.name,
    memo: input.memo ?? "",
    expectedPhotoCount: input.expectedPhotoCount ?? null,
    sources: input.initialSource ? [input.initialSource] : [],
    photoStates: {},
    worktableDraft: createEmptyWorktable(input.id),
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
    tableCount: workspace.worktableDraft.entryOrder.length,
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
      (resume.page === "project" || resume.page === "contact-sheet" || resume.page === "table") &&
      resume.filter === "all" &&
      (resume.sourceId === undefined || typeof resume.sourceId === "string") &&
      (resume.anchorPhotoId === undefined || typeof resume.anchorPhotoId === "string") &&
      (resume.tableViewport === undefined || isViewport(resume.tableViewport))
    );
  };

  const isPlacement = (placement: unknown): boolean => {
    if (!placement || typeof placement !== "object") return false;
    const item = placement as Record<string, unknown>;
    return (
      typeof item.photoId === "string" &&
      [item.x, item.y, item.z].every((value) => typeof value === "number" && Number.isFinite(value)) &&
      [item.width, item.height].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0) &&
      typeof item.filename === "string"
    );
  };
  const isWorktable = (draft: unknown): boolean => {
    if (!draft || typeof draft !== "object") return false;
    const table = draft as ProjectWorkspace["worktableDraft"];
    if (table.projectId !== workspace.projectId || !Array.isArray(table.entryOrder)) return false;
    if (!table.placements || typeof table.placements !== "object") return false;
    const isRelation = (relation: unknown, minimum: number, maximum = Number.POSITIVE_INFINITY): boolean => {
      if (!relation || typeof relation !== "object") return false;
      const value = relation as Record<string, unknown>;
      return typeof value.id === "string" && typeof value.name === "string" && Array.isArray(value.photoIds)
        && value.photoIds.length >= minimum && value.photoIds.length <= maximum
        && new Set(value.photoIds).size === value.photoIds.length
        && value.photoIds.every((photoId) => typeof photoId === "string" && table.entryOrder.some((entryId) => entryId === photoId));
    };
    if (!Array.isArray(table.groups) || !table.groups.every((group) => isRelation(group, 2))) return false;
    if (!Array.isArray(table.links) || !table.links.every((link) => isRelation(link, 2, 6))) return false;
    if (new Set(table.entryOrder).size !== table.entryOrder.length) return false;
    if (!table.entryOrder.every((photoId) => typeof photoId === "string" && isPlacement(table.placements[photoId as keyof typeof table.placements]))) return false;
    const entryIds = new Set<string>(table.entryOrder);
    return Object.entries(table.placements).length === entryIds.size
      && Object.entries(table.placements).every(([photoId, placement]) => entryIds.has(photoId) && photoId === placement.photoId && isPlacement(placement));
  };
  const isPhotoStates = (states: unknown): boolean => {
    if (!states || typeof states !== "object" || Array.isArray(states)) return false;
    return Object.values(states).every((state) => {
      if (!state || typeof state !== "object") return false;
      const value = state as Record<string, unknown>;
      return ["unreviewed", "pick", "reject"].includes(String(value.decision)) && typeof value.pinned === "boolean";
    });
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
    isPhotoStates(workspace.photoStates) &&
    isWorktable(workspace.worktableDraft) &&
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

export function migrateWorkspaceV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  const projectId = value.projectId as ProjectWorkspace["projectId"];
  const poolPhotoIds = Array.isArray(value.poolPhotoIds)
    ? value.poolPhotoIds.filter((photoId): photoId is ProjectWorkspace["worktableDraft"]["entryOrder"][number] => typeof photoId === "string")
    : [];
  const sources = Array.isArray(value.sources)
    ? value.sources.map((source) => {
        if (!source || typeof source !== "object") return source;
        const oldSource = source as Record<string, unknown>;
        const nextSource = { ...oldSource };
        delete nextSource.status;
        nextSource.createdAt = typeof oldSource.createdAt === "string" ? oldSource.createdAt : value.createdAt;
        return nextSource;
      })
    : [];
  const migrated: Record<string, unknown> = {
    ...value,
    schemaVersion: 3,
    memo: typeof value.memo === "string" ? value.memo : "",
    expectedPhotoCount: value.expectedPhotoCount ?? null,
    sources,
    lastOpenedAt: typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : value.updatedAt,
    photoStates: {},
    worktableDraft: migratePoolToWorktable(projectId, poolPhotoIds),
  };
  delete migrated.poolPhotoIds;
  if (migrated.resumeContext && typeof migrated.resumeContext === "object") {
    const resumeContext = { ...(migrated.resumeContext as Record<string, unknown>) };
    delete resumeContext.poolCollapsed;
    migrated.resumeContext = resumeContext;
  }
  return migrated;
}

export function migrateWorkspaceV3ToV4(value: Record<string, unknown>): Record<string, unknown> {
  const table = value.worktableDraft && typeof value.worktableDraft === "object"
    ? value.worktableDraft as Record<string, unknown>
    : undefined;
  return {
    ...value,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    worktableDraft: table ? { ...table, groups: Array.isArray(table.groups) ? table.groups : [], links: Array.isArray(table.links) ? table.links : [] } : table,
  };
}

function isViewport(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Record<string, unknown>;
  return [viewport.originX, viewport.originY, viewport.zoom].every(
    (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
  ) && typeof viewport.zoom === "number" && viewport.zoom > 0;
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
