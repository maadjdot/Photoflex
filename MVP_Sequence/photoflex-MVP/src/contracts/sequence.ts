import { MVP_SEQUENCE_ITEM_LIMIT } from "./ids";
import type { PhotoId, ProjectId, ReadingUnitId, Result, SequenceId, SequenceItemId, SequenceRevision, SequenceSegmentId, VersionId } from "./ids";

export interface SequencePhotoItem {
  readonly id: SequenceItemId;
  readonly kind: "photo";
  readonly photoId: PhotoId;
}

export interface SequenceBlankItem {
  readonly id: SequenceItemId;
  readonly kind: "blank";
}

export type SequenceItem = SequencePhotoItem | SequenceBlankItem;

export type ReadingUnit =
  | { readonly id: ReadingUnitId; readonly kind: "single"; readonly itemId: SequenceItemId }
  | { readonly id: ReadingUnitId; readonly kind: "spread"; readonly leftItemId: SequenceItemId; readonly rightItemId: SequenceItemId }
  | { readonly id: ReadingUnitId; readonly kind: "blank"; readonly itemId: SequenceItemId };

export interface SequenceSegment {
  readonly id: SequenceSegmentId;
  readonly name: string;
  readonly itemIds: readonly SequenceItemId[];
}

export interface SequenceDraft {
  readonly projectId: ProjectId;
  readonly baseVersionId?: VersionId;
  readonly items: readonly SequenceItem[];
  readonly segments: readonly SequenceSegment[];
  readonly readingUnits: readonly ReadingUnit[];
}

export interface SequenceDocument {
  readonly id: SequenceId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly items: readonly SequenceItem[];
  readonly segments: readonly SequenceSegment[];
  readonly readingUnits: readonly ReadingUnit[];
  readonly currentVersionId: VersionId;
  readonly revision: SequenceRevision;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SequenceSummary {
  readonly id: SequenceId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly itemCount: number;
  readonly photoCount: number;
  readonly previewPhotoIds: readonly PhotoId[];
  readonly updatedAt: string;
}

export interface SequenceStructureDiff {
  readonly leftSequenceId: SequenceId;
  readonly rightSequenceId: SequenceId;
  readonly leftOnly: readonly PhotoId[];
  readonly rightOnly: readonly PhotoId[];
  readonly shared: ReadonlyArray<{
    readonly photoId: PhotoId;
    readonly leftIndex: number;
    readonly rightIndex: number;
    readonly moved: boolean;
  }>;
}

export type SequenceEditCommand =
  | { readonly type: "add"; readonly items: readonly SequenceItem[]; readonly at?: number }
  | { readonly type: "move"; readonly itemIds: readonly SequenceItemId[]; readonly to: number }
  | { readonly type: "remove"; readonly itemIds: readonly SequenceItemId[] }
  | { readonly type: "addBlank"; readonly itemId: SequenceItemId; readonly unitId: ReadingUnitId; readonly at: number }
  | { readonly type: "removeBlank"; readonly itemId: SequenceItemId }
  | { readonly type: "createSpread"; readonly unitId: ReadingUnitId; readonly itemIds: readonly [SequenceItemId, SequenceItemId] }
  | { readonly type: "splitSpread"; readonly unitId: ReadingUnitId }
  | { readonly type: "createSegment"; readonly segment: SequenceSegment }
  | { readonly type: "renameSegment"; readonly segmentId: SequenceSegmentId; readonly name: string }
  | { readonly type: "moveSegment"; readonly segmentId: SequenceSegmentId; readonly to: number }
  | { readonly type: "ungroupSegment"; readonly segmentId: SequenceSegmentId };

export type SequenceCommandError =
  | { readonly kind: "unknown-item"; readonly itemId: SequenceItemId }
  | { readonly kind: "duplicate-item"; readonly itemId: SequenceItemId }
  | { readonly kind: "unknown-unit"; readonly unitId: ReadingUnitId }
  | { readonly kind: "unknown-segment"; readonly segmentId: SequenceSegmentId }
  | { readonly kind: "invalid-reading-unit" }
  | { readonly kind: "invalid-segment" }
  | { readonly kind: "empty-name" }
  | { readonly kind: "invalid-target"; readonly target: number }
  | {
      readonly kind: "sequence-limit-exceeded";
      readonly limit: typeof MVP_SEQUENCE_ITEM_LIMIT;
      readonly current: number;
      readonly attempted: number;
    };

export interface SequenceEditor {
  snapshot(): SequenceDraft;
  execute(command: SequenceEditCommand): Result<SequenceDraft, SequenceCommandError>;
  undo(): SequenceDraft;
  redo(): SequenceDraft;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function isPhotoSequenceItem(item: SequenceItem): item is SequencePhotoItem {
  return item.kind === "photo";
}
