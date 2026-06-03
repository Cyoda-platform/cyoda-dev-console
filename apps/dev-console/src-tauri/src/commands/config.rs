use crate::atomic_write::write_atomic;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub async fn load_app_config(app: AppHandle) -> Result<Value, String> {
    let path = config_file(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({
            "version": 1,
            "activeProjectId": null,
            "recentProjects": []
        }));
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_app_config(app: AppHandle, config: Value) -> Result<(), String> {
    let path = config_file(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    write_atomic(&path, json.as_bytes()).map_err(|e| e.to_string())
}
