import type { BackupError, LoadError, ProjectBackupV1, ProjectId, ProjectStore, Result, StorageAccessError } from "../contracts";
import { jsonSemanticEqual } from "./jsonSemanticEqual";

export interface CloudSyncState {
  readonly projectId: ProjectId;
  readonly localRevision: number;
  readonly acknowledgedRevision: number;
  readonly cloudRevision: number | null;
  readonly conflict: boolean;
}
export interface CloudSyncSeed { readonly revision: number | null; readonly pending: boolean }
export interface CloudSnapshot { readonly document: ProjectBackupV1; readonly sync: CloudSyncState }
export interface CloudSnapshotInstall {
  readonly cloudRevision: number;
  readonly expectedLocalRevision: number;
  readonly replacePending?: boolean;
}

/** Local writes advance the journal in the same transaction as their documents. */
export interface CloudSnapshotCache extends ProjectStore {
  readCloudSyncState(id: ProjectId, seed?: CloudSyncSeed): Promise<Result<CloudSyncState | undefined, StorageAccessError>>;
  captureCloudSnapshot(id: ProjectId): Promise<Result<CloudSnapshot, LoadError>>;
  acknowledgeCloudSnapshot(id: ProjectId, localRevision: number, cloudRevision: number): Promise<Result<CloudSyncState, StorageAccessError>>;
  markCloudPending(id: ProjectId): Promise<Result<CloudSyncState, StorageAccessError>>;
  markCloudConflict(id: ProjectId): Promise<Result<CloudSyncState, StorageAccessError>>;
  installCloudSnapshot(document: ProjectBackupV1, sync?: CloudSnapshotInstall): Promise<Result<void, BackupError>>;
}

export const cloudSyncPending = (state: CloudSyncState): boolean => state.localRevision !== state.acknowledgedRevision;
export const initialCloudSyncState = (projectId: ProjectId, seed: CloudSyncSeed): CloudSyncState => ({
  projectId, localRevision: seed.pending ? 1 : 0, acknowledgedRevision: 0, cloudRevision: seed.revision, conflict: false,
});
export const dirtyCloudSyncState = (state: CloudSyncState): CloudSyncState => ({ ...state, localRevision: state.localRevision + 1 });
export const acknowledgedCloudSyncState = (state: CloudSyncState, localRevision: number, cloudRevision: number): CloudSyncState => ({
  ...state, acknowledgedRevision: Math.max(state.acknowledgedRevision, Math.min(localRevision, state.localRevision)), cloudRevision, conflict: false,
});

/** Local optimistic revisions never move backwards when a cloud snapshot replaces a cache. */
export function installedCloudDocument<T extends { readonly revision: number }>(incoming: T, previous?: T): T {
  if (!previous) return incoming;
  const same = jsonSemanticEqual({ ...incoming, revision: 0 }, { ...previous, revision: 0 });
  return { ...incoming, revision: Math.max(incoming.revision, previous.revision + (same ? 0 : 1)) } as T;
}
export const cloudSnapshotContent = ({ project, sequences, versions, layouts, photoManifest }: ProjectBackupV1) => ({
  project: { ...project, revision: 0 }, sequences: sequences.map((sequence) => ({ ...sequence, revision: 0 })),
  layouts: layouts.map((layout) => ({ ...layout, revision: 0 })), versions, photoManifest,
});
