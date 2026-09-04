import type {
  PhotoId,
  ProjectId,
  Result,
  SourceId,
  SequenceId,
  SequenceRevision,
  VersionId,
  WorkspaceRevision,
} from "./ids";
import type { SequenceDocument, SequenceSummary } from "./sequence";
import type { SequenceVersion, VersionSummary } from "./versioning";
import type { PhotoState, WorktableDraft, WorktableViewport } from "./worktable";

export const INDEXED_DB_SCHEMA_VERSION = 8 as const;
export const WORKSPACE_SCHEMA_VERSION = 6 as const;

export type SourceStatus =
  | "loading"
  | "ready"
  | "partial"
  | "offline"
  | "permission-lost"
  | "empty"
  | "error";

export interface SourceGrant {
  readonly sourceId: SourceId;
  readonly displayName: string;
  readonly status: SourceStatus;
  readonly restored: boolean;
}

export interface SourceRecord {
  readonly id: SourceId;
  readonly displayName: string;
  readonly createdAt: string;
  readonly removedAt?: string;
}

export interface SourceRuntimeState {
  readonly sourceId: SourceId;
  readonly status: SourceStatus;
  readonly discoveredCount: number;
  readonly indexedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly errorMessage?: string;
}

export interface PhotoRef {
  readonly id: PhotoId;
  readonly sourceId: SourceId;
  readonly relativePath: string;
  readonly width: number;
  readonly height: number;
  readonly fileSize?: number;
  readonly fileLastModified?: number;
}

export interface PhotoPage {
  readonly items: readonly PhotoRef[];
  readonly nextCursor: string | null;
  readonly issues: readonly PhotoIssue[];
}

export interface RemovedSourceData {
  readonly photoIds: readonly PhotoId[];
}

export type PhotoIssue =
  | { readonly kind: "unsupported-file"; readonly relativePath: string }
  | { readonly kind: "unreadable-file"; readonly relativePath: string }
  | { readonly kind: "missing-file"; readonly photoId: PhotoId; readonly relativePath: string };

export interface PreviewLease {
  readonly url: string;
  release(): void;
}

export type DerivedPreviewMaxEdge = 768 | 1536 | 2048;

export type SourceScanEvent =
  | { readonly kind: "progress"; readonly state: SourceRuntimeState }
  | { readonly kind: "completed"; readonly state: SourceRuntimeState };

export type SourceError =
  | { readonly kind: "cancelled" }
  | { readonly kind: "permission-denied"; readonly sourceId?: SourceId }
  | { readonly kind: "permission-lost"; readonly sourceId: SourceId }
  | { readonly kind: "source-not-found"; readonly sourceId: SourceId }
  | { readonly kind: "photo-not-found"; readonly photoId: PhotoId }
  | { readonly kind: "preview-unavailable"; readonly photoId: PhotoId }
  | { readonly kind: "io"; readonly retryable: boolean };

export interface PhotoSource {
  chooseFolder(existingSourceIds: readonly SourceId[]): Promise<Result<SourceGrant, SourceError>>;
  restoreFolder(sourceId: SourceId): Promise<Result<SourceGrant, SourceError>>;
  removeSource(sourceId: SourceId): Promise<Result<RemovedSourceData, SourceError>>;
  scan(sourceId: SourceId, signal?: AbortSignal): AsyncIterable<Result<SourceScanEvent, SourceError>>;
  getSourceState(sourceId: SourceId): Promise<Result<SourceRuntimeState, SourceError>>;
  listPhotos(
    sourceId: SourceId,
    cursor?: string,
    limit?: number,
  ): Promise<Result<PhotoPage, SourceError>>;
  getPhoto(photoId: PhotoId): Promise<Result<PhotoRef, SourceError>>;
  thumbnail(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>>;
  /** A size-tiered derived image; never the original file. */
  derivedPreview(photoId: PhotoId, maxEdge: DerivedPreviewMaxEdge): Promise<Result<PreviewLease, SourceError>>;
  preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>>;
}

export interface ResumeContext {
  readonly page: "project" | "contact-sheet" | "table" | "sequence" | "sequence-compare";
  readonly sourceId?: SourceId;
  readonly filter: "all";
  readonly anchorPhotoId?: PhotoId;
  readonly tableViewport?: WorktableViewport;
  readonly sequenceId?: SequenceId;
  readonly compareSequenceIds?: readonly [SequenceId, SequenceId];
}

export interface ProjectWorkspace {
  readonly schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly memo: string;
  readonly expectedPhotoCount: number | null;
  readonly sources: readonly SourceRecord[];
  readonly photoStates: Readonly<Partial<Record<PhotoId, PhotoState>>>;
  readonly worktableDraft: WorktableDraft;
  readonly sequenceIds: readonly SequenceId[];
  readonly versionIds: readonly VersionId[];
  readonly revision: WorkspaceRevision;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly coverPhotoId?: PhotoId;
  readonly resumeContext?: ResumeContext;
}

export interface ProjectSummary {
  readonly id: ProjectId;
  readonly name: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly sourceCount: number;
  readonly tableCount: number;
  readonly coverPhotoId?: PhotoId;
}

export interface CreateProjectInput {
  readonly id: ProjectId;
  readonly name: string;
  readonly createdAt: string;
  readonly memo?: string;
  readonly expectedPhotoCount?: number | null;
  readonly initialSource?: SourceRecord;
}

export type NotFoundError = {
  readonly kind: "not-found";
  readonly entity: "project" | "version" | "sequence";
  readonly id: string;
};

export type UnavailableError = { readonly kind: "unavailable"; readonly retryable: boolean };
export type StorageSchemaError =
  | {
      readonly kind: "unsupported-storage-schema";
      readonly found: number;
      readonly supported: readonly number[];
    }
  | { readonly kind: "migration-failed"; readonly from: number; readonly to: number };
export type StorageAccessError = UnavailableError | StorageSchemaError;
export type CorruptDataError = { readonly kind: "corrupt-data"; readonly entityId: string };
export type LoadError = NotFoundError | CorruptDataError | StorageAccessError;
export type SaveError =
  | NotFoundError
  | {
      readonly kind: "conflict";
      readonly expectedRevision: WorkspaceRevision;
      readonly actualRevision: WorkspaceRevision;
    }
  | { readonly kind: "quota-exceeded" }
  | StorageAccessError;
export type CreateProjectError =
  | { readonly kind: "project-id-exists"; readonly projectId: ProjectId }
  | { readonly kind: "quota-exceeded" }
  | StorageAccessError;
export type VersionWriteError =
  | SaveError
  | { readonly kind: "version-id-exists"; readonly versionId: VersionId }
  | { readonly kind: "invalid-version"; readonly reason: string };
export type VersionSaveMode = "overwrite" | "save-as";
export interface SaveSequenceVersionInput {
  readonly mode: VersionSaveMode;
  readonly projectId: ProjectId;
  readonly sequence: SequenceDocument;
  readonly version: SequenceVersion;
  readonly expectedWorkspaceRevision: WorkspaceRevision;
  readonly expectedSequenceRevision: SequenceRevision;
}
export type SaveSequenceVersionError =
  | VersionWriteError
  | { readonly kind: "invalid-sequence"; readonly reason: string }
  | { readonly kind: "version-not-found"; readonly versionId: VersionId }
  | { readonly kind: "version-name-exists"; readonly name: string }
  | { readonly kind: "version-sequence-mismatch" }
  | { readonly kind: "version-name-immutable" }
  | { readonly kind: "sequence-conflict"; readonly expectedRevision: SequenceRevision; readonly actualRevision: SequenceRevision };
export type SequenceWriteError =
  | SaveError
  | { readonly kind: "sequence-id-exists"; readonly sequenceId: SequenceId }
  | { readonly kind: "sequence-name-exists"; readonly name: string }
  | { readonly kind: "sequence-conflict"; readonly expectedRevision: SequenceRevision; readonly actualRevision: SequenceRevision }
  | { readonly kind: "invalid-sequence"; readonly reason: string };
export type DeleteError = NotFoundError | CorruptDataError | StorageAccessError;
export type DeleteVersionError = SaveError | { readonly kind: "version-not-found"; readonly versionId: VersionId } | { readonly kind: "cannot-delete-current-version"; readonly versionId: VersionId };
export type BackupError =
  | { readonly kind: "unsupported-schema"; readonly found: number; readonly supported: readonly number[] }
  | { readonly kind: "invalid-backup"; readonly reason: string }
  | { readonly kind: "quota-exceeded" }
  | StorageAccessError;

export interface ProjectStore {
  listProjects(): Promise<Result<readonly ProjectSummary[], CorruptDataError | StorageAccessError>>;
  createProject(input: CreateProjectInput): Promise<Result<ProjectWorkspace, CreateProjectError>>;
  loadWorkspace(projectId: ProjectId): Promise<Result<ProjectWorkspace, LoadError>>;
  saveWorkspace(
    workspace: ProjectWorkspace,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>>;
  saveWorktable(
    projectId: ProjectId,
    draft: WorktableDraft,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>>;
  createSequence(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    sequence: SequenceDocument,
    initialVersion: SequenceVersion,
    worktableDraft: WorktableDraft,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: WorkspaceRevision }, SequenceWriteError>>;
  listSequences(projectId: ProjectId): Promise<Result<readonly SequenceSummary[], LoadError>>;
  loadSequence(sequenceId: SequenceId): Promise<Result<SequenceDocument, LoadError>>;
  saveSequence(
    sequence: SequenceDocument,
    expectedRevision: SequenceRevision,
  ): Promise<Result<{ readonly summary: SequenceSummary; readonly revision: SequenceRevision }, SequenceWriteError>>;
  deleteSequences(
    projectId: ProjectId,
    sequenceIds: readonly SequenceId[],
    expectedWorkspaceRevision: WorkspaceRevision,
    worktableDraft: WorktableDraft,
  ): Promise<Result<{ readonly revision: WorkspaceRevision; readonly sequenceIds: readonly SequenceId[]; readonly versionIds: readonly VersionId[] }, SaveError>>;
  createVersion(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    version: SequenceVersion,
  ): Promise<
    Result<{ readonly summary: VersionSummary; readonly revision: WorkspaceRevision }, VersionWriteError>
  >;
  saveSequenceVersion(
    input: SaveSequenceVersionInput,
  ): Promise<Result<{ readonly summary: VersionSummary; readonly workspaceRevision: WorkspaceRevision; readonly sequenceRevision: SequenceRevision }, SaveSequenceVersionError>>;
  deleteVersion(projectId: ProjectId, versionId: VersionId, expectedWorkspaceRevision: WorkspaceRevision): Promise<Result<{ readonly revision: WorkspaceRevision }, DeleteVersionError>>;
  listVersions(projectId: ProjectId): Promise<Result<readonly VersionSummary[], LoadError>>;
  loadVersion(versionId: VersionId): Promise<Result<SequenceVersion, LoadError>>;
  deleteProject(projectId: ProjectId): Promise<Result<void, DeleteError>>;
  exportBackup(projectId: ProjectId): Promise<Result<Uint8Array, LoadError>>;
  importBackup(bytes: Uint8Array): Promise<Result<ProjectId, BackupError>>;
}
