use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct ScanRegistry {
    current: Mutex<Option<CancellationToken>>,
}

impl ScanRegistry {
    pub async fn begin(&self) -> CancellationToken {
        let mut g = self.current.lock().await;
        if let Some(prev) = g.take() {
            prev.cancel();
        }
        let t = CancellationToken::new();
        *g = Some(t.clone());
        t
    }
}

pub type ScanRegistryState = Arc<ScanRegistry>;
