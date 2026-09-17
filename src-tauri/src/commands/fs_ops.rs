use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// 是否为可编辑笔记（md/txt）；其它文件仅展示
    pub is_note: bool,
    pub children: Option<Vec<FileNode>>,
    pub size: Option<u64>,
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub preview: String,
}

fn is_note_file(path: &Path) -> bool {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
    {
        Some(ext) => matches!(ext.as_str(), "md" | "markdown" | "txt"),
        None => false,
    }
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn to_epoch(mtime: SystemTime) -> Option<i64> {
    mtime
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

pub fn scan_dir(root: &Path) -> AppResult<Vec<FileNode>> {
    if !root.exists() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("path not found: {}", root.display()),
        ));
    }
    scan_children(root)
}

fn scan_children(dir: &Path) -> AppResult<Vec<FileNode>> {
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    let entries = fs::read_dir(dir)?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if is_hidden_name(&name) {
            continue;
        }
        let meta = entry.metadata()?;
        if meta.is_dir() {
            let children = scan_children(&path)?;
            dirs.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                is_note: false,
                children: Some(children),
                size: None,
                modified: meta.modified().ok().and_then(to_epoch),
            });
        } else if meta.is_file() {
            files.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                is_note: is_note_file(&path),
                children: None,
                size: Some(meta.len()),
                modified: meta.modified().ok().and_then(to_epoch),
            });
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub fn scan_workspace(root: String) -> AppResult<Vec<FileNode>> {
    scan_dir(Path::new(&root))
}

#[tauri::command]
pub fn read_md(path: String) -> AppResult<String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::new("NOT_FOUND", format!("file not found: {path}")));
    }
    if !is_note_file(&p) {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "仅支持打开 .md / .markdown / .txt 笔记文件",
        ));
    }
    Ok(fs::read_to_string(p)?)
}

#[tauri::command]
pub fn write_md(path: String, content: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !is_note_file(&p) {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "仅支持保存 .md / .markdown / .txt 笔记文件",
        ));
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let tmp = PathBuf::from(format!("{path}.tmp"));
    fs::write(&tmp, content.as_bytes())?;
    fs::rename(&tmp, &p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::from(e)
    })?;
    Ok(())
}

#[tauri::command]
pub fn create_file(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    if p.exists() {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            format!("path already exists: {path}"),
        ));
    }
    fs::write(&p, b"")?;
    Ok(())
}

#[tauri::command]
pub fn create_dir(path: String) -> AppResult<()> {
    fs::create_dir_all(path)?;
    Ok(())
}

#[tauri::command]
pub fn delete_path(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::new("NOT_FOUND", format!("path not found: {path}")));
    }
    if p.is_dir() {
        fs::remove_dir_all(p)?;
    } else {
        fs::remove_file(p)?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_path(old: String, new_path: String) -> AppResult<()> {
    let from = PathBuf::from(&old);
    let to = PathBuf::from(&new_path);
    if !from.exists() {
        return Err(AppError::new("NOT_FOUND", format!("path not found: {old}")));
    }
    if to.exists() {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            format!("target already exists: {new_path}"),
        ));
    }
    if let Some(parent) = to.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    // Windows 上若 rename 失败，尝试 copy+remove（跨卷时）
    match fs::rename(&from, &to) {
        Ok(()) => Ok(()),
        Err(e) => {
            if from.is_dir() {
                return Err(AppError::from(e));
            }
            fs::copy(&from, &to).map_err(AppError::from)?;
            fs::remove_file(&from).map_err(AppError::from)?;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn search_files(root: String, keyword: String) -> AppResult<Vec<SearchHit>> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "keyword is empty"));
    }
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("path not found: {root}"),
        ));
    }

    let kw_lower = kw.to_lowercase();
    let mut hits = Vec::new();

    for entry in WalkDir::new(&root_path)
        .into_iter()
        .filter_entry(|e| {
            // Do not skip the search root even if its folder name starts with '.'
            if e.path() == root_path {
                return true;
            }
            e.file_name()
                .to_str()
                .map(|n| !is_hidden_name(n))
                .unwrap_or(true)
        })
        .filter_map(|e| e.ok())
    {
        if hits.len() >= 200 {
            break;
        }
        let path = entry.path();
        if !path.is_file() || !is_note_file(path) {
            continue;
        }
        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let reader = BufReader::new(file);
        for (idx, line_res) in reader.lines().enumerate() {
            if hits.len() >= 200 {
                break;
            }
            let Ok(line) = line_res else { continue };
            if line.to_lowercase().contains(&kw_lower) {
                let preview: String = line.chars().take(120).collect();
                hits.push(SearchHit {
                    path: path.to_string_lossy().to_string(),
                    line: (idx + 1) as u32,
                    preview,
                });
            }
        }
    }

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn scan_shows_all_files_skips_dot() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        fs::write(dir.path().join("b.rs"), "x").unwrap();
        fs::write(dir.path().join("rice-hk.pem"), "x").unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        let nodes = scan_dir(dir.path()).unwrap();
        assert_eq!(nodes.len(), 3);
        let md = nodes.iter().find(|n| n.name == "a.md").unwrap();
        assert!(md.is_note);
        let pem = nodes.iter().find(|n| n.name == "rice-hk.pem").unwrap();
        assert!(!pem.is_note);
        assert!(!nodes.iter().any(|n| n.name == ".git"));
    }

    #[test]
    fn write_md_atomic_no_tmp_left() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        write_md(
            path.to_string_lossy().to_string(),
            "hello world".into(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello world");
        assert!(!dir.path().join("note.md.tmp").exists());
    }

    #[test]
    fn search_case_insensitive_and_limit_preview() {
        let dir = tempfile::tempdir().unwrap();
        let mut f = fs::File::create(dir.path().join("a.md")).unwrap();
        let long = "X".repeat(200);
        writeln!(f, "Hello TOKEN world").unwrap();
        writeln!(f, "{long}").unwrap();
        let hits = search_files(dir.path().to_string_lossy().to_string(), "token".into()).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 1);
        assert!(hits[0].preview.len() <= 120);
    }
}
