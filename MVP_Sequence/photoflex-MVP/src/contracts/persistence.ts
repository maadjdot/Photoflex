import type {
  PhotoId,
  ProjectId,
  Result,
  SourceId,
  VersionId,
  WorkspaceRevision,
} from "./ids";
import type { SequenceDraft } from "./sequence";
import type { SequenceVersion, VersionSummary } from "./versioning";

export const INDEXED_DB_SCHEMA_VERSION = 3 as const;
export const WORKSPACE_SCHEMA_VERSION = 2 as const;

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
  preview(photoId: PhotoId): Promise<Result<PreviewLease, SourceError>>;
}

export interface ResumeContext {
  readonly page: "project" | "contact-sheet";
  readonly sourceId?: SourceId;
  readonly filter: "all";
  readonly anchorPhotoId?: PhotoId;
  readonly poolCollapsed?: boolean;
}

export interface ProjectWorkspace {
  readonly schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly memo: string;
  readonly expectedPhotoCount: number | null;
  readonly sources: readonly SourceRecord[];
  readonly poolPhotoIds: readonly PhotoId[];
  readonly sequenceDraft: SequenceDraft;
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
  readonly poolCount: number;
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
  readonly entity: "project" | "version";
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
export type DeleteError = NotFoundError | CorruptDataError | StorageAccessError;
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
  createVersion(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    version: SequenceVersion,
  ): Promise<
    Result<{ readonly summary: VersionSummary; readonly revision: WorkspaceRevision }, VersionWriteError>
  >;
  listVersions(projectId: ProjectId): Promise<Result<readonly VersionSummary[], LoadError>>;
  loadVersion(versionId: VersionId): Promise<Result<SequenceVersion, LoadError>>;
  deleteProject(projectId: ProjectId): Promise<Result<void, DeleteError>>;
  exportBackup(projectId: ProjectId): Promise<Result<Uint8Array, LoadError>>;
  importBackup(bytes: Uint8Array): Promise<Result<ProjectId, BackupError>>;
}
