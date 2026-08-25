import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workspaceContractSuite } from "../../../packages/host-contract/test/contract-suite";

const require = createRequire(import.meta.url);
const { applyMigrations, createWorkspaceService } = require("../services/workspace.cjs") as {
  applyMigrations(database: DatabaseSync, options?: { faultAfterStep?: number }): void;
  createWorkspaceService(path: string): {
    open(payload: { projectId: string }): Promise<{ projectId: string; revision: number }>;
    autosave(payload: { projectId: string; expectedRevision: number; bytes: Uint8Array }): Promise<{ id: string; revision: number; sha256: string }>;
    createSnapshot(payload: { projectId: string }): Promise<{ id: string; revision: number; sha256: string }>;
    restoreSnapshot(payload: { projectId: string; snapshotId: string }): Promise<{ revision: number; sha256: string }>;
    verifyRecovery(payload: { projectId: string }): Promise<{ valid: boolean; revision: number; sha256: string }>;
  };
};
const { createSourceService, within } = require("../services/sources.cjs") as {
  createSourceService(dialog: unknown, registryRoot: string): {
    requestFolderGrant(): Promise<{ sourceId: string; restored: boolean }>;
    restoreGrant(payload: { sourceId: string }): Promise<{ sourceId: string; restored: boolean }>;
    query(payload: { sourceId: string; offset: number; limit: number }): Promise<Array<{ photoId: string; relativePath: string; proxyUrl: string }>>;
    resolveProxyRequest(url: string): Promise<{ absolutePath: string; contentType: string; cacheKey: string }>;
  };
  within(root: string, candidate: string): boolean;
};
const { createExportService } = require("../services/exports.cjs") as {
  createExportService(path: string): {
    startPdf(request: { projectId: string; pageIds: string[] }): Promise<{ jobId: string }>;
    cancel(payload: { jobId: string }): Promise<{ state: string }>;
    retry(payload: { jobId: string }): Promise<{ jobId: string }>;
    waitForTerminal(jobId: string): Promise<{ state: string; completed: number; total: number }>;
    waitForWorkerStop(jobId: string): Promise<{ code: number }>;
    outputFileForTest(jobId: string): Promise<string>;
    temporaryFileForTest(jobId: string): string;
  };
};
let testRoot = "";

beforeAll(async () => { testRoot = await mkdtemp(join(tmpdir(), "photoflex-electron-contract-")); });
afterAll(async () => { if (testRoot) await rm(testRoot, { recursive: true, force: true }); });

workspaceContractSuite("Electron", async () => createWorkspaceService(testRoot) as never);

describe("Electron DB-01 SQLite/WAL recovery", () => {
  it("rolls back all 20 injected migration failures", async () => {
    for (let run = 0; run < 20; run += 1) {
      const database = new DatabaseSync(join(testRoot, `migration-fault-${run}.sqlite`));
      expect(() => applyMigrations(database, { faultAfterStep: run % 3 })).toThrow("Injected migration fault");
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
      expect(tables).toEqual([]);
      database.close();
    }
  });

  it("keeps snapshot hashes stable across overwrite and restore", async () => {
    const workspace = createWorkspaceService(testRoot);
    const first = await workspace.autosave({ projectId: "snapshot-project", expectedRevision: 0, bytes: new TextEncoder().encode("version-one") });
    const stable = await workspace.createSnapshot({ projectId: "snapshot-project" });
    expect(stable.sha256).toBe(first.sha256);
    await workspace.autosave({ projectId: "snapshot-project", expectedRevision: 1, bytes: new TextEncoder().encode("version-two") });
    const restored = await workspace.restoreSnapshot({ projectId: "snapshot-project", snapshotId: stable.id });
    expect(restored).toMatchObject({ revision: 3, sha256: first.sha256 });
    await expect(workspace.verifyRecovery({ projectId: "snapshot-project" })).resolves.toEqual({ valid: true, revision: 3, sha256: first.sha256 });
  });
});

describe("Electron Source grant boundary", () => {
  it("accepts descendants and rejects siblings or parent traversal", () => {
    const root = join(testRoot, "source");
    expect(within(root, join(root, "album", "photo.jpg"))).toBe(true);
    expect(within(root, join(testRoot, "outside.jpg"))).toBe(false);
    expect(within(root, join(root, "..", "outside.jpg"))).toBe(false);
  });

  it("recursively pages real images, restores the grant, and never follows symlinks", async () => {
    const sourceRoot = join(testRoot, "source-fixture");
    const outsideRoot = join(testRoot, "outside-fixture");
    const registryRoot = join(testRoot, "grant-registry");
    await mkdir(join(sourceRoot, "nested"), { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(join(sourceRoot, "one.jpg"), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    await writeFile(join(sourceRoot, "nested", "two.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(join(sourceRoot, "ignore.txt"), "not a photo");
    await writeFile(join(outsideRoot, "outside.jpg"), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    try {
      await symlink(join(outsideRoot, "outside.jpg"), join(sourceRoot, "escaped.jpg"), "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }

    const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [sourceRoot] }) };
    const first = createSourceService(dialog, registryRoot);
    const grant = await first.requestFolderGrant();
    const firstPage = await first.query({ sourceId: grant.sourceId, offset: 0, limit: 1 });
    const secondPage = await first.query({ sourceId: grant.sourceId, offset: 1, limit: 10 });
    expect([...firstPage, ...secondPage].map((entry) => entry.relativePath)).toEqual([join("nested", "two.png"), "one.jpg"]);
    expect([...firstPage, ...secondPage].every((entry) => entry.proxyUrl.startsWith("photoflex-source://photo/"))).toBe(true);
    const resolved = await first.resolveProxyRequest(firstPage[0]!.proxyUrl);
    expect(await readFile(resolved.absolutePath)).toHaveLength(4);
    expect(resolved.cacheKey).toMatch(/^[a-f0-9]{64}$/);

    const restoredService = createSourceService({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }, registryRoot);
    await expect(restoredService.restoreGrant({ sourceId: grant.sourceId })).resolves.toMatchObject({ sourceId: grant.sourceId, restored: true });
    await expect(restoredService.query({ sourceId: grant.sourceId, offset: 0, limit: 10 })).resolves.toHaveLength(2);
  });
});

describe("Electron T-04 background PDF queue", () => {
  it("generates 200 pages and supports cancellation, cleanup, and retry", async () => {
    const exports = createExportService(join(testRoot, "export-fixture"));
    const pageIds = Array.from({ length: 200 }, (_, index) => `photo-${index}`);
    const completed = await exports.startPdf({ projectId: "pdf-project", pageIds });
    await expect(exports.waitForTerminal(completed.jobId)).resolves.toMatchObject({ state: "succeeded", completed: 200, total: 200 });
    await expect(exports.waitForWorkerStop(completed.jobId)).resolves.toMatchObject({ code: 0 });
    const pdf = await readFile(await exports.outputFileForTest(completed.jobId), "utf8");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) ?? [])).toHaveLength(200);

    const cancelled = await exports.startPdf({ projectId: "pdf-project", pageIds });
    await expect(exports.cancel({ jobId: cancelled.jobId })).resolves.toMatchObject({ state: "cancelled" });
    await expect(exports.waitForTerminal(cancelled.jobId)).resolves.toMatchObject({ state: "cancelled" });
    await expect(exports.waitForWorkerStop(cancelled.jobId)).resolves.toMatchObject({ code: 0 });
    await expect(access(exports.temporaryFileForTest(cancelled.jobId))).rejects.toThrow();

    const retried = await exports.retry({ jobId: cancelled.jobId });
    await expect(exports.waitForTerminal(retried.jobId)).resolves.toMatchObject({ state: "succeeded", completed: 200 });
  });
});
