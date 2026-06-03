use std::fs::{File, OpenOptions};
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn write_atomic(target: &Path, contents: &[u8]) -> std::io::Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| std::io::Error::other("target path has no parent directory"))?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let stem = target.file_name().and_then(|s| s.to_str()).unwrap_or("out");
    let tmp = parent.join(format!(".{}-{}.tmp", stem, nanos));
    {
        let mut f: File = OpenOptions::new().create_new(true).write(true).open(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;
    }
    std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
    std::fs::rename(&tmp, target)?;
    Ok(())
}
