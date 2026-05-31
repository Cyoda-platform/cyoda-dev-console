use app_lib::atomic_write::write_atomic;
use std::os::unix::fs::PermissionsExt;
use tempfile::TempDir;

#[test]
fn writes_content_correctly() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("output.json");
    write_atomic(&target, b"hello world").unwrap();
    let contents = std::fs::read_to_string(&target).unwrap();
    assert_eq!(contents, "hello world");
}

#[test]
fn resulting_file_has_mode_0600() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("output.json");
    write_atomic(&target, b"{}").unwrap();
    let perms = std::fs::metadata(&target).unwrap().permissions();
    assert_eq!(perms.mode() & 0o777, 0o600);
}

#[test]
fn overwrites_existing_file() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("output.json");
    write_atomic(&target, b"first").unwrap();
    write_atomic(&target, b"second").unwrap();
    let contents = std::fs::read_to_string(&target).unwrap();
    assert_eq!(contents, "second");
}
