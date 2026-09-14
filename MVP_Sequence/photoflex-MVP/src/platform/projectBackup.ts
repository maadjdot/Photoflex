import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, err, ok, type BackupError, type PhotoId, type PhotoRef, type ProjectBackupV1, type ProjectId, type Result, type SequenceId, type SourceId, type VersionId, type WorkspaceRevision, type SequenceRevision, type WorktableItemId } from "../contracts";
import { isWorkspace, migrateWorkspaceV7ToV8, validateSequenceForProject, validateVersionForProject } from "./projectStoreData";

/** Validate before touching storage; every import is an independent project. */
export function prepareBackupImport(bytes: Uint8Array): Result<{ backup: ProjectBackupV1; photos: PhotoRef[] }, BackupError> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ProjectBackupV1;
    if (parsed?.format !== BACKUP_FORMAT) throw new Error("This is not a PhotoFlex project backup.");
    if (parsed.schemaVersion !== 2 && parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) return err({ kind: "unsupported-schema", found: parsed.schemaVersion, supported: [2, BACKUP_SCHEMA_VERSION] });
    const project = Number(parsed.project?.schemaVersion) < 8
      ? migrateWorkspaceV7ToV8(parsed.project as unknown as Record<string, unknown>) as unknown as ProjectBackupV1["project"]
      : parsed.project;
    const input = { ...parsed, schemaVersion: BACKUP_SCHEMA_VERSION, project } as ProjectBackupV1;
    if (!isWorkspace(input.project) || !Array.isArray(input.sequences) || !Array.isArray(input.versions) || !Array.isArray(input.photoManifest)) throw new Error("The project backup is incomplete.");
    const normalizedProject = input.project;
    const unique = (ids: readonly string[]) => ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
    const sequenceIds = input.sequences.map((s) => s.id);
    const versionIds = input.versions.map((v) => v.id);
    const sources = new Set(normalizedProject.sources.map((s) => s.id));
    if (!unique(sequenceIds) || !unique(versionIds) || !unique(normalizedProject.sources.map((s) => s.id)) || !unique(normalizedProject.sequenceIds) || !unique(normalizedProject.versionIds)) throw new Error("Duplicate identifiers in backup.");
    if (sequenceIds.length !== normalizedProject.sequenceIds.length || versionIds.length !== normalizedProject.versionIds.length || normalizedProject.sequenceIds.some((id) => !sequenceIds.includes(id)) || normalizedProject.versionIds.some((id) => !versionIds.includes(id))) throw new Error("Missing project documents.");
    for (const sequence of input.sequences) {
      if (!validateSequenceForProject(normalizedProject.projectId, sequence).ok || !input.versions.some((v) => v.id === sequence.currentVersionId && v.sequenceId === sequence.id)) throw new Error("Invalid Sequence or current version.");
    }
    for (const version of input.versions) {
      if (!validateVersionForProject(normalizedProject.projectId, version).ok || !sequenceIds.includes(version.sequenceId) || (version.parentVersionId && !input.versions.some((v) => v.id === version.parentVersionId && v.sequenceId === version.sequenceId))) throw new Error("Invalid version reference.");
    }
    if (normalizedProject.worktableDraft.pileOrder.some((id) => !sequenceIds.includes(id))) throw new Error("Missing Table Sequence.");
    if (!unique(input.photoManifest.map((p) => p.photoId)) || !unique(input.photoManifest.map((p) => JSON.stringify([p.sourceId, p.relativePath])))) throw new Error("Duplicate photo entries.");
    for (const photo of input.photoManifest) {
      if (!sources.has(photo.sourceId) || typeof photo.relativePath !== "string" || !photo.relativePath || photo.relativePath.split(/[\\/]/).some((part: string) => !part || part === "." || part === "..") || photo.relativePath.includes(":")) throw new Error("Invalid photo path or source.");
      if ([photo.width, photo.height, photo.fileSize, photo.fileLastModified].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) throw new Error("Invalid photo metadata.");
    }
    const remap = <T extends string>() => {
      const ids = new Map<T, T>();
      return (id: T): T => { if (!ids.has(id)) ids.set(id, crypto.randomUUID() as T); return ids.get(id)!; };
    };
    const photoId = remap<PhotoId>(), itemId = remap<WorktableItemId>(), sourceId = remap<SourceId>(), sequenceId = remap<SequenceId>(), versionId = remap<VersionId>();
    const projectId = crypto.randomUUID() as ProjectId;
    const draft = normalizedProject.worktableDraft;
    const manifest = input.photoManifest.map((p) => ({ ...p, photoId: photoId(p.photoId), sourceId: sourceId(p.sourceId) }));
    const content = <T extends ProjectBackupV1["sequences"][number] | ProjectBackupV1["versions"][number]>(document: T) => ({ ...document, projectId, items: document.items.map((item) => item.kind === "photo" ? { ...item, photoId: photoId(item.photoId) } : item) });
    const backup: ProjectBackupV1 = {
      ...input,
      project: {
        ...normalizedProject, projectId, name: `${normalizedProject.name} (restored)`, revision: 0 as WorkspaceRevision, deletionPendingAt: undefined,
        sources: normalizedProject.sources.map((s) => ({ ...s, id: sourceId(s.id) })),
        sequenceIds: normalizedProject.sequenceIds.map(sequenceId), versionIds: normalizedProject.versionIds.map(versionId),
        coverPhotoId: normalizedProject.coverPhotoId ? photoId(normalizedProject.coverPhotoId) : undefined,
        photoStates: Object.fromEntries(Object.entries(normalizedProject.photoStates).map(([id, state]) => [photoId(id as PhotoId), state])),
        resumeContext: undefined,
        worktableDraft: {
          ...draft, projectId, entryOrder: draft.entryOrder.map(itemId),
          placements: Object.fromEntries(Object.entries(draft.placements).map(([id, p]) => {
            const nextId = itemId(id as WorktableItemId);
            return [nextId, { ...p, id: nextId, photoId: photoId(p.photoId) }];
          })),
          groups: draft.groups.map((g) => ({ ...g, photoIds: g.photoIds.map(itemId) })),
          links: draft.links.map((g) => ({ ...g, photoIds: g.photoIds.map(itemId) })),
          memos: draft.memos?.map((m) => ({ ...m, photoIds: m.photoIds.map(itemId) })),
          pileOrder: draft.pileOrder.map(sequenceId),
          pilePlacements: Object.fromEntries(Object.entries(draft.pilePlacements).map(([id, p]) => [sequenceId(id as SequenceId), { ...p, sequenceId: sequenceId(p.sequenceId) }])),
        },
      },
      sequences: input.sequences.map((s) => ({ ...content(s), id: sequenceId(s.id), currentVersionId: versionId(s.currentVersionId), revision: 0 as SequenceRevision })),
      versions: input.versions.map((v) => ({ ...content(v), id: versionId(v.id), sequenceId: sequenceId(v.sequenceId), parentVersionId: v.parentVersionId ? versionId(v.parentVersionId) : undefined })),
      photoManifest: manifest,
    };
    return ok({ backup, photos: manifest.map(({ photoId: id, ...p }) => ({ ...p, id, width: p.width ?? 0, height: p.height ?? 0 })) });
  } catch (error) {
    return err({ kind: "invalid-backup", reason: error instanceof Error ? error.message : "Invalid backup." });
  }
}
