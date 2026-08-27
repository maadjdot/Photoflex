import { MVP_SEQUENCE_ITEM_LIMIT } from "./ids";
import type { PhotoId, ProjectId, Result, SequenceItemId, VersionId } from "./ids";

export interface SequenceItem {
  readonly id: SequenceItemId;
  readonly photoId: PhotoId;
}

export interface SequenceDraft {
  readonly projectId: ProjectId;
  readonly baseVersionId?: VersionId;
  readonly items: readonly SequenceItem[];
}

export type SequenceEditCommand =
  | { readonly type: "add"; readonly items: readonly SequenceItem[]; readonly at?: number }
  | { readonly type: "move"; readonly itemIds: readonly SequenceItemId[]; readonly to: number }
  | { readonly type: "remove"; readonly itemIds: readonly SequenceItemId[] };

export type SequenceCommandError =
  | { readonly kind: "unknown-item"; readonly itemId: SequenceItemId }
  | { readonly kind: "duplicate-item"; readonly itemId: SequenceItemId }
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

export type WhiteboardAction =
  | { readonly type: "select"; readonly itemIds: readonly SequenceItemId[] }
  | {
      readonly type: "move";
      readonly itemIds: readonly SequenceItemId[];
      readonly dx: number;
      readonly dy: number;
    }
  | { readonly type: "remove"; readonly itemIds: readonly SequenceItemId[] }
  | { readonly type: "set-viewport"; readonly zoom: number; readonly x: number; readonly y: number };

export type WhiteboardError =
  | { readonly kind: "unknown-item"; readonly itemId: SequenceItemId }
  | { readonly kind: "invalid-viewport" }
  | { readonly kind: "stale-order-preview" };

export interface WhiteboardItem {
  readonly sequenceItemId: SequenceItemId;
  readonly x: number;
  readonly y: number;
}

export interface WhiteboardDraft {
  readonly layoutRevision: number;
  readonly entryOrder: readonly SequenceItemId[];
  readonly items: Readonly<Record<SequenceItemId, WhiteboardItem>>;
  readonly selectedIds: readonly SequenceItemId[];
  readonly viewport: { readonly zoom: number; readonly x: number; readonly y: number };
}

export interface WhiteboardOrderPreview {
  readonly layoutRevision: number;
  readonly itemIds: readonly SequenceItemId[];
}

export interface WhiteboardSorter {
  open(items: readonly SequenceItem[]): WhiteboardDraft;
  apply(draft: WhiteboardDraft, action: WhiteboardAction): Result<WhiteboardDraft, WhiteboardError>;
  deriveOrder(draft: WhiteboardDraft): WhiteboardOrderPreview;
  commit(
    draft: WhiteboardDraft,
    preview: WhiteboardOrderPreview,
  ): Result<readonly SequenceItemId[], WhiteboardError>;
  discard(draft: WhiteboardDraft): readonly SequenceItemId[];
}
