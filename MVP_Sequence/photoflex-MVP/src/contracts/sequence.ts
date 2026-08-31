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
