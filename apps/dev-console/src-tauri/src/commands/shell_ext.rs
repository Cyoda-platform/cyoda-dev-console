use std::path::PathBuf;
use std::process::Command;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ide {
    Zed,
    Intellij,
    Vscode,
}

impl Ide {
    // Fallback binary names for non-macOS (must be on PATH).
    #[cfg(not(target_os = "macos"))]
    fn binary(&self) -> &'static str {
        match self {
            Ide::Zed => "zed",
            Ide::Intellij => "idea",
            Ide::Vscode => "code",
        }
    }

    // On macOS, `open -a <AppName>` resolves apps by bundle name without
    // requiring CLI tools to be on PATH. Try multiple names for IDEs that
    // ship under different bundle names (Ultimate vs Community Edition).
    #[cfg(target_os = "macos")]
    fn macos_app_names(&self) -> &'static [&'static str] {
        match self {
            Ide::Zed => &["Zed"],
            Ide::Intellij => &["IntelliJ IDEA", "IntelliJ IDEA CE"],
            Ide::Vscode => &["Visual Studio Code"],
        }
    }
}

#[tauri::command]
pub async fn reveal_in_finder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(PathBuf::from(path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_in_ide(path: String, ide: Ide) -> Result<(), String> {
    open_in_ide_impl(path, ide)
}

#[cfg(target_os = "macos")]
fn open_in_ide_impl(path: String, ide: Ide) -> Result<(), String> {
    let mut last_err = String::from("no app names configured");
    for &app_name in ide.macos_app_names() {
        // argv form — path is a separate argument, never shell-interpolated.
        match Command::new("open").args(["-a", app_name, path.as_str()]).status() {
            Ok(s) if s.success() => return Ok(()),
            Ok(s) => last_err = format!("{app_name}: open -a exited with {s}"),
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(last_err)
}

#[cfg(not(target_os = "macos"))]
fn open_in_ide_impl(path: String, ide: Ide) -> Result<(), String> {
    let bin = ide.binary();
    let resolved = which::which(bin).map_err(|e| format!("{bin}: {e}"))?;
    // argv form — path is NEVER concatenated into a shell string.
    let status = Command::new(resolved)
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{bin} exited with {status}"))
    }
}
