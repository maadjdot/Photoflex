import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err,
  ok,
  type CloudProjectError,
  type CloudProjectSnapshot,
  type CloudProjectSummary,
  type ProjectBackupV1,
  type ProjectCloud,
  type ProjectId,
  type PushCloudProjectInput,
  type Result,
} from "../../contracts";

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly document: unknown;
  readonly schema_version: number;
  readonly cloud_revision: number;
  readonly updated_at: string;
}

const unavailable = (): CloudProjectError => ({ kind: "unavailable", retryable: true });

function isBackup(value: unknown): value is ProjectBackupV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectBackupV1>;
  return candidate.format === "photoflex-project-backup"
    && typeof candidate.schemaVersion === "number"
    && Boolean(candidate.project && typeof candidate.project === "object");
}

const summaryFromRow = (row: ProjectRow): CloudProjectSummary => ({
  projectId: row.id as ProjectId,
  name: row.name,
  schemaVersion: row.schema_version,
  cloudRevision: row.cloud_revision,
  updatedAt: row.updated_at,
});

function snapshotFromRow(row: ProjectRow): Result<CloudProjectSnapshot, CloudProjectError> {
  if (!isBackup(row.document)) return err({ kind: "invalid-snapshot" });
  return ok({ ...summaryFromRow(row), document: row.document });
}

export class SupabaseProjectCloud implements ProjectCloud {
  constructor(private readonly client: SupabaseClient) {}

  private async userId(): Promise<Result<string, CloudProjectError>> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return err({ kind: "unauthenticated" });
    return ok(data.user.id);
  }

  async list(): Promise<Result<readonly CloudProjectSummary[], CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    const { data, error } = await this.client.from("projects")
      .select("id,name,schema_version,cloud_revision,updated_at")
      .eq("owner_id", userId.value)
      .order("updated_at", { ascending: false });
    if (error || !data) return err(unavailable());
    return ok((data as ProjectRow[]).map(summaryFromRow));
  }

  async pull(projectId: ProjectId): Promise<Result<CloudProjectSnapshot, CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    const { data, error } = await this.client.from("projects")
      .select("id,name,document,schema_version,cloud_revision,updated_at")
      .eq("id", projectId)
      .eq("owner_id", userId.value)
      .maybeSingle();
    if (error) return err(unavailable());
    if (!data) return err({ kind: "not-found", projectId });
    return snapshotFromRow(data as ProjectRow);
  }

  async push(input: PushCloudProjectInput): Promise<Result<CloudProjectSnapshot, CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    const nextRevision = (input.expectedCloudRevision ?? -1) + 1;
    const values = {
      name: input.name,
      document: input.document,
      schema_version: input.schemaVersion,
      cloud_revision: nextRevision,
      updated_at: new Date().toISOString(),
    };

    if (input.expectedCloudRevision === null) {
      const { data, error } = await this.client.from("projects")
        .insert({ id: input.projectId, owner_id: userId.value, ...values })
        .select("id,name,document,schema_version,cloud_revision,updated_at")
        .maybeSingle();
      if (!error && data) return snapshotFromRow(data as ProjectRow);
      const existing = await this.pull(input.projectId);
      return existing.ok
        ? err({ kind: "conflict", expectedRevision: null, actualRevision: existing.value.cloudRevision })
        : err(unavailable());
    }

    const { data, error } = await this.client.from("projects")
      .update(values)
      .eq("id", input.projectId)
      .eq("owner_id", userId.value)
      .eq("cloud_revision", input.expectedCloudRevision)
      .select("id,name,document,schema_version,cloud_revision,updated_at")
      .maybeSingle();
    if (error) return err(unavailable());
    if (data) return snapshotFromRow(data as ProjectRow);
    const existing = await this.pull(input.projectId);
    if (!existing.ok) return existing;
    return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: existing.value.cloudRevision });
  }
}
