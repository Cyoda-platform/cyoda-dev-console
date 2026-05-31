use app_lib::save_origin::SaveOriginRegistry;
use std::path::PathBuf;

#[tokio::test]
async fn marks_and_consumes_matching_event() {
    let reg = SaveOriginRegistry::default();
    let path = PathBuf::from("/tmp/test.json");
    let lm = "2026-01-01T00:00:00Z";
    reg.mark(&path, lm).await;
    let suppressed = reg.consume_if_match(&path, lm).await;
    assert!(suppressed, "event from our own write should be suppressed");
}

#[tokio::test]
async fn does_not_suppress_different_mtime() {
    let reg = SaveOriginRegistry::default();
    let path = PathBuf::from("/tmp/test.json");
    reg.mark(&path, "2026-01-01T00:00:00Z").await;
    let suppressed = reg.consume_if_match(&path, "2026-01-01T00:00:01Z").await;
    assert!(!suppressed, "different mtime should not be suppressed");
}

#[tokio::test]
async fn entry_is_consumed_only_once() {
    let reg = SaveOriginRegistry::default();
    let path = PathBuf::from("/tmp/test.json");
    let lm = "2026-01-01T00:00:00Z";
    reg.mark(&path, lm).await;
    assert!(reg.consume_if_match(&path, lm).await);
    assert!(!reg.consume_if_match(&path, lm).await, "second call must not suppress");
}
