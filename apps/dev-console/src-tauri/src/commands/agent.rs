//! Native commands backing the BYO AI "AI Agent" surface (Dev Console).
//!
//! Three enumerated capabilities, all read-only except `write_project_text_file`,
//! which is constrained to the active project root:
//!   - read the canonical `cyoda-skills` profile config,
//!   - detect installed agent CLIs,
//!   - write a generated text file (rule file / bundle file) inside the project.

use std::path::PathBuf;
use std::process::Command;
use serde::Serialize;
use tauri::State;

use crate::atomic_write::write_atomic;
use crate::commands::fs_io::{lm_rfc3339, WriteResult};
use crate::paths::resolve_new_inside_root;
use crate::save_origin::SaveOriginState;

/// Agents the Dev Console can detect / generate rule files for in this phase.
const KNOWN_AGENTS: [&str; 3] = ["claude", "gemini", "codex"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub id: String,
    pub installed: bool,
    pub version: Option<String>,
}

/// Read `$HOME/.config/cyoda/cyoda-plugin-config.json` (the canonical `cyoda-skills`
/// profile store — NOT this app's own config dir). Returns `Ok(None)` when absent so
/// the Profiles tab can show a graceful empty state. Takes no path argument, preserving
/// the enumerated-command invariant.
#[tauri::command]
pub async fn read_cyoda_profile_config() -> Result<Option<serde_json::Value>, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let path = PathBuf::from(home)
        .join(".config")
        .join("cyoda")
        .join("cyoda-plugin-config.json");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

/// Detect which known agent CLIs are installed. Uses `which` for presence and, when
/// found, a single `<bin> --version` invocation (enumerated binary + fixed arg only;
/// never an arbitrary command string) to capture a version line.
#[tauri::command]
pub async fn detect_agents() -> Result<Vec<AgentStatus>, String> {
    let mut out = Vec::with_capacity(KNOWN_AGENTS.len());
    for id in KNOWN_AGENTS {
        match which::which(id) {
            Ok(resolved) => {
                let version = Command::new(&resolved)
                    .arg("--version")
                    .output()
                    .ok()
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .filter(|s| !s.is_empty());
                out.push(AgentStatus {
                    id: id.to_string(),
                    installed: true,
                    version,
                });
            }
            Err(_) => out.push(AgentStatus {
                id: id.to_string(),
                installed: false,
                version: None,
            }),
        }
    }
    Ok(out)
}

/// Write a generated text file at `relative_path` inside `active_root`. The relative path
/// is rejected if it is absolute or contains `..`; the resolved parent is re-validated
/// against the canonical root after creation to defend against symlinked directories.
/// Intermediate directories are created. The write is atomic (temp + rename, mode 0600).
#[tauri::command]
pub async fn write_project_text_file(
    active_root: String,
    relative_path: String,
    contents: String,
    save_origin: State<'_, SaveOriginState>,
) -> Result<WriteResult, String> {
    let root = PathBuf::from(&active_root);
    let target = resolve_new_inside_root(&root, std::path::Path::new(&relative_path))
        .map_err(|e| e.to_string())?;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let root_c = std::fs::canonicalize(&root).map_err(|e| e.to_string())?;
        let parent_c = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
        if !(parent_c == root_c || parent_c.starts_with(&root_c)) {
            return Err("path outside project root".to_string());
        }
    }

    write_atomic(&target, contents.as_bytes()).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    let lm = lm_rfc3339(&meta);
    save_origin.mark(&target, &lm).await;
    Ok(WriteResult {
        path: target.to_string_lossy().into_owned(),
        last_modified: lm,
        size_bytes: meta.len(),
    })
}

#[cfg(test)]
mod tests {
    use crate::paths::resolve_new_inside_root;
    use std::fs;
    use std::path::Path;

    #[test]
    fn rejects_parent_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(resolve_new_inside_root(root, Path::new("../escape.md")).is_err());
        assert!(resolve_new_inside_root(root, Path::new("sub/../../escape.md")).is_err());
    }

    #[test]
    fn rejects_absolute_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_new_inside_root(dir.path(), Path::new("/etc/passwd")).is_err());
    }

    #[test]
    fn accepts_nested_new_path_inside_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let resolved =
            resolve_new_inside_root(root, Path::new("cyoda-agent-task/CLAUDE.md")).unwrap();
        let root_c = fs::canonicalize(root).unwrap();
        assert!(resolved.starts_with(&root_c));
        assert!(resolved.ends_with("cyoda-agent-task/CLAUDE.md"));
    }
}
