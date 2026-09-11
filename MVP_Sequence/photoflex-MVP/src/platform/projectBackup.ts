import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, err, ok, type BackupError, type PhotoId, type PhotoRef, type ProjectBackupV1, type ProjectId, type Result, type SequenceId, type SourceId, type VersionId, type WorkspaceRevision, type SequenceRevision } from "../contracts";
import { isWorkspace, validateSequenceForProject, validateVersionForProject } from "./projectStoreData";

/** Validate before touching storage; every import is an independent project. */
export function prepareBackupImport(bytes: Uint8Array): Result<{ backup: ProjectBackupV1; photos: PhotoRef[] }, BackupError> {
  try {
    const input = JSON.parse(new TextDecoder().decode(bytes)) as ProjectBackupV1;
    if (input?.format !== BACKUP_FORMAT) throw new Error("This is not a PhotoFlex project backup.");
    if (input.schemaVersion !== BACKUP_SCHEMA_VERSION) return err({ kind: "unsupported-schema", found: input.schemaVersion, supported: [BACKUP_SCHEMA_VERSION] });
    if (!isWorkspace(input.project) || !Array.isArray(input.sequences) || !Array.isArray(input.versions) || !Array.isArray(input.photoManifest)) throw new Error("The project backup is incomplete.");
    const project = input.project;
    const unique = (ids: readonly string[]) => ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
    const sequenceIds = input.sequences.map((s) => s.id);
    const versionIds = input.versions.map((v) => v.id);
    const sources = new Set(project.sources.map((s) => s.id));
    if (!unique(sequenceIds) || !unique(versionIds) || !unique(project.sources.map((s) => s.id)) || !unique(project.sequenceIds) || !unique(project.versionIds)) throw new Error("Duplicate identifiers in backup.");
    if (sequenceIds.length !== project.sequenceIds.length || versionIds.length !== project.versionIds.length || project.sequenceIds.some((id) => !sequenceIds.includes(id)) || project.versionIds.some((id) => !versionIds.includes(id))) throw new Error("Missing project documents.");
    for (const sequence of input.sequences) {
      if (!validateSequenceForProject(project.projectId, sequence).ok || !input.versions.some((v) => v.id === sequence.currentVersionId && v.sequenceId === sequence.id)) throw new Error("Invalid Sequence or current version.");
    }
    for (const version of input.versions) {
      if (!validateVersionForProject(project.projectId, version).ok || !sequenceIds.includes(version.sequenceId) || (version.parentVersionId && !input.versions.some((v) => v.id === version.parentVersionId && v.sequenceId === version.sequenceId))) throw new Error("Invalid version reference.");
    }
    if (project.worktableDraft.pileOrder.some((id) => !sequenceIds.includes(id))) throw new Error("Missing Table Sequence.");
    if (!unique(input.photoManifest.map((p) => p.photoId)) || !unique(input.photoManifest.map((p) => JSON.stringify([p.sourceId, p.relativePath])))) throw new Error("Duplicate photo entries.");
    for (const photo of input.photoManifest) {
      if (!sources.has(photo.sourceId) || typeof photo.relativePath !== "string" || !photo.relativePath || photo.relativePath.split(/[\\/]/).some((part: string) => !part || part === "." || part === "..") || photo.relativePath.includes(":")) throw new Error("Invalid photo path or source.");
      if ([photo.width, photo.height, photo.fileSize, photo.fileLastModified].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) throw new Error("Invalid photo metadata.");
    }
    const remap = <T extends string>() => {
      const ids = new Map<T, T>();
      return (id: T): T => { if (!ids.has(id)) ids.set(id, crypto.randomUUID() as T); return ids.get(id)!; };
    };
    const photoId = remap<PhotoId>(), sourceId = remap<SourceId>(), sequenceId = remap<SequenceId>(), versionId = remap<VersionId>();
    const projectId = crypto.randomUUID() as ProjectId;
    const draft = project.worktableDraft;
    const manifest = input.photoManifest.map((p) => ({ ...p, photoId: photoId(p.photoId), sourceId: sourceId(p.sourceId) }));
    const content = <T extends ProjectBackupV1["sequences"][number] | ProjectBackupV1["versions"][number]>(document: T) => ({ ...document, projectId, items: document.items.map((item) => item.kind === "photo" ? { ...item, photoId: photoId(item.photoId) } : item) });
    const backup: ProjectBackupV1 = {
      ...input,
      project: {
        ...project, projectId, name: `${project.name} (restored)`, revision: 0 as WorkspaceRevision, deletionPendingAt: undefined,
        sources: project.sources.map((s) => ({ ...s, id: sourceId(s.id) })),
        sequenceIds: project.sequenceIds.map(sequenceId), versionIds: project.versionIds.map(versionId),
        coverPhotoId: project.coverPhotoId ? photoId(project.coverPhotoId) : undefined,
        photoStates: Object.fromEntries(Object.entries(project.photoStates).map(([id, state]) => [photoId(id as PhotoId), state])),
        resumeContext: undefined,
        worktableDraft: {
          ...draft, projectId, entryOrder: draft.entryOrder.map(photoId),
          placements: Object.fromEntries(Object.entries(draft.placements).map(([id, p]) => [photoId(id as PhotoId), { ...p, photoId: photoId(p.photoId) }])),
          groups: draft.groups.map((g) => ({ ...g, photoIds: g.photoIds.map(photoId) })),
          links: draft.links.map((g) => ({ ...g, photoIds: g.photoIds.map(photoId) })),
          memos: draft.memos?.map((m) => ({ ...m, photoIds: m.photoIds.map(photoId) })),
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
