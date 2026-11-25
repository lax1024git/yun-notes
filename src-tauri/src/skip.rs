//! Directories/files that should not be scanned, watched, searched, or sealed.

use std::path::Path;

/// Skip hidden dirs, dependency trees, and temp files.
pub fn skip_entry_name(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    matches!(lower.as_str(), "node_modules" | "__pycache__") || lower.ends_with(".tmp")
}

pub fn skip_fs_path(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .map(skip_entry_name)
            .unwrap_or(false)
    })
}

/// Keep walking `root` itself; skip ignored child names.
pub fn walk_keep(root: &Path, entry_path: &Path, file_name: &str) -> bool {
    if entry_path == root {
        return true;
    }
    !skip_entry_name(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skips_git_and_node_modules() {
        assert!(skip_entry_name(".git"));
        assert!(skip_entry_name("node_modules"));
        assert!(skip_entry_name("Node_Modules"));
        assert!(skip_entry_name("__pycache__"));
        assert!(skip_entry_name("note.md.tmp"));
        assert!(!skip_entry_name("notes"));
        assert!(!skip_entry_name("readme.md"));
    }

    #[test]
    fn skips_nested_git_objects() {
        let p = PathBuf::from(r"D:\notes\.git\objects\ab\cd");
        assert!(skip_fs_path(&p));
        let p = PathBuf::from(r"D:\notes\node_modules\foo\index.js");
        assert!(skip_fs_path(&p));
        let p = PathBuf::from(r"D:\notes\diary.md");
        assert!(!skip_fs_path(&p));
    }
}
