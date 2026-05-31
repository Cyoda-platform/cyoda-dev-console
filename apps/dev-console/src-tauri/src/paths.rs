use std::path::{Path, PathBuf};

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
