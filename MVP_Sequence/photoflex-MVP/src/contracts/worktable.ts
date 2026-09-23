import type { PhotoId, ProjectId, Result, SequenceId, WorktableItemId } from "./ids";
import type { FrameCommandError, FrameEditCommand, FrameId, WorktableFrame } from "./frame";

export interface WorktablePoint {
  readonly x: number;
  readonly y: number;
}

export interface WorktableViewport {
  readonly originX: number;
  readonly originY: number;
  readonly zoom: number;
}

export interface WorktablePlacement extends WorktablePoint {
  /** Missing only on legacy in-memory fixtures; persisted workspaces are migrated. */
  readonly id?: WorktableItemId;
  readonly photoId: PhotoId;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly filename: string;
  /** Locked photos stay visible and selectable, but ignore manipulation gestures. */
  readonly locked?: boolean;
}

/** A strong Table-only relationship. Members never imply Sequence order. */
export interface WorktableGroup {
  readonly id: string;
  readonly name: string;
  readonly photoIds: readonly WorktableItemId[];
}

/** A weak Table-only relationship rendered as a chain between members. */
export interface WorktableLink {
  readonly id: string;
  readonly name: string;
  readonly photoIds: readonly WorktableItemId[];
}

export interface WorktableSequencePilePlacement extends WorktablePoint {
  readonly sequenceId: SequenceId;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

export interface WorktableMemo extends WorktablePoint {
  readonly id: string;
  /** Shared Table stacking order. Optional for projects saved before memo layering. */
  readonly z?: number;
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly photoIds: readonly WorktableItemId[];
}

export interface WorktableDraft {
  /** Optional for projects saved before Table memos were introduced. */
  readonly memos?: readonly WorktableMemo[];
  readonly projectId: ProjectId;
  readonly entryOrder: readonly WorktableItemId[];
  readonly placements: Readonly<Record<WorktableItemId, WorktablePlacement>>;
  readonly groups: readonly WorktableGroup[];
  readonly links: readonly WorktableLink[];
  readonly pileOrder: readonly SequenceId[];
  readonly pilePlacements: Readonly<Record<SequenceId, WorktableSequencePilePlacement>>;
  /** Optional only while reading pre-Frame fixtures and older documents. */
  readonly frameOrder?: readonly FrameId[];
  readonly frames?: Readonly<Record<FrameId, WorktableFrame>>;
}

export interface WorktablePlacementSeed {
  /** Defaults to photoId for legacy callers and the first Table occurrence. */
  readonly id?: WorktableItemId;
  readonly photoId: PhotoId;
  readonly width: number;
  readonly height: number;
  readonly filename: string;
  /** Optional relative geometry used when duplicating a batch. */
  readonly x?: number;
  readonly y?: number;
}

export type WorktableAlignment =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type WorktableLayout =
  | { readonly type: "grid"; readonly columns?: number; readonly gap?: number }
  | { readonly type: "row"; readonly gap?: number }
  | { readonly type: "align"; readonly edge: WorktableAlignment };

export type WorktableEditCommand =
  | FrameEditCommand
  | { readonly type: "create-memo"; readonly memo: WorktableMemo }
  | { readonly type: "update-memo"; readonly memoId: string; readonly changes: Partial<Omit<WorktableMemo, "id">> }
  | { readonly type: "remove-memo"; readonly memoId: string }
  | {
      readonly type: "place";
      readonly items: readonly WorktablePlacementSeed[];
      readonly at?: WorktablePoint;
    }
  | { readonly type: "move"; readonly photoIds: readonly WorktableItemId[]; readonly by: WorktablePoint }
  | { readonly type: "resize"; readonly photoIds: readonly WorktableItemId[]; readonly scale: number }
  | { readonly type: "arrange"; readonly photoIds: readonly WorktableItemId[]; readonly layout: WorktableLayout }
  | { readonly type: "shuffle"; readonly photoIds: readonly WorktableItemId[] }
  | { readonly type: "create-group"; readonly photoIds: readonly WorktableItemId[] }
  | { readonly type: "add-to-group"; readonly groupId: string; readonly photoId: WorktableItemId }
  | { readonly type: "remove-from-group"; readonly photoId: WorktableItemId }
  | { readonly type: "remove-group"; readonly groupId: string }
  | { readonly type: "create-link"; readonly photoIds: readonly WorktableItemId[] }
  | { readonly type: "remove-link"; readonly linkId: string }
  | { readonly type: "place-sequence-pile"; readonly placement: WorktableSequencePilePlacement }
  | { readonly type: "move-sequence-piles"; readonly sequenceIds: readonly SequenceId[]; readonly by: WorktablePoint }
  | {
      readonly type: "resize-sequence-pile";
      readonly sequenceId: SequenceId;
      readonly scale: number;
      /** Optional rendered size used when a legacy placement is smaller than the current card minimum. */
      readonly baseSize?: { readonly width: number; readonly height: number };
    }
  | { readonly type: "bring-sequence-piles-to-front"; readonly sequenceIds: readonly SequenceId[] }
  | { readonly type: "remove-sequence-piles"; readonly sequenceIds: readonly SequenceId[] }
  | { readonly type: "bring-to-front"; readonly photoIds: readonly WorktableItemId[] }
  | { readonly type: "set-locked"; readonly photoIds: readonly WorktableItemId[]; readonly locked: boolean }
  | { readonly type: "remove"; readonly photoIds: readonly WorktableItemId[] };

export type WorktableCommandError =
  | FrameCommandError
  | { readonly kind: "unknown-placement"; readonly photoId: WorktableItemId }
  | { readonly kind: "locked-placement"; readonly photoId: WorktableItemId }
  | { readonly kind: "unknown-sequence-pile"; readonly sequenceId: SequenceId }
  | { readonly kind: "duplicate-sequence-pile"; readonly sequenceId: SequenceId }
  | { readonly kind: "duplicate-photo-id"; readonly photoId: WorktableItemId }
  | { readonly kind: "invalid-coordinate" }
  | { readonly kind: "invalid-layout" }
  | { readonly kind: "invalid-relation" };

export interface WorktableEditor {
  snapshot(): WorktableDraft;
  execute(command: WorktableEditCommand): Result<WorktableDraft, WorktableCommandError>;
  undo(): WorktableDraft;
  redo(): WorktableDraft;
  canUndo(): boolean;
  canRedo(): boolean;
}

export type PhotoDecision = "unreviewed" | "pick" | "reject";

export interface PhotoState {
  readonly decision: PhotoDecision;
  readonly pinned: boolean;
}
