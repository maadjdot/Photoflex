export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectId = Brand<string, "ProjectId">;
export type SourceId = Brand<string, "SourceId">;
export type PhotoId = Brand<string, "PhotoId">;
export type SequenceItemId = Brand<string, "SequenceItemId">;
export type VersionId = Brand<string, "VersionId">;
export type WorkspaceRevision = Brand<number, "WorkspaceRevision">;

export const MVP_SEQUENCE_ITEM_LIMIT = 500 as const;

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
