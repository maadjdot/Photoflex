const { createHash, randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const EMPTY_HASH = createHash("sha256").update("").digest("hex");

function assertProjectId(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) throw new Error("Invalid project ID");
}

function applyMigrations(database, options = {}) {
  const faultAfterStep = options.faultAfterStep ?? -1;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    if (faultAfterStep === 0) throw new Error("Injected migration fault at step 0");
    const version = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get().version;
    if (version < 1) {
      database.exec(`
        CREATE TABLE project_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          revision INTEGER NOT NULL,
          payload BLOB NOT NULL,
          sha256 TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE snapshots (
          id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL,
          payload BLOB NOT NULL,
          sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      if (faultAfterStep === 1) throw new Error("Injected migration fault at step 1");
      database.prepare("INSERT INTO project_state (singleton, revision, payload, sha256, updated_at) VALUES (1, 0, ?, ?, ?)")
        .run(new Uint8Array(), EMPTY_HASH, new Date().toISOString());
      database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
    }
    if (faultAfterStep === 2) throw new Error("Injected migration fault at step 2");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function readState(database) {
  const row = database.prepare("SELECT revision, payload, sha256, updated_at FROM project_state WHERE singleton = 1").get();
  if (!row) throw new Error("Project state is missing");
  return row;
}

function snapshotResult(id, row, createdAt = new Date().toISOString()) {
  return { id, revision: Number(row.revision), sha256: String(row.sha256), createdAt };
}

function createWorkspaceService(appDataPath) {
  const root = join(appDataPath, "spike-workspaces");

  async function withDatabase(projectId, operation) {
    assertProjectId(projectId);
    const projectDir = join(root, projectId);
    await mkdir(projectDir, { recursive: true });
    const database = new DatabaseSync(join(projectDir, "workspace.sqlite"));
    try {
      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      applyMigrations(database);
      return operation(database);
    } finally {
      database.close();
    }
  }

  return {
    async open({ projectId }) {
      return withDatabase(projectId, (database) => {
        const state = readState(database);
        return { projectId, revision: Number(state.revision) };
      });
    },

    async migrate({ projectId }) {
      await withDatabase(projectId, () => undefined);
      return { jobId: `migration-${projectId}`, state: "succeeded", completed: 1, total: 1, errors: [], emittedAt: new Date().toISOString() };
    },

    async autosave({ projectId, expectedRevision, bytes }) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid expected revision");
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 50 * 1024 * 1024) throw new Error("Invalid autosave payload");
      return withDatabase(projectId, (database) => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const current = readState(database);
          if (Number(current.revision) !== expectedRevision) throw new Error("Revision conflict");
          const revision = expectedRevision + 1;
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const createdAt = new Date().toISOString();
          const id = `snapshot-${revision}-${randomUUID()}`;
          database.prepare("UPDATE project_state SET revision = ?, payload = ?, sha256 = ?, updated_at = ? WHERE singleton = 1")
            .run(revision, bytes, sha256, createdAt);
          database.prepare("INSERT INTO snapshots (id, revision, payload, sha256, created_at) VALUES (?, ?, ?, ?, ?)")
            .run(id, revision, bytes, sha256, createdAt);
          database.exec("COMMIT");
          return { id, revision, sha256, createdAt };
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },

    async createSnapshot({ projectId }) {
      return withDatabase(projectId, (database) => {
        const state = readState(database);
        const id = `snapshot-${state.revision}-${randomUUID()}`;
        const createdAt = new Date().toISOString();
        database.prepare("INSERT INTO snapshots (id, revision, payload, sha256, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, state.revision, state.payload, state.sha256, createdAt);
        return snapshotResult(id, state, createdAt);
      });
    },

    async restoreSnapshot({ projectId, snapshotId }) {
      if (typeof snapshotId !== "string" || !snapshotId.startsWith("snapshot-")) throw new Error("Invalid snapshot ID");
      return withDatabase(projectId, (database) => {
        const snapshot = database.prepare("SELECT id, revision, payload, sha256, created_at FROM snapshots WHERE id = ?").get(snapshotId);
        if (!snapshot) throw new Error("Unknown snapshot ID");
        const current = readState(database);
        const revision = Number(current.revision) + 1;
        const restoredAt = new Date().toISOString();
        database.exec("BEGIN IMMEDIATE");
        try {
          database.prepare("UPDATE project_state SET revision = ?, payload = ?, sha256 = ?, updated_at = ? WHERE singleton = 1")
            .run(revision, snapshot.payload, snapshot.sha256, restoredAt);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
        return { id: String(snapshot.id), revision, sha256: String(snapshot.sha256), createdAt: restoredAt };
      });
    },

    async verifyRecovery({ projectId }) {
      return withDatabase(projectId, (database) => {
        const state = readState(database);
        const payload = Buffer.from(state.payload);
        const calculated = createHash("sha256").update(payload).digest("hex");
        return { valid: calculated === state.sha256, revision: Number(state.revision), sha256: calculated };
      });
    }
  };
}

module.exports = { EMPTY_HASH, applyMigrations, createWorkspaceService };
