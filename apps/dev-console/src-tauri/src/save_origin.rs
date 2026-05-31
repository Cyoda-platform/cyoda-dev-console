use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct SaveOriginEntry {
    pub expected_last_modified: String,
    pub created: Instant,
}

#[derive(Default)]
pub struct SaveOriginRegistry {
    inner: Mutex<HashMap<PathBuf, SaveOriginEntry>>,
}

impl SaveOriginRegistry {
    pub async fn mark(&self, path: &Path, last_modified: &str) {
        let mut g = self.inner.lock().await;
        g.insert(
            path.to_path_buf(),
            SaveOriginEntry {
                expected_last_modified: last_modified.to_string(),
                created: Instant::now(),
            },
        );
    }

    /// Returns `true` if this event originated from our own write (matched + still fresh).
    pub async fn consume_if_match(&self, path: &Path, observed_last_modified: &str) -> bool {
        let mut g = self.inner.lock().await;
        if let Some(entry) = g.get(path) {
            if entry.created.elapsed() < Duration::from_millis(750)
                && entry.expected_last_modified == observed_last_modified
            {
                g.remove(path);
                return true;
            }
        }
        false
    }
}

pub type SaveOriginState = Arc<SaveOriginRegistry>;
