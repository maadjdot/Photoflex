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
  type PhotoId,
  type Result,
  type SequenceItem,
  type SequenceItemId,
  type ReadingUnitId,
  type SequenceDocument,
  type SequenceId,
  type SequenceRevision,
  type SourceRecord,
  type SequenceVersion,
  type VersionSummary,
  type VersionId,
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
    sequenceIds: [],
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
  if (!version.sequenceId || !version.name.trim() || version.itemCount !== version.items.length || !isSequenceContent(version)) {
    return err({ kind: "invalid-version", reason: "版本内容无效。" });
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
  const { id, projectId, sequenceId, parentVersionId, name, itemCount, createdAt } = version;
  return { id, projectId, sequenceId, parentVersionId, name, itemCount, createdAt, updatedAt: version.updatedAt ?? createdAt };
}

export function isWorkspace(value: unknown): value is ProjectWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<ProjectWorkspace>;
  const isSourceRecord = (source: unknown): source is SourceRecord => {
    if (!source || typeof source !== "object") return false;
    const record = source as Partial<SourceRecord>;
    return (
      typeof record.id === "string" &&
      typeof record.displayName === "string" &&
      typeof record.createdAt === "string" &&
      (record.removedAt === undefined || typeof record.removedAt === "string") &&
      (record.kind === undefined || record.kind === "folder" || record.kind === "external-files")
    );
  };
  const isResumeContext = (context: unknown): context is ProjectWorkspace["resumeContext"] => {
    if (context === undefined) return true;
    if (!context || typeof context !== "object") return false;
    const resume = context as NonNullable<ProjectWorkspace["resumeContext"]>;
    return (
      (["project", "contact-sheet", "table", "sequence", "sequence-compare"] as const).includes(resume.page) &&
      resume.filter === "all" &&
      (resume.sourceId === undefined || typeof resume.sourceId === "string") &&
      (resume.anchorPhotoId === undefined || typeof resume.anchorPhotoId === "string") &&
      (resume.tableViewport === undefined || isViewport(resume.tableViewport)) &&
      (resume.sequenceId === undefined || typeof resume.sequenceId === "string") &&
      (resume.compareSequenceIds === undefined || (Array.isArray(resume.compareSequenceIds) && resume.compareSequenceIds.length === 2 && resume.compareSequenceIds.every((id) => typeof id === "string")))
    );
  };

  const isPlacement = (placement: unknown): boolean => {
    if (!placement || typeof placement !== "object") return false;
    const item = placement as Record<string, unknown>;
    return (
      typeof item.photoId === "string" &&
      (item.id === undefined || typeof item.id === "string") &&
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
    if (table.memos !== undefined) {
      if (!Array.isArray(table.memos) || new Set(table.memos.map((memo) => memo?.id)).size !== table.memos.length) return false;
      if (!table.memos.every((memo) => memo && typeof memo.id === "string" && memo.id.length > 0 && typeof memo.text === "string"
        && [memo.x, memo.y, memo.width, memo.height, memo.fontSize, ...(memo.z === undefined ? [] : [memo.z])].every((value) => typeof value === "number" && Number.isFinite(value))
        && memo.width >= 120 && memo.height >= 80 && memo.fontSize >= 10 && memo.fontSize <= 72
        && Array.isArray(memo.photoIds) && new Set(memo.photoIds).size === memo.photoIds.length && memo.photoIds.every((id: unknown) => typeof id === "string" && table.entryOrder.includes(id as ProjectWorkspace["worktableDraft"]["entryOrder"][number])))) return false;
    }
    if (!Array.isArray(table.groups) || !table.groups.every((group) => isRelation(group, 2))) return false;
    if (!Array.isArray(table.links) || !table.links.every((link) => isRelation(link, 2, 6))) return false;
    if (!Array.isArray(table.pileOrder) || new Set(table.pileOrder).size !== table.pileOrder.length) return false;
    if (!table.pilePlacements || typeof table.pilePlacements !== "object") return false;
    if (!table.pileOrder.every((sequenceId) => {
      const placement = table.pilePlacements[sequenceId];
      return typeof sequenceId === "string" && placement?.sequenceId === sequenceId
        && [placement.x, placement.y, placement.z, placement.width, placement.height].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
        && placement.width > 0 && placement.height > 0;
    })) return false;
    if (new Set(table.entryOrder).size !== table.entryOrder.length) return false;
    if (!table.entryOrder.every((photoId) => typeof photoId === "string" && isPlacement(table.placements[photoId as keyof typeof table.placements]))) return false;
    const entryIds = new Set<string>(table.entryOrder);
    return Object.entries(table.placements).length === entryIds.size
      && Object.entries(table.placements).every(([itemId, placement]) => entryIds.has(itemId) && ((placement.id ?? placement.photoId) === itemId) && isPlacement(placement));
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
    Array.isArray(workspace.sequenceIds) &&
    workspace.sequenceIds.every((sequenceId) => typeof sequenceId === "string") &&
    new Set(workspace.sequenceIds).size === workspace.sequenceIds.length &&
    workspace.worktableDraft?.pileOrder.every((sequenceId) => workspace.sequenceIds?.includes(sequenceId)) === true &&
    Array.isArray(workspace.versionIds) &&
    workspace.versionIds.every((versionId) => typeof versionId === "string") &&
    typeof workspace.revision === "number" &&
    Number.isInteger(workspace.revision) &&
    workspace.revision >= 0 &&
    typeof workspace.createdAt === "string" &&
    typeof workspace.updatedAt === "string" &&
    typeof workspace.lastOpenedAt === "string" &&
    (workspace.deletionPendingAt === undefined || typeof workspace.deletionPendingAt === "string") &&
    (workspace.coverPhotoId === undefined || typeof workspace.coverPhotoId === "string") &&
    isResumeContext(workspace.resumeContext)
  );
}

export function validateSequenceForProject(
  projectId: ProjectWorkspace["projectId"],
  sequence: SequenceDocument,
): Result<true, { readonly kind: "invalid-sequence"; readonly reason: string }> {
  if (sequence.projectId !== projectId) return err({ kind: "invalid-sequence", reason: "Sequence does not belong to this project." });
  if (!isSequenceDocument(sequence)) return err({ kind: "invalid-sequence", reason: "Sequence data is invalid." });
  if (!sequence.items.length) return err({ kind: "invalid-sequence", reason: "Sequence must contain at least one photo." });
  return ok(true);
}

export function migrateWorkspaceV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  const projectId = value.projectId as ProjectWorkspace["projectId"];
  const poolPhotoIds = Array.isArray(value.poolPhotoIds)
    ? value.poolPhotoIds.filter((photoId): photoId is PhotoId => typeof photoId === "string")
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
    schemaVersion: 4,
    worktableDraft: table ? { ...table, groups: Array.isArray(table.groups) ? table.groups : [], links: Array.isArray(table.links) ? table.links : [] } : table,
  };
}

export function migrateWorkspaceV4ToV5(value: Record<string, unknown>): Record<string, unknown> {
  const projectId = String(value.projectId) as ProjectWorkspace["projectId"];
  const legacy = legacySequenceFromWorkspace(value);
  const table = value.worktableDraft && typeof value.worktableDraft === "object"
    ? value.worktableDraft as Record<string, unknown>
    : createEmptyWorktable(projectId) as unknown as Record<string, unknown>;
  const pileOrder = legacy ? [legacy.id] : [];
  const migrated: Record<string, unknown> = {
    ...value,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    sequenceIds: pileOrder,
    worktableDraft: {
      ...table,
      groups: Array.isArray(table.groups) ? table.groups : [],
      links: Array.isArray(table.links) ? table.links : [],
      pileOrder,
      pilePlacements: legacy ? {
        [legacy.id]: { sequenceId: legacy.id, x: 64, y: 336, z: 1000, width: 184, height: 112 },
      } : {},
    },
  };
  delete migrated.sequenceDraft;
  return migrated;
}

export function migrateWorkspaceV7ToV8(value: Record<string, unknown>): Record<string, unknown> {
  const table = value.worktableDraft && typeof value.worktableDraft === "object"
    ? value.worktableDraft as Record<string, unknown>
    : undefined;
  const placements = table?.placements && typeof table.placements === "object"
    ? Object.fromEntries(Object.entries(table.placements as Record<string, Record<string, unknown>>).map(([id, placement]) => [id, { ...placement, id }]))
    : table?.placements;
  const sources = Array.isArray(value.sources)
    ? value.sources.map((source) => source && typeof source === "object" ? { kind: "folder", ...(source as Record<string, unknown>) } : source)
    : value.sources;
  return { ...value, schemaVersion: WORKSPACE_SCHEMA_VERSION, sources, worktableDraft: table ? { ...table, placements } : table };
}

export function legacySequenceFromWorkspace(value: Record<string, unknown>): SequenceDocument | undefined {
  const draft = value.sequenceDraft;
  if (!draft || typeof draft !== "object") return undefined;
  const items = Array.isArray((draft as Record<string, unknown>).items)
    ? ((draft as Record<string, unknown>).items as Array<Record<string, unknown>>).flatMap((item) =>
        item && typeof item.id === "string" && typeof item.photoId === "string"
          ? [{ id: item.id as SequenceItemId, kind: "photo" as const, photoId: item.photoId as PhotoId }]
          : [],
      )
    : [];
  if (!items.length) return undefined;
  const projectId = String(value.projectId) as ProjectWorkspace["projectId"];
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString();
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;
  return {
    id: `sequence-${projectId}-legacy` as SequenceId,
    projectId,
    name: "Sequence 01",
    items,
    segments: [],
    readingUnits: items.map((item) => ({ id: `unit-${item.id}` as ReadingUnitId, kind: "single", itemId: item.id })),
    currentVersionId: `version-sequence-${projectId}-legacy-initial` as VersionId,
    revision: 0 as SequenceRevision,
    createdAt,
    updatedAt,
  };
}

export function isSequenceDocument(value: unknown): value is SequenceDocument {
  if (!value || typeof value !== "object") return false;
  const sequence = value as Partial<SequenceDocument>;
  return typeof sequence.id === "string" && typeof sequence.projectId === "string"
    && typeof sequence.name === "string" && Boolean(sequence.name.trim())
    && isSequenceContent(sequence)
    && typeof sequence.currentVersionId === "string"
    && typeof sequence.revision === "number" && Number.isInteger(sequence.revision) && sequence.revision >= 0
    && typeof sequence.createdAt === "string" && typeof sequence.updatedAt === "string";
}

export function upgradeSequenceDocument(value: Record<string, unknown>): SequenceDocument | undefined {
  if (typeof value.id !== "string" || typeof value.projectId !== "string" || typeof value.name !== "string" || !Array.isArray(value.items)) return undefined;
  const items: SequenceItem[] = [];
  for (const raw of value.items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string") continue;
    if (item.kind === "blank") items.push({ id: item.id as SequenceItemId, kind: "blank" });
    else if (item.kind === "text" && typeof item.text === "string") items.push({ id: item.id as SequenceItemId, kind: "text", text: item.text, fontSize: normalizeTextFontSize(item.fontSize), ...(typeof item.html === "string" && item.html ? { html: item.html } : {}) });
    else if (typeof item.photoId === "string") items.push({ id: item.id as SequenceItemId, kind: "photo", photoId: item.photoId as PhotoId });
  }
  const candidate = {
    ...value,
    id: value.id as SequenceId,
    items,
    segments: Array.isArray(value.segments) ? value.segments : [],
    readingUnits: Array.isArray(value.readingUnits) ? value.readingUnits : items.map((item) => ({ id: `unit-${item.id}` as ReadingUnitId, kind: item.kind === "blank" ? "blank" as const : "single" as const, itemId: item.id })),
    currentVersionId: (typeof value.currentVersionId === "string" ? value.currentVersionId : `version-${value.id}-initial`) as VersionId,
  } as unknown as SequenceDocument;
  return isSequenceDocument(candidate) ? candidate : undefined;
}

export function createInitialVersion(sequence: SequenceDocument): SequenceVersion {
  return {
    id: sequence.currentVersionId,
    projectId: sequence.projectId,
    sequenceId: sequence.id,
    name: `Initial · ${sequence.name}`,
    itemCount: sequence.items.length,
    items: sequence.items.map((item) => ({ ...item })),
    segments: sequence.segments.map((segment) => ({ ...segment, itemIds: [...segment.itemIds] })),
    readingUnits: sequence.readingUnits.map((unit) => ({ ...unit })),
    createdAt: sequence.createdAt,
    updatedAt: sequence.createdAt,
  };
}

function isSequenceContent(value: Partial<SequenceDocument> | SequenceVersion): boolean {
  if (!Array.isArray(value.items) || value.items.length > MVP_SEQUENCE_ITEM_LIMIT) return false;
  if (!value.items.every((item) => item && typeof item.id === "string" && (item.kind === "blank" || (item.kind === "text" && typeof item.text === "string" && (item.html === undefined || typeof item.html === "string") && Number.isInteger(item.fontSize) && item.fontSize >= 12 && item.fontSize <= 120) || (item.kind === "photo" && typeof item.photoId === "string")))) return false;
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length) return false;
  if (!Array.isArray(value.segments) || !Array.isArray(value.readingUnits)) return false;
  const ids = new Set(value.items.map((item) => item.id));
  const segments = value.segments as SequenceDocument["segments"];
  const units = value.readingUnits as SequenceDocument["readingUnits"];
  if (!segments.every((segment) => typeof segment.id === "string" && Boolean(segment.name.trim()) && segment.itemIds.every((id: SequenceItemId) => ids.has(id)))) return false;
  const occupied = new Set<SequenceItemId>();
  for (const segment of segments) {
    const indices = segment.itemIds.map((id) => value.items!.findIndex((item) => item.id === id)).sort((a, b) => a - b);
    if (indices.some((index, position) => position > 0 && index !== indices[position - 1] + 1)) return false;
    for (const id of segment.itemIds) { if (occupied.has(id)) return false; occupied.add(id); }
  }
  const unitItems: SequenceItemId[] = [];
  for (const unit of units) {
    if (typeof unit.id !== "string") return false;
    const members = unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId];
    if (!members.every((id) => ids.has(id))) return false;
    if (unit.kind === "spread") {
      const left = value.items!.findIndex((item) => item.id === unit.leftItemId), right = value.items!.findIndex((item) => item.id === unit.rightItemId);
      if (right !== left + 1 || value.items![left]?.kind !== "photo" || value.items![right]?.kind !== "photo") return false;
    }
    unitItems.push(...members);
  }
  return unitItems.length === value.items.length && new Set(unitItems).size === value.items.length;
}

function isViewport(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Record<string, unknown>;
  return [viewport.originX, viewport.originY, viewport.zoom].every(
    (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
  ) && typeof viewport.zoom === "number" && viewport.zoom > 0;
}

function normalizeTextFontSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(12, Math.min(120, value))) : 32;
}

export function createBackup(
  workspace: ProjectWorkspace,
  versions: readonly SequenceVersion[],
  sequences: readonly SequenceDocument[],
): ProjectBackupV1 {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: "0.1.0",
    project: workspace,
    versions,
    sequences,
    photoManifest: [],
  };
}
