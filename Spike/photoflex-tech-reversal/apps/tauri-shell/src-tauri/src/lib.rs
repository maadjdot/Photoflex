mod exports;
mod sources;
mod workspace;

use serde::Serialize;
use tauri::http::{Response, StatusCode};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    framework: &'static str,
    environment_id: String,
    versions: serde_json::Value,
}

fn app_data_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

#[tauri::command]
fn diagnostics() -> Diagnostics {
    Diagnostics {
        framework: "tauri",
        environment_id: std::env::var("PHOTOFLEX_ENVIRONMENT_ID")
            .unwrap_or_else(|_| "tauri-unlocked".into()),
        versions: serde_json::json!({ "tauri": "2.11.5", "rust": option_env!("RUSTC_VERSION").unwrap_or("captured by env tool"), "sqlite": rusqlite::version() }),
    }
}

#[tauri::command]
fn workspace_open(app: AppHandle, project_id: String) -> Result<workspace::WorkspaceOpen, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).open(project_id)
}

#[tauri::command]
fn workspace_migrate(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).open(project_id.clone())?;
    Ok(
        serde_json::json!({ "jobId": format!("migration-{project_id}"), "state": "succeeded", "completed": 1, "total": 1, "errors": [], "emittedAt": "completed" }),
    )
}

#[tauri::command]
fn workspace_autosave(
    app: AppHandle,
    project_id: String,
    expected_revision: u64,
    bytes: Vec<u8>,
) -> Result<workspace::WorkspaceSnapshot, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).autosave(
        project_id,
        expected_revision,
        bytes,
    )
}

#[tauri::command]
fn workspace_create_snapshot(
    app: AppHandle,
    project_id: String,
) -> Result<workspace::WorkspaceSnapshot, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).create_snapshot(project_id)
}

#[tauri::command]
fn workspace_restore_snapshot(
    app: AppHandle,
    project_id: String,
    snapshot_id: String,
) -> Result<workspace::WorkspaceSnapshot, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).restore_snapshot(project_id, snapshot_id)
}

#[tauri::command]
fn workspace_verify_recovery(
    app: AppHandle,
    project_id: String,
) -> Result<workspace::RecoveryResult, String> {
    workspace::WorkspaceService::new(app_data_root(&app)?).verify_recovery(project_id)
}

#[tauri::command]
fn source_request_folder_grant(
    app: AppHandle,
    sources: State<'_, sources::SourceService>,
) -> Result<sources::SourceGrant, String> {
    let selected = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .ok_or_else(|| "folder selection cancelled".to_string())?;
    let folder = selected.into_path().map_err(|error| error.to_string())?;
    sources.register_folder(folder)
}

#[tauri::command]
fn source_restore_grant(
    sources: State<'_, sources::SourceService>,
    source_id: String,
) -> Result<sources::SourceGrant, String> {
    sources.restore_grant(source_id)
}

#[tauri::command]
fn source_query(
    sources: State<'_, sources::SourceService>,
    source_id: String,
    offset: usize,
    limit: usize,
) -> Result<Vec<sources::SourceEntry>, String> {
    sources.query(source_id, offset, limit)
}

#[tauri::command]
fn export_start_pdf(
    queue: State<'_, exports::ExportQueue>,
    request: exports::ExportRequest,
) -> Result<serde_json::Value, String> {
    queue
        .start_pdf(request)
        .map(|job_id| serde_json::json!({ "jobId": job_id }))
}

#[tauri::command]
fn export_status(
    queue: State<'_, exports::ExportQueue>,
    job_id: String,
) -> Result<exports::JobEvent, String> {
    queue.status(job_id)
}

#[tauri::command]
fn export_cancel(
    queue: State<'_, exports::ExportQueue>,
    job_id: String,
) -> Result<exports::JobEvent, String> {
    queue.cancel(job_id)
}

#[tauri::command]
fn export_retry(
    queue: State<'_, exports::ExportQueue>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    queue
        .retry(job_id)
        .map(|new_job_id| serde_json::json!({ "jobId": new_job_id }))
}

#[tauri::command]
fn export_save_pdf(
    app: AppHandle,
    queue: State<'_, exports::ExportQueue>,
    job_id: String,
) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("保存 PhotoFlex PDF")
        .set_file_name("photoflex-benchmark.pdf")
        .add_filter("PDF", &["pdf"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let destination = selected.into_path().map_err(|error| error.to_string())?;
    queue.save_pdf_to(&job_id, &destination)?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

#[tauri::command]
fn export_save_json(
    app: AppHandle,
    content: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let file_name = if suggested_name.is_empty() {
        "photoflex-evidence.json"
    } else {
        &suggested_name
    };
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("保存 PhotoFlex 测试证据")
        .set_file_name(file_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let destination = selected.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&destination, content.as_bytes()).map_err(|error| error.to_string())?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("photoflex-source", |context, request| {
            let parts = request
                .uri()
                .path()
                .split('/')
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>();
            let thumbnail = request
                .uri()
                .query()
                .map(|query| query.split('&').any(|part| part == "kind=thumbnail"))
                .unwrap_or(false);
            let result = if let ["photo", source_id, photo_id] = parts.as_slice() {
                context
                    .app_handle()
                    .state::<sources::SourceService>()
                    .read_proxy(source_id, photo_id, thumbnail)
            } else {
                Err("invalid source proxy URL".to_string())
            };
            match result {
                Ok((bytes, content_type)) => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", content_type)
                    .header("Cache-Control", "private, max-age=3600")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .expect("valid source response"),
                Err(error) => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .header("Content-Type", "text/plain; charset=utf-8")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(error.into_bytes())
                    .expect("valid source error response"),
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(sources::SourceService::new(root.clone()));
            app.manage(exports::ExportQueue::new(root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            diagnostics,
            workspace_open,
            workspace_migrate,
            workspace_autosave,
            workspace_create_snapshot,
            workspace_restore_snapshot,
            workspace_verify_recovery,
            source_request_folder_grant,
            source_restore_grant,
            source_query,
            export_start_pdf,
            export_status,
            export_cancel,
            export_retry,
            export_save_pdf,
            export_save_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running PhotoFlex Tauri spike");
}
