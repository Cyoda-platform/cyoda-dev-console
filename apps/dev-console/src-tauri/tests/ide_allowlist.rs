// Tests that the Ide enum rejects unknown variants at serde time.
use serde_json::json;

#[test]
fn rejects_unknown_ide() {
    let r: Result<app_lib::commands::shell_ext::Ide, _> = serde_json::from_value(json!("emacs"));
    assert!(r.is_err());
}

#[test]
fn accepts_listed_ides() {
    for s in ["zed", "intellij", "vscode"] {
        let r: Result<app_lib::commands::shell_ext::Ide, _> = serde_json::from_value(json!(s));
        assert!(r.is_ok(), "expected {s} to deserialize");
    }
}
