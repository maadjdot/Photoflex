use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const EMPTY_HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOpen {
    pub project_id: String,
    pub revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub id: String,
    pub revision: u64,
    pub sha256: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    pub valid: bool,
    pub revision: u64,
    pub sha256: String,
}

struct CurrentState {
    revision: i64,
    payload: Vec<u8>,
    sha256: String,
}

pub fn validate_project_id(project_id: &str) -> Result<(), String> {
    let valid = !project_id.is_empty()
        && project_id.len() <= 64
        && project_id.chars().enumerate().all(|(index, character)| {
            character.is_ascii_alphanumeric()
                || (index > 0 && (character == '_' || character == '-'))
        });
    valid
        .then_some(())
        .ok_or_else(|| "invalid project ID".to_string())
}

fn now_label() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}

pub fn apply_migrations(
    connection: &Connection,
    fault_after_step: Option<u8>,
) -> Result<(), String> {
    connection
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|error| error.to_string())?;
    let result = (|| -> Result<(), String> {
        connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)").map_err(|error| error.to_string())?;
        if fault_after_step == Some(0) {
            return Err("injected migration fault at step 0".into());
        }
        let version: i64 = connection
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if version < 1 {
            connection
                .execute_batch(
                    "CREATE TABLE project_state (
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
                );",
                )
                .map_err(|error| error.to_string())?;
            if fault_after_step == Some(1) {
                return Err("injected migration fault at step 1".into());
            }
            connection.execute(
                "INSERT INTO project_state (singleton, revision, payload, sha256, updated_at) VALUES (1, 0, ?1, ?2, ?3)",
                params![Vec::<u8>::new(), EMPTY_HASH, now_label()],
            ).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
                    params![now_label()],
                )
                .map_err(|error| error.to_string())?;
        }
        if fault_after_step == Some(2) {
            return Err("injected migration fault at step 2".into());
        }
        Ok(())
    })();
    match result {
        Ok(()) => connection
            .execute_batch("COMMIT")
            .map_err(|error| error.to_string()),
        Err(error) => {
            let _ = connection.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn open_database(root: &Path, project_id: &str) -> Result<Connection, String> {
    validate_project_id(project_id)?;
    let project_dir = root.join(project_id);
    fs::create_dir_all(&project_dir).map_err(|error| error.to_string())?;
    let connection = Connection::open(project_dir.join("workspace.sqlite"))
        .map_err(|error| error.to_string())?;
    connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;").map_err(|error| error.to_string())?;
    apply_migrations(&connection, None)?;
    Ok(connection)
}

fn read_state(connection: &Connection) -> Result<CurrentState, String> {
    connection
        .query_row(
            "SELECT revision, payload, sha256 FROM project_state WHERE singleton = 1",
            [],
            |row| {
                Ok(CurrentState {
                    revision: row.get(0)?,
                    payload: row.get(1)?,
                    sha256: row.get(2)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub struct WorkspaceService {
    root: PathBuf,
}

impl WorkspaceService {
    pub fn new(app_data_root: PathBuf) -> Self {
        Self {
            root: app_data_root.join("spike-workspaces"),
        }
    }

    pub fn open(&self, project_id: String) -> Result<WorkspaceOpen, String> {
        let connection = open_database(&self.root, &project_id)?;
        let state = read_state(&connection)?;
        Ok(WorkspaceOpen {
            project_id,
            revision: u64::try_from(state.revision)
                .map_err(|_| "negative database revision".to_string())?,
        })
    }

    pub fn autosave(
        &self,
        project_id: String,
        expected_revision: u64,
        bytes: Vec<u8>,
    ) -> Result<WorkspaceSnapshot, String> {
        if bytes.len() > 50 * 1024 * 1024 {
            return Err("autosave payload exceeds 50 MB".into());
        }
        let connection = open_database(&self.root, &project_id)?;
        connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|error| error.to_string())?;
        let result = (|| -> Result<WorkspaceSnapshot, String> {
            let current = read_state(&connection)?;
            let expected_revision = i64::try_from(expected_revision)
                .map_err(|_| "revision exceeds SQLite range".to_string())?;
            if current.revision != expected_revision {
                return Err("revision conflict".into());
            }
            let revision = expected_revision + 1;
            let sha256 = hex::encode(Sha256::digest(&bytes));
            let created_at = now_label();
            let id = format!("snapshot-{revision}-{created_at}");
            connection.execute(
                "UPDATE project_state SET revision = ?1, payload = ?2, sha256 = ?3, updated_at = ?4 WHERE singleton = 1",
                params![revision, bytes, sha256, created_at],
            ).map_err(|error| error.to_string())?;
            connection.execute(
                "INSERT INTO snapshots (id, revision, payload, sha256, created_at) SELECT ?1, revision, payload, sha256, ?2 FROM project_state WHERE singleton = 1",
                params![id, created_at],
            ).map_err(|error| error.to_string())?;
            Ok(WorkspaceSnapshot {
                id,
                revision: revision as u64,
                sha256,
                created_at,
            })
        })();
        match result {
            Ok(snapshot) => {
                connection
                    .execute_batch("COMMIT")
                    .map_err(|error| error.to_string())?;
                Ok(snapshot)
            }
            Err(error) => {
                let _ = connection.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }

    pub fn create_snapshot(&self, project_id: String) -> Result<WorkspaceSnapshot, String> {
        let connection = open_database(&self.root, &project_id)?;
        let state = read_state(&connection)?;
        let created_at = now_label();
        let id = format!("snapshot-{}-{created_at}", state.revision);
        connection.execute(
            "INSERT INTO snapshots (id, revision, payload, sha256, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, state.revision, state.payload, state.sha256, created_at],
        ).map_err(|error| error.to_string())?;
        Ok(WorkspaceSnapshot {
            id,
            revision: u64::try_from(state.revision)
                .map_err(|_| "negative database revision".to_string())?,
            sha256: state.sha256,
            created_at,
        })
    }

    pub fn restore_snapshot(
        &self,
        project_id: String,
        snapshot_id: String,
    ) -> Result<WorkspaceSnapshot, String> {
        let connection = open_database(&self.root, &project_id)?;
        let snapshot: Option<CurrentState> = connection
            .query_row(
                "SELECT revision, payload, sha256 FROM snapshots WHERE id = ?1",
                params![snapshot_id],
                |row| {
                    Ok(CurrentState {
                        revision: row.get(0)?,
                        payload: row.get(1)?,
                        sha256: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let snapshot = snapshot.ok_or_else(|| "unknown snapshot ID".to_string())?;
        let revision = read_state(&connection)?.revision + 1;
        let created_at = now_label();
        connection.execute(
            "UPDATE project_state SET revision = ?1, payload = ?2, sha256 = ?3, updated_at = ?4 WHERE singleton = 1",
            params![revision, snapshot.payload, snapshot.sha256, created_at],
        ).map_err(|error| error.to_string())?;
        Ok(WorkspaceSnapshot {
            id: snapshot_id,
            revision: u64::try_from(revision)
                .map_err(|_| "negative database revision".to_string())?,
            sha256: snapshot.sha256,
            created_at,
        })
    }

    pub fn verify_recovery(&self, project_id: String) -> Result<RecoveryResult, String> {
        let connection = open_database(&self.root, &project_id)?;
        let state = read_state(&connection)?;
        let calculated = hex::encode(Sha256::digest(&state.payload));
        Ok(RecoveryResult {
            valid: calculated == state.sha256,
            revision: u64::try_from(state.revision)
                .map_err(|_| "negative database revision".to_string())?,
            sha256: calculated,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("photoflex-tauri-{label}-{}", now_label()))
    }

    #[test]
    fn project_ids_are_identities_not_paths() {
        assert!(validate_project_id("project-01").is_ok());
        assert!(validate_project_id("../escape").is_err());
        assert!(validate_project_id("C:\\absolute").is_err());
    }

    #[test]
    fn migration_faults_roll_back_twenty_of_twenty() {
        let root = test_root("migration");
        fs::create_dir_all(&root).unwrap();
        for run in 0..20 {
            let connection = Connection::open(root.join(format!("fault-{run}.sqlite"))).unwrap();
            assert!(apply_migrations(&connection, Some((run % 3) as u8)).is_err());
            let count: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0)).unwrap();
            assert_eq!(count, 0);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn snapshots_and_recovery_keep_hashes_stable() {
        let root = test_root("snapshot");
        let service = WorkspaceService::new(root.clone());
        let first = service
            .autosave("project".into(), 0, b"version-one".to_vec())
            .unwrap();
        let stable = service.create_snapshot("project".into()).unwrap();
        service
            .autosave("project".into(), 1, b"version-two".to_vec())
            .unwrap();
        let restored = service
            .restore_snapshot("project".into(), stable.id)
            .unwrap();
        assert_eq!(restored.revision, 3);
        assert_eq!(restored.sha256, first.sha256);
        assert!(service.verify_recovery("project".into()).unwrap().valid);
        fs::remove_dir_all(root).unwrap();
    }
}
