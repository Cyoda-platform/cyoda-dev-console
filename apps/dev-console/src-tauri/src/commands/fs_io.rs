use crate::atomic_write::write_atomic;
use crate::paths::resolve_inside_root;
use crate::save_origin::SaveOriginState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub path: String,
    pub contents: String,
    pub last_modified: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub path: String,
    pub last_modified: String,
    pub size_bytes: u64,
}

pub fn lm_rfc3339(meta: &std::fs::Metadata) -> String {
    chrono::DateTime::<chrono::Utc>::from(
        meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
    )
    .to_rfc3339()
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    active_root: Option<String>,
) -> Result<ReadResult, String> {
    let p = PathBuf::from(&path);
    if let Some(root) = active_root.as_deref() {
        resolve_inside_root(std::path::Path::new(root), &p).map_err(|e| e.to_string())?;
    }
    let contents = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    Ok(ReadResult {
        path,
        contents,
        last_modified: lm_rfc3339(&meta),
        size_bytes: meta.len(),
    })
}

#[tauri::command]
pub async fn write_text_file_with_confirmed_overwrite(
    path: String,
    contents: String,
    active_root: Option<String>,
    save_origin: State<'_, SaveOriginState>,
) -> Result<WriteResult, String> {
    let p = PathBuf::from(&path);
    if let Some(root) = active_root.as_deref() {
        resolve_inside_root(std::path::Path::new(root), &p).map_err(|e| e.to_string())?;
    }
    write_atomic(&p, contents.as_bytes()).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let lm = lm_rfc3339(&meta);
    save_origin.mark(&p, &lm).await;
    Ok(WriteResult {
        path,
        last_modified: lm,
        size_bytes: meta.len(),
    })
}

#[tauri::command]
pub async fn save_file_as(
    app: AppHandle,
    contents: String,
    save_origin: State<'_, SaveOriginState>,
) -> Result<Option<WriteResult>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Save workflow as")
        .add_filter("JSON", &["json"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let chosen = rx.await.map_err(|e| e.to_string())?;
    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let p = PathBuf::from(file_path.to_string());
    write_atomic(&p, contents.as_bytes()).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let lm = lm_rfc3339(&meta);
    save_origin.mark(&p, &lm).await;
    Ok(Some(WriteResult {
        path: p.to_string_lossy().into_owned(),
        last_modified: lm,
        size_bytes: meta.len(),
    }))
}
