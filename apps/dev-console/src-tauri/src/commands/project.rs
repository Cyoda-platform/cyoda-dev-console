use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use crate::scan_registry::ScanRegistryState;

#[derive(Deserialize, Default)]
pub struct ScanOptions {
    #[serde(default)]
    pub workflow_globs: Vec<String>,
    #[serde(default)]
    pub exclude_globs: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub path: String,
    pub relative_path: String,
    pub contents: String,
    pub last_modified: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScanResult {
    pub root: String,
    pub scanned_at: String,
    pub files: Vec<ScannedFile>,
}

#[tauri::command]
pub async fn select_project_root(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |dir| {
        let _ = tx.send(dir);
    });
    let dir = rx.await.map_err(|e| e.to_string())?;
    Ok(dir.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn scan_project(
    root_path: String,
    options: ScanOptions,
    registry: State<'_, ScanRegistryState>,
) -> Result<ProjectScanResult, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", root_path));
    }
    let cancel = registry.begin().await;

    let mut exclude_globs = options.exclude_globs;
    for g in [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/target/**",
        "**/.turbo/**",
        "**/.next/**",
        "**/coverage/**",
    ] {
        exclude_globs.push(g.to_string());
    }

    let workflow_globs = if options.workflow_globs.is_empty() {
        vec!["**/*.json".to_string()]
    } else {
        options.workflow_globs
    };

    let result = tokio::task::spawn_blocking(move || -> Result<Vec<ScannedFile>, String> {
        use ignore::overrides::OverrideBuilder;
        use ignore::WalkBuilder;

        let mut ob = OverrideBuilder::new(&root);
        for g in &workflow_globs {
            ob.add(g).map_err(|e| e.to_string())?;
        }
        for g in &exclude_globs {
            ob.add(&format!("!{}", g)).map_err(|e| e.to_string())?;
        }
        let overrides = ob.build().map_err(|e| e.to_string())?;
        let walker = WalkBuilder::new(&root)
            .overrides(overrides)
            .follow_links(false)
            .build();

        let mut out = Vec::new();
        for dent in walker.flatten() {
            if cancel.is_cancelled() {
                break;
            }
            if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
                continue;
            }
            let path = dent.path();
            let meta = match std::fs::metadata(path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let contents = match std::fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let last_modified = chrono::DateTime::<chrono::Utc>::from(
                meta.modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
            )
            .to_rfc3339();
            let relative_path = path
                .strip_prefix(&root)
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();
            out.push(ScannedFile {
                path: path.to_string_lossy().into_owned(),
                relative_path,
                contents,
                last_modified,
                size_bytes: meta.len(),
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(ProjectScanResult {
        root: root_path,
        scanned_at: chrono::Utc::now().to_rfc3339(),
        files: result,
    })
}
