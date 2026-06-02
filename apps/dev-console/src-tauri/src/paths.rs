use std::path::{Component, Path, PathBuf};

#[derive(thiserror::Error, Debug)]
pub enum PathError {
    #[error("path outside project root")]
    OutsideRoot,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Canonicalise both paths and require that `candidate` is `root` or a descendant.
pub fn resolve_inside_root(root: &Path, candidate: &Path) -> Result<PathBuf, PathError> {
    let root_c = std::fs::canonicalize(root)?;
    let cand_c = std::fs::canonicalize(candidate)?;
    if cand_c == root_c || cand_c.starts_with(&root_c) {
        Ok(cand_c)
    } else {
        Err(PathError::OutsideRoot)
    }
}

/// Resolve a project-relative path for a file that may not exist yet.
///
/// Unlike [`resolve_inside_root`], this does not canonicalise the candidate (which would
/// fail on a not-yet-created file). It instead rejects any `relative` that is absolute or
/// contains a `..`/root/prefix component, then joins it under the canonicalised root.
/// Callers must still re-check the parent directory against the root after creating it,
/// to defend against symlinked directories inside the root.
pub fn resolve_new_inside_root(root: &Path, relative: &Path) -> Result<PathBuf, PathError> {
    if relative.is_absolute() {
        return Err(PathError::OutsideRoot);
    }
    for comp in relative.components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            // ParentDir, RootDir, Prefix can all escape the root.
            _ => return Err(PathError::OutsideRoot),
        }
    }
    let root_c = std::fs::canonicalize(root)?;
    Ok(root_c.join(relative))
}
