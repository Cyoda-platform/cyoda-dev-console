use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use notify::EventKind;
use notify_debouncer_full::new_debouncer;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use crate::save_origin::SaveOriginState;

#[derive(Default)]
pub struct WatchRegistry {
    handles: Mutex<HashMap<PathBuf, tokio::task::JoinHandle<()>>>,
}

pub type WatchRegistryState = Arc<WatchRegistry>;

#[derive(Serialize, Clone)]
pub struct FileChangedEvent {
    pub path: String,
    pub last_modified: String,
}

#[tauri::command]
pub async fn watch_project(
    app: AppHandle,
    root_path: String,
    watch_reg: State<'_, WatchRegistryState>,
    save_origin: State<'_, SaveOriginState>,
) -> Result<(), String> {
    let mut handles = watch_reg.handles.lock().await;
    let root = PathBuf::from(&root_path);
    if handles.contains_key(&root) {
        return Ok(());
    }

    let (tx, mut rx) =
        tokio::sync::mpsc::unbounded_channel::<Vec<notify_debouncer_full::DebouncedEvent>>();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |res: notify_debouncer_full::DebounceEventResult| {
            if let Ok(events) = res {
                let _ = tx.send(events);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(&root, notify::RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    // Clone the Arc out of the Tauri State wrapper before moving into the async task.
    let save_origin: SaveOriginState = Arc::clone(&*save_origin);

    let handle = tokio::spawn(async move {
        let _debouncer = debouncer;
        while let Some(batch) = rx.recv().await {
            for ev in batch {
                if !matches!(
                    ev.kind,
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                ) {
                    continue;
                }
                for path in &ev.paths {
                    let Ok(meta) = std::fs::metadata(path) else {
                        continue;
                    };
                    let lm = chrono::DateTime::<chrono::Utc>::from(
                        meta.modified()
                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                    )
                    .to_rfc3339();
                    if save_origin.consume_if_match(path, &lm).await {
                        continue;
                    }
                    let _ = app_clone.emit(
                        "project://file-changed",
                        FileChangedEvent {
                            path: path.to_string_lossy().into_owned(),
                            last_modified: lm,
                        },
                    );
                }
            }
        }
    });

    handles.insert(root, handle);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_project(
    root_path: String,
    watch_reg: State<'_, WatchRegistryState>,
) -> Result<(), String> {
    let mut handles = watch_reg.handles.lock().await;
    if let Some(h) = handles.remove(&PathBuf::from(root_path)) {
        h.abort();
    }
    Ok(())
}
