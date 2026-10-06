import {
  err, ok,
  type AccountSession,
  type CloudProjectError,
  type CloudProjectSnapshot,
  type CloudProjectSummary,
  type ProjectBackupV1,
  type ProjectCloud,
  type ProjectId,
  type PushCloudProjectInput,
  type Result,
} from "../../contracts";
import type { CloudBaseClient } from "./client";
import { jsonSemanticEqual } from "../../app/jsonSemanticEqual";

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly document: unknown;
  readonly schema_version: number;
  readonly cloud_revision: number | string;
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

function summaryFromRow(row: ProjectRow): Result<CloudProjectSummary, CloudProjectError> {
  const revision = Number(row.cloud_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) return err({ kind: "invalid-snapshot" });
  return ok({
    projectId: row.id as ProjectId,
    name: row.name,
    schemaVersion: row.schema_version,
    cloudRevision: revision,
    updatedAt: row.updated_at,
  });
}

function snapshotFromRow(row: ProjectRow): Result<CloudProjectSnapshot, CloudProjectError> {
  const summary = summaryFromRow(row);
  if (!summary.ok) return summary;
  if (!isBackup(row.document)) return err({ kind: "invalid-snapshot" });
  return ok({ ...summary.value, document: row.document });
}

export class CloudBaseProjectCloud implements ProjectCloud {
  constructor(private readonly client: CloudBaseClient, private readonly account: AccountSession) {}

  private async userId(): Promise<Result<string, CloudProjectError>> {
    const current = await this.account.getCurrentUser();
    return current.ok && current.value ? ok(current.value.id) : err({ kind: "unauthenticated" });
  }

  async list(): Promise<Result<readonly CloudProjectSummary[], CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    try {
      const { data, error } = await this.client.rdb().from("projects")
        .select("id,name,schema_version,cloud_revision,updated_at")
        .eq("owner_id", userId.value)
        .order("updated_at", { ascending: false });
      if (error || !data) return err(unavailable());
      const summaries: CloudProjectSummary[] = [];
      for (const row of data as ProjectRow[]) {
        const summary = summaryFromRow(row);
        if (!summary.ok) return summary;
        summaries.push(summary.value);
      }
      return ok(summaries);
    } catch {
      return err(unavailable());
    }
  }

  async pull(projectId: ProjectId): Promise<Result<CloudProjectSnapshot, CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    try {
      const { data, error } = await this.client.rdb().from("projects")
        .select("id,name,document,schema_version,cloud_revision,updated_at")
        .eq("id", projectId)
        .eq("owner_id", userId.value)
        .maybeSingle();
      if (error) return err(unavailable());
      return data ? snapshotFromRow(data as ProjectRow) : err({ kind: "not-found", projectId });
    } catch {
      return err(unavailable());
    }
  }

  private async reconcilePush(input: PushCloudProjectInput, nextRevision: number): Promise<Result<CloudProjectSnapshot, CloudProjectError>> {
    const existing = await this.pull(input.projectId);
    if (!existing.ok) return existing.error.kind === "not-found" ? err(unavailable()) : existing;
    if (existing.value.cloudRevision === nextRevision
      && existing.value.name === input.name
      && existing.value.schemaVersion === input.schemaVersion
      && jsonSemanticEqual(existing.value.document, input.document)) return existing;
    if (existing.value.cloudRevision === input.expectedCloudRevision) return err(unavailable());
    return err({ kind: "conflict", expectedRevision: input.expectedCloudRevision, actualRevision: existing.value.cloudRevision });
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
    const committed: CloudProjectSnapshot = {
      projectId: input.projectId,
      name: input.name,
      schemaVersion: input.schemaVersion,
      cloudRevision: nextRevision,
      updatedAt: values.updated_at,
      document: input.document,
    };
    try {
      if (input.expectedCloudRevision === null) {
        const { error } = await this.client.rdb().from("projects")
          .insert({ id: input.projectId, owner_id: userId.value, ...values });
        return error ? this.reconcilePush(input, nextRevision) : ok(committed);
      }

      const { count, error } = await this.client.rdb().from("projects")
        .update(values, { count: "exact" })
        .eq("id", input.projectId)
        .eq("owner_id", userId.value)
        .eq("cloud_revision", input.expectedCloudRevision);
      if (!error && count === 1) return ok(committed);
      return this.reconcilePush(input, nextRevision);
    } catch {
      return this.reconcilePush(input, nextRevision);
    }
  }

  async delete(projectId: ProjectId, expectedCloudRevision: number): Promise<Result<void, CloudProjectError>> {
    const userId = await this.userId();
    if (!userId.ok) return userId;
    try {
      const { count, error } = await this.client.rdb().from("projects")
        .delete({ count: "exact" })
        .eq("id", projectId)
        .eq("owner_id", userId.value)
        .eq("cloud_revision", expectedCloudRevision);
      if (error) return err(unavailable());
      if (count === 1) return ok(undefined);
      const existing = await this.pull(projectId);
      if (!existing.ok) return existing.error.kind === "not-found" ? ok(undefined) : existing;
      return err({ kind: "conflict", expectedRevision: expectedCloudRevision, actualRevision: existing.value.cloudRevision });
    } catch { return err(unavailable()); }
  }
}
