import { MVP_SEQUENCE_ITEM_LIMIT } from "./ids";
import type { ProjectId, Result, SequenceItemId, VersionId } from "./ids";
import type { SequenceDraft, SequenceItem } from "./sequence";

export interface VersionSummary {
  readonly id: VersionId;
  readonly projectId: ProjectId;
  readonly parentVersionId?: VersionId;
  readonly name: string;
  readonly itemCount: number;
  readonly createdAt: string;
}

export interface SequenceVersion extends VersionSummary {
  readonly memo?: string;
  readonly items: readonly SequenceItem[];
}

export interface CreateVersionInput {
  readonly id: VersionId;
  readonly projectId: ProjectId;
  readonly parentVersionId?: VersionId;
  readonly name: string;
  readonly memo?: string;
  readonly items: readonly SequenceItem[];
  readonly createdAt: string;
}

export type VersionValidationError =
  | { readonly kind: "empty-name" }
  | { readonly kind: "empty-sequence" }
  | { readonly kind: "duplicate-item"; readonly itemId: SequenceItemId }
  | {
      readonly kind: "sequence-limit-exceeded";
      readonly limit: typeof MVP_SEQUENCE_ITEM_LIMIT;
      readonly actual: number;
    };

export interface VersionDiff {
  readonly leftVersionId: VersionId;
  readonly rightVersionId: VersionId;
  readonly added: readonly SequenceItemId[];
  readonly removed: readonly SequenceItemId[];
  readonly moved: ReadonlyArray<{
    readonly itemId: SequenceItemId;
    readonly from: number;
    readonly to: number;
  }>;
}

export interface Versioning {
  createSnapshot(input: CreateVersionInput): Result<SequenceVersion, VersionValidationError>;
  openAsDraft(version: SequenceVersion): SequenceDraft;
  compare(
    left: SequenceVersion,
    right: SequenceVersion,
  ): Result<VersionDiff, { readonly kind: "different-projects" }>;
}
