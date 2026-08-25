export type EntityId = string;

export type JobState = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface BenchmarkError {
  code: string;
  message: string;
  recoverable: boolean;
  itemId?: EntityId;
}

export interface JobEvent {
  jobId: EntityId;
  state: JobState;
  completed: number;
  total: number;
  errors: BenchmarkError[];
  emittedAt: string;
}

export interface WorkspaceSnapshot {
  id: EntityId;
  revision: number;
  sha256: string;
  createdAt: string;
}

export interface ProjectWorkspace {
  open(projectId: EntityId): Promise<{ projectId: EntityId; revision: number }>;
  migrate(projectId: EntityId): Promise<JobEvent>;
  autosave(projectId: EntityId, expectedRevision: number, payload: Uint8Array): Promise<WorkspaceSnapshot>;
  createSnapshot(projectId: EntityId): Promise<WorkspaceSnapshot>;
  restoreSnapshot(projectId: EntityId, snapshotId: EntityId): Promise<WorkspaceSnapshot>;
  verifyRecovery(projectId: EntityId): Promise<{ valid: boolean; revision: number; sha256: string }>;
}

export interface SourceGrant {
  sourceId: EntityId;
  displayName: string;
  restored: boolean;
}

export interface SourceEntry {
  photoId: EntityId;
  sourceId: EntityId;
  relativePath: string;
  proxyUrl: string;
  width: number;
  height: number;
}

export interface SourceLibrary {
  requestFolderGrant(): Promise<SourceGrant>;
  restoreGrant(sourceId: EntityId): Promise<SourceGrant>;
  scan(sourceId: EntityId): AsyncIterable<JobEvent>;
  query(sourceId: EntityId, offset: number, limit: number): Promise<SourceEntry[]>;
  proxyUrl(sourceId: EntityId, photoId: EntityId): Promise<string>;
}

export interface ExportRequest {
  projectId: EntityId;
  destinationGrantId: EntityId;
  pageIds: EntityId[];
}

export interface ExportQueue {
  startPdf(request: ExportRequest): Promise<{ jobId: EntityId }>;
  events(jobId: EntityId): AsyncIterable<JobEvent>;
  cancel(jobId: EntityId): Promise<JobEvent>;
  retry(jobId: EntityId): Promise<{ jobId: EntityId }>;
}

export interface HostDiagnostics {
  framework: "browser" | "tauri" | "electron";
  environmentId: string;
  versions: Record<string, string>;
  processTreeRssBytes?: number;
}

export interface PhotoFlexHost {
  workspace: ProjectWorkspace;
  sources: SourceLibrary;
  exports: ExportQueue;
  diagnostics(): Promise<HostDiagnostics>;
}

export const FORBIDDEN_SHALLOW_CAPABILITIES = ["read", "write", "invoke", "executeShell"] as const;

export function assertNarrowHostContract(candidate: object): void {
  for (const capability of FORBIDDEN_SHALLOW_CAPABILITIES) {
    if (capability in candidate) {
      throw new Error(`Forbidden shallow host capability: ${capability}`);
    }
  }
}
