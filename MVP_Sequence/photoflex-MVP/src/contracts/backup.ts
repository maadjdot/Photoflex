import type { PhotoId, ProjectId, SourceId, VersionId } from "./ids";
import type { ProjectWorkspace } from "./persistence";
import type { SequenceDocument } from "./sequence";
import type { SequenceVersion } from "./versioning";

export const BACKUP_FORMAT = "photoflex-project-backup" as const;
export const BACKUP_SCHEMA_VERSION = 3 as const;

export interface ProjectBackupV1 {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: 2 | typeof BACKUP_SCHEMA_VERSION;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly project: ProjectWorkspace;
  readonly versions: readonly SequenceVersion[];
  readonly sequences: readonly SequenceDocument[];
  readonly photoManifest: ReadonlyArray<{
    readonly sourceId: SourceId;
    readonly photoId: PhotoId;
    readonly relativePath: string;
    readonly width?: number;
    readonly height?: number;
    readonly fileSize?: number;
    readonly fileLastModified?: number;
    readonly contentFingerprint?: string;
    readonly locationKind?: "folder-relative" | "file-handle";
  }>;
}

export interface ImportedBackupIds {
  readonly projectId: ProjectId;
  readonly versionIds: readonly VersionId[];
}
