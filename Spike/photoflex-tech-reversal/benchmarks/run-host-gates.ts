import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const executeFile = promisify(execFile);
const require = createRequire(import.meta.url);
const { applyMigrations, createWorkspaceService } = require("../apps/electron-shell/services/workspace.cjs");
const { createSourceService, within } = require("../apps/electron-shell/services/sources.cjs");
const { createExportService } = require("../apps/electron-shell/services/exports.cjs");

const root = process.cwd();
const sourceRoot = process.env.PHOTOFLEX_TEST_SOURCE ?? join(root, "..", "test", "stress-myphoto");
const exiftoolPath = process.env.PHOTOFLEX_EXIFTOOL ?? join(root, "tools", "exiftool", "exiftool.exe");
const outputRoot = join(root, "results", "raw");
const IMAGE_EXTENSION = /\.(jpe?g|png|tiff?|webp|heic|heif)$/i;

async function walk(directory: string, output: string[] = []): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) await walk(candidate, output);
    else if (entry.isFile() && IMAGE_EXTENSION.test(entry.name)) output.push(candidate);
  }
  return output;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function fingerprints(paths: string[]) {
  return Promise.all(paths.map(async (path) => {
    const file = await stat(path);
    return { path, relativePath: relative(sourceRoot, path), bytes: file.size, mtimeMs: file.mtimeMs, sha256: await sha256(path) };
  }));
}

function runCrashWorker(databasePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "benchmarks", "db-crash-worker.cjs"), databasePath], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

async function runExifTool(samplePaths: string[]) {
  const before = await fingerprints(samplePaths);
  const started = performance.now();
  const { stdout: version } = await executeFile(exiftoolPath, ["-ver"], { windowsHide: true });
  const { stdout } = await executeFile(exiftoolPath, ["-json", "-n", "-FileName", "-ImageWidth", "-ImageHeight", "-Orientation", "-ColorSpace", "-ICC_Profile:ProfileDescription", ...samplePaths], { maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  const metadata = JSON.parse(stdout) as Array<Record<string, unknown>>;
  const after = await fingerprints(samplePaths);
  return {
    version: version.trim(),
    elapsedMs: performance.now() - started,
    requested: samplePaths.length,
    parsed: metadata.length,
    metadata,
    originalsUnchanged: before.every((entry, index) => {
      const next = after[index];
      return next && entry.path === next.path && entry.mtimeMs === next.mtimeMs && entry.sha256 === next.sha256;
    }),
    fingerprints: after
  };
}

async function runDbGate(temporaryRoot: string) {
  const migrationFaults = [];
  for (let run = 0; run < 20; run += 1) {
    const database = new DatabaseSync(join(temporaryRoot, `migration-${run}.sqlite`));
    let rolledBack = false;
    try {
      applyMigrations(database, { faultAfterStep: run % 3 });
    } catch {
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
      rolledBack = tables.length === 0;
    } finally {
      database.close();
    }
    migrationFaults.push({ run, rolledBack });
  }

  const appData = join(temporaryRoot, "db-app-data");
  const workspace = createWorkspaceService(appData);
  const initial = await workspace.autosave({ projectId: "crash-project", expectedRevision: 0, bytes: new TextEncoder().encode("known-good-state") });
  const databasePath = join(appData, "spike-workspaces", "crash-project", "workspace.sqlite");
  const crashRuns = [];
  for (let run = 0; run < 20; run += 1) {
    const exitCode = await runCrashWorker(databasePath);
    const recovery = await workspace.verifyRecovery({ projectId: "crash-project" });
    crashRuns.push({ run, exitCode, recovery, completeOldTransaction: exitCode === 86 && recovery.valid && recovery.revision === 1 && recovery.sha256 === initial.sha256 });
  }
  const snapshots = [];
  for (let run = 0; run < 20; run += 1) snapshots.push(await workspace.createSnapshot({ projectId: "crash-project" }));
  return {
    migrationRollback20of20: migrationFaults.every((run) => run.rolledBack),
    crashRecovery20of20: crashRuns.every((run) => run.completeOldTransaction),
    snapshotHash20of20: snapshots.every((snapshot) => snapshot.sha256 === initial.sha256),
    migrationFaults,
    crashRuns,
    snapshots
  };
}

async function runSourceGate(temporaryRoot: string) {
  const registryRoot = join(temporaryRoot, "source-registry");
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [sourceRoot] }) };
  const source = createSourceService(dialog, registryRoot);
  const grant = await source.requestFolderGrant();
  const entries = [];
  for (let offset = 0; ; offset += 500) {
    const page = await source.query({ sourceId: grant.sourceId, offset, limit: 500 });
    entries.push(...page);
    if (page.length < 500) break;
  }
  const restoreRuns = [];
  for (let run = 0; run < 10; run += 1) {
    const restored = createSourceService({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }, registryRoot);
    const result = await restored.restoreGrant({ sourceId: grant.sourceId });
    const page = await restored.query({ sourceId: grant.sourceId, offset: 0, limit: 20 });
    restoreRuns.push({ run, restored: result.restored, count: page.length });
  }
  const maliciousCandidates = [join(sourceRoot, "..", "outside.jpg"), dirname(sourceRoot), join(sourceRoot, "..", "..", "escape.jpg")];
  return {
    sourceId: grant.sourceId,
    scannedPhotos: entries.length,
    firstPageProxyUrlsValid: entries.slice(0, 20).every((entry: { proxyUrl: string }) => entry.proxyUrl.startsWith("photoflex-source://photo/")),
    restore10of10: restoreRuns.every((run) => run.restored && run.count === Math.min(20, entries.length)),
    maliciousPathsRejected: maliciousCandidates.every((candidate) => !within(sourceRoot, candidate)),
    restoreRuns
  };
}

async function runPdfGate(temporaryRoot: string) {
  const queue = createExportService(join(temporaryRoot, "exports"));
  const pageIds = Array.from({ length: 200 }, (_, index) => `photo-${String(index).padStart(5, "0")}`);
  const completionRuns = [];
  for (let run = 0; run < 7; run += 1) {
    const started = performance.now();
    const job = await queue.startPdf({ projectId: "host-gate", pageIds });
    const terminal = await queue.waitForTerminal(job.jobId, 10_000);
    await queue.waitForWorkerStop(job.jobId, 2_000);
    const path = await queue.outputFileForTest(job.jobId);
    const header = (await (await import("node:fs/promises")).readFile(path, "utf8")).slice(0, 8);
    completionRuns.push({ run, jobId: job.jobId, state: terminal.state, elapsedMs: performance.now() - started, validHeader: header.startsWith("%PDF-1.4") });
  }
  const cancellationRuns = [];
  const retryRuns = [];
  for (let run = 0; run < 5; run += 1) {
    const job = await queue.startPdf({ projectId: "host-gate", pageIds });
    const cancelStarted = performance.now();
    const acknowledgement = await queue.cancel({ jobId: job.jobId });
    const acknowledgementMs = performance.now() - cancelStarted;
    const terminal = await queue.waitForTerminal(job.jobId, 2_000);
    const stopStarted = performance.now();
    await queue.waitForWorkerStop(job.jobId, 2_000);
    const workerStopMs = performance.now() - stopStarted;
    let temporaryCleaned = false;
    try { await access(queue.temporaryFileForTest(job.jobId)); } catch { temporaryCleaned = true; }
    cancellationRuns.push({ run, acknowledgementMs, workerStopMs, state: terminal.state, temporaryCleaned, acknowledged: acknowledgement.state === "cancelled" });
    const retryStarted = performance.now();
    const retry = await queue.retry({ jobId: job.jobId });
    const retryTerminal = await queue.waitForTerminal(retry.jobId, 10_000);
    await queue.waitForWorkerStop(retry.jobId, 2_000);
    retryRuns.push({ run, state: retryTerminal.state, elapsedMs: performance.now() - retryStarted });
  }
  return {
    completed7of7: completionRuns.every((run) => run.state === "succeeded" && run.validHeader),
    cancelled5of5: cancellationRuns.every((run) => run.state === "cancelled" && run.temporaryCleaned && run.acknowledgementMs <= 250 && run.workerStopMs <= 2000),
    retried5of5: retryRuns.every((run) => run.state === "succeeded"),
    completionRuns,
    cancellationRuns,
    retryRuns
  };
}

await access(sourceRoot);
await access(exiftoolPath);
const allPhotos = await walk(sourceRoot);
if (allPhotos.length < 20) throw new Error(`T-03 requires at least 20 supported photos; found ${allPhotos.length}`);
const samplePaths = allPhotos.slice(0, 20);
const temporaryRoot = await mkdtemp(join(tmpdir(), "photoflex-host-gates-"));
try {
  const startedAt = new Date().toISOString();
  const exiftool = await runExifTool(samplePaths);
  const database = await runDbGate(temporaryRoot);
  const source = await runSourceGate(temporaryRoot);
  const pdf = await runPdfGate(temporaryRoot);
  const output = {
    scenario: "windows-electron-host-gates",
    framework: "electron",
    startedAt,
    completedAt: new Date().toISOString(),
    sourceRoot,
    sourceFileCount: allPhotos.length,
    exiftool,
    database,
    source,
    pdf,
    verdicts: {
      "DB-01": database.migrationRollback20of20 && database.crashRecovery20of20 && database.snapshotHash20of20 ? "pass" : "fail",
      "T-03-metadata-and-original-safety": exiftool.parsed === 20 && exiftool.originalsUnchanged ? "pass" : "fail",
      "T-04-background-pdf": pdf.completed7of7 && pdf.cancelled5of5 && pdf.retried5of5 ? "pass" : "fail",
      "T-05-source-boundary": source.scannedPhotos === allPhotos.length && source.restore10of10 && source.maliciousPathsRejected ? "pass" : "fail"
    },
    exclusions: ["T-03 clean-install 5/5 is a packaging test and is not claimed by this command", "T-06 color and macOS evidence remain manual/platform tests"]
  };
  await mkdir(outputRoot, { recursive: true });
  const outputPath = join(outputRoot, `host-gates-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(outputPath);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
