export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectId = Brand<string, "ProjectId">;
export type SourceId = Brand<string, "SourceId">;
export type PhotoId = Brand<string, "PhotoId">;
/** Stable identity for one visual occurrence on a Table. */
// PhotoId remains accepted for legacy workspaces whose first Table occurrence
// used the source id. The reverse assignment is rejected, so Table instance
// ids cannot accidentally cross into PhotoSource or Sequence APIs.
export type WorktableItemId = Brand<string, "PhotoId" | "WorktableItemId">;
export type SequenceId = Brand<string, "SequenceId">;
export type SequenceItemId = Brand<string, "SequenceItemId">;
export type ReadingUnitId = Brand<string, "ReadingUnitId">;
export type SequenceSegmentId = Brand<string, "SequenceSegmentId">;
export type VersionId = Brand<string, "VersionId">;
export type WorkspaceRevision = Brand<number, "WorkspaceRevision">;
export type SequenceRevision = Brand<number, "SequenceRevision">;

export const MVP_SEQUENCE_ITEM_LIMIT = 500 as const;

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
