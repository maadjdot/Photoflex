import { describe, expect, it } from "vitest";
import { ok, type AccountSession, type ProjectBackupV1, type ProjectId } from "../../contracts";
import { CloudBaseProjectCloud } from "./CloudBaseProjectCloud";
import type { CloudBaseClient } from "./client";

const projectId = "11111111-1111-4111-8111-111111111111" as ProjectId;
const backup = { format: "photoflex-project-backup", schemaVersion: 3, project: { name: "Film" } } as ProjectBackupV1;

function fixture() {
  const rows = new Map<string, Record<string, unknown>>();
  let pullUnavailable = false;
  let loseUpdateResponse = false;
  let updateUnavailable = false;
  const account = {
    getCurrentUser: async () => ok({ id: "owner-a" }),
  } as AccountSession;
  const client = {
    rdb: () => ({
      from: (table: string) => {
        expect(table).toBe("projects");
        const filters: Record<string, unknown> = {};
        let updateValues: Record<string, unknown> | undefined;
        let deleting = false;
        return {
          select() { return this; },
          eq(column: string, value: unknown) { filters[column] = value; return this; },
          async order() {
            return { data: [...rows.values()].filter((row) => row.owner_id === filters.owner_id), error: null };
          },
          async maybeSingle() {
            if (pullUnavailable) return { data: null, error: { code: "unavailable" } };
            return { data: rows.get(String(filters.id))?.owner_id === filters.owner_id ? rows.get(String(filters.id)) : null, error: null };
          },
          async insert(row: Record<string, unknown>) {
            if (rows.has(String(row.id))) return { error: { code: "23505" } };
            rows.set(String(row.id), row);
            return { error: null };
          },
          update(values: Record<string, unknown>) { updateValues = values; return this; },
          delete() { deleting = true; return this; },
          then(resolve: (value: unknown) => void) {
            if (updateUnavailable && !deleting) { resolve({ count: null, error: { code: "unavailable" } }); return; }
            const row = rows.get(String(filters.id));
            if (row && row.owner_id === filters.owner_id && row.cloud_revision === filters.cloud_revision) {
              if (deleting) rows.delete(String(filters.id));
              else rows.set(String(filters.id), { ...row, ...updateValues });
              resolve(loseUpdateResponse && !deleting ? { count: null, error: { code: "unavailable" } } : { count: 1, error: null });
            } else resolve({ count: 0, error: null });
          },
        };
      },
    }),
  } as unknown as CloudBaseClient;
  return {
    rows,
    cloud: new CloudBaseProjectCloud(client, account),
    setPullUnavailable(value: boolean) { pullUnavailable = value; },
    setLoseUpdateResponse(value: boolean) { loseUpdateResponse = value; },
    setUpdateUnavailable(value: boolean) { updateUnavailable = value; },
  };
}

describe("CloudBaseProjectCloud", () => {
  it("creates an owner-scoped snapshot and lists it", async () => {
    const { rows, cloud } = fixture();
    const pushed = await cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    expect(pushed.ok && pushed.value.cloudRevision).toBe(0);
    expect(rows.get(projectId)?.owner_id).toBe("owner-a");
    rows.set("other-project", { id: "other-project", owner_id: "owner-b", name: "Private", schema_version: 3, cloud_revision: 0, updated_at: "2026-09-16" });
    const listed = await cloud.list();
    expect(listed.ok && listed.value.map((item) => item.projectId)).toEqual([projectId]);
  });

  it("only updates the expected revision and reports a conflict otherwise", async () => {
    const { cloud } = fixture();
    const first = await cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    expect(first.ok).toBe(true);
    const updated = await cloud.push({ projectId, name: "Film 2", schemaVersion: 3, document: backup, expectedCloudRevision: 0 });
    expect(updated.ok && updated.value.cloudRevision).toBe(1);
    const stale = await cloud.push({ projectId, name: "Stale", schemaVersion: 3, document: backup, expectedCloudRevision: 0 });
    expect(stale).toEqual({ ok: false, error: { kind: "conflict", expectedRevision: 0, actualRevision: 1 } });
  });

  it("acknowledges a committed insert or update without a follow-up read", async () => {
    const testEnv = fixture();
    testEnv.setPullUnavailable(true);
    const created = await testEnv.cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    expect(created.ok && created.value.cloudRevision).toBe(0);
    const updated = await testEnv.cloud.push({ projectId, name: "Film 2", schemaVersion: 3, document: backup, expectedCloudRevision: 0 });
    expect(updated.ok && updated.value.cloudRevision).toBe(1);
  });

  it("recognizes its own committed update when the write response is lost", async () => {
    const testEnv = fixture();
    await testEnv.cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    testEnv.setLoseUpdateResponse(true);
    const result = await testEnv.cloud.push({ projectId, name: "Film 2", schemaVersion: 3, document: backup, expectedCloudRevision: 0 });
    expect(result.ok && result.value.cloudRevision).toBe(1);
    expect(testEnv.rows.get(projectId)?.cloud_revision).toBe(1);
  });

  it("keeps a failed, uncommitted update retryable instead of calling it a conflict", async () => {
    const testEnv = fixture();
    await testEnv.cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    testEnv.setUpdateUnavailable(true);
    const result = await testEnv.cloud.push({ projectId, name: "Film 2", schemaVersion: 3, document: backup, expectedCloudRevision: 0 });
    expect(result).toEqual({ ok: false, error: { kind: "unavailable", retryable: true } });
    expect(testEnv.rows.get(projectId)?.name).toBe("Film");
  });

  it("deletes only the signed-in owner's expected revision", async () => {
    const { cloud, rows } = fixture();
    await cloud.push({ projectId, name: "Film", schemaVersion: 3, document: backup, expectedCloudRevision: null });
    expect(await cloud.delete(projectId, 1)).toEqual({ ok: false, error: { kind: "conflict", expectedRevision: 1, actualRevision: 0 } });
    expect(rows.has(projectId)).toBe(true);
    expect(await cloud.delete(projectId, 0)).toEqual({ ok: true, value: undefined });
    expect(rows.has(projectId)).toBe(false);
  });
});
