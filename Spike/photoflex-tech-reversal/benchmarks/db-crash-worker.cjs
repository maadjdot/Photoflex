const { DatabaseSync } = require("node:sqlite");

const databasePath = process.argv[2];
if (!databasePath) process.exit(2);
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; BEGIN IMMEDIATE;");
database.prepare("UPDATE project_state SET revision = revision + 1, payload = ?, sha256 = ?, updated_at = ? WHERE singleton = 1")
  .run(new Uint8Array([9, 9, 9]), "intentionally-invalid-hash", new Date().toISOString());
process.exit(86);
