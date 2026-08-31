import type { PhotoId, ProjectId, Result } from "./ids";

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
  readonly photoId: PhotoId;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly filename: string;
}

/** A strong Table-only relationship. Members never imply Sequence order. */
export interface WorktableGroup {
  readonly id: string;
  readonly name: string;
  readonly photoIds: readonly PhotoId[];
}

/** A weak Table-only relationship rendered as a chain between members. */
export interface WorktableLink {
  readonly id: string;
  readonly name: string;
  readonly photoIds: readonly PhotoId[];
}

export interface WorktableDraft {
  readonly projectId: ProjectId;
  readonly entryOrder: readonly PhotoId[];
  readonly placements: Readonly<Record<PhotoId, WorktablePlacement>>;
  readonly groups: readonly WorktableGroup[];
  readonly links: readonly WorktableLink[];
}

export interface WorktablePlacementSeed {
  readonly photoId: PhotoId;
  readonly width: number;
  readonly height: number;
  readonly filename: string;
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
  | {
      readonly type: "place";
      readonly items: readonly WorktablePlacementSeed[];
      readonly at?: WorktablePoint;
    }
  | { readonly type: "move"; readonly photoIds: readonly PhotoId[]; readonly by: WorktablePoint }
  | { readonly type: "resize"; readonly photoIds: readonly PhotoId[]; readonly scale: number }
  | { readonly type: "arrange"; readonly photoIds: readonly PhotoId[]; readonly layout: WorktableLayout }
  | { readonly type: "create-group"; readonly photoIds: readonly PhotoId[] }
  | { readonly type: "add-to-group"; readonly groupId: string; readonly photoId: PhotoId }
  | { readonly type: "remove-from-group"; readonly photoId: PhotoId }
  | { readonly type: "remove-group"; readonly groupId: string }
  | { readonly type: "create-link"; readonly photoIds: readonly PhotoId[] }
  | { readonly type: "remove-link"; readonly linkId: string }
  | { readonly type: "bring-to-front"; readonly photoIds: readonly PhotoId[] }
  | { readonly type: "remove"; readonly photoIds: readonly PhotoId[] };

export type WorktableCommandError =
  | { readonly kind: "unknown-placement"; readonly photoId: PhotoId }
  | { readonly kind: "duplicate-photo-id"; readonly photoId: PhotoId }
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
