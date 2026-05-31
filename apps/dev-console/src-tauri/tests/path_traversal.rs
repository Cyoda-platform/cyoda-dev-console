use std::fs;
use std::os::unix::fs as unix_fs;
use tempfile::TempDir;
use app_lib::paths::{resolve_inside_root, PathError};

fn setup() -> TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn file_inside_root_resolves_ok() {
    let dir = setup();
    let file = dir.path().join("hello.json");
    fs::write(&file, b"{}").unwrap();
    let result = resolve_inside_root(dir.path(), &file);
    assert!(result.is_ok());
}

#[test]
fn traversal_is_rejected() {
    let dir = setup();
    // Construct a path that tries to escape via ..
    let escape = dir.path().join("..").join("..").join("etc").join("passwd");
    let result = resolve_inside_root(dir.path(), &escape);
    // canonicalize will either fail (ENOENT) or succeed and fail containment check.
    match result {
        Err(PathError::OutsideRoot) | Err(PathError::Io(_)) => {}
        Ok(_) => panic!("should have been rejected"),
    }
}

#[test]
fn symlink_outside_root_is_rejected() {
    let dir = setup();
    let target = tempfile::tempdir().unwrap();
    let link = dir.path().join("escape");
    unix_fs::symlink(target.path(), &link).unwrap();
    let result = resolve_inside_root(dir.path(), &link);
    assert!(matches!(result, Err(PathError::OutsideRoot)));
}
