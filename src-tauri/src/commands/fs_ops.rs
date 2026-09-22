use crate::crypto::{
    decrypt_bytes, encrypt_bytes, key_for_vault, require_session_password, SharedCryptoSession,
    CRYPTO_META_FILE,
};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::io::Read;
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

/// Detect Lax1024 Tools ciphertext (magic `NW1`).
pub fn is_encrypted_bytes(data: &[u8]) -> bool {
    data.len() >= 3 && &data[..3] == b"NW1"
}

pub fn is_encrypted_file(path: &Path) -> bool {
    let Ok(mut f) = fs::File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 3];
    matches!(f.read(&mut magic), Ok(3) if &magic == b"NW1")
}

fn workspace_root_for(path: &Path) -> Option<PathBuf> {
    // Walk up looking for .nw-crypto.json or .git
    let mut cur = path.to_path_buf();
    if cur.is_file() {
        cur = cur.parent()?.to_path_buf();
    }
    loop {
        if cur.join(CRYPTO_META_FILE).exists() || cur.join(".git").exists() {
            return Some(cur);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn key_for_path(session: &SharedCryptoSession, file: &Path) -> AppResult<[u8; 32]> {
    let password = require_session_password(session)?;
    let root = workspace_root_for(file).ok_or_else(|| {
        AppError::new(
            "CRYPTO_ERROR",
            "找不到工作区加密配置，请先打开并初始化工作区",
        )
    })?;
    key_for_vault(&password, &root)
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
        // Legacy dual-layout: hide leftover work/ folder when browsing vault-as-root parent
        // (single-dir mode keeps everything visible except hidden)
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
            // Encrypted notes are still shown; content decrypts on open
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

/// Read note: decrypt if ciphertext, otherwise return plaintext (legacy / just-copied).
#[tauri::command]
pub fn read_md(
    path: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<String> {
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
    let raw = fs::read(&p)?;
    if is_encrypted_bytes(&raw) {
        let key = key_for_path(&session, &p)?;
        let plain = decrypt_bytes(&key, &raw)?;
        String::from_utf8(plain).map_err(|e| {
            AppError::new("CRYPTO_ERROR", format!("解密后不是合法 UTF-8：{e}"))
        })
    } else {
        String::from_utf8(raw).map_err(|e| AppError::new("IO_ERROR", e.to_string()))
    }
}

/// Write arbitrary binary bytes (toolbox exports, etc.). Not encrypted.
#[tauri::command]
pub fn write_bytes(path: String, data: Vec<u8>) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(&p, data)?;
    Ok(())
}

/// Write note: always store as ciphertext on disk.
#[tauri::command]
pub fn write_md(
    path: String,
    content: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !is_note_file(&p) {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "仅支持保存 .md / .markdown / .txt 笔记文件",
        ));
    }
    let key = key_for_path(&session, &p)?;
    let cipher = encrypt_bytes(&key, content.as_bytes())?;
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let tmp = PathBuf::from(format!("{path}.tmp"));
    fs::write(&tmp, &cipher)?;
    fs::rename(&tmp, &p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::from(e)
    })?;
    Ok(())
}

#[tauri::command]
pub fn create_file(
    path: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
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
    if is_note_file(&p) {
        let key = key_for_path(&session, &p)?;
        let cipher = encrypt_bytes(&key, b"")?;
        fs::write(&p, cipher)?;
    } else {
        fs::write(&p, b"")?;
    }
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

fn read_note_plaintext(path: &Path, key: &[u8; 32]) -> AppResult<String> {
    let raw = fs::read(path)?;
    if is_encrypted_bytes(&raw) {
        let plain = decrypt_bytes(key, &raw)?;
        String::from_utf8(plain)
            .map_err(|e| AppError::new("CRYPTO_ERROR", format!("decrypt utf8: {e}")))
    } else {
        String::from_utf8(raw).map_err(|e| AppError::new("IO_ERROR", e.to_string()))
    }
}

#[tauri::command]
pub fn search_files(
    root: String,
    keyword: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<Vec<SearchHit>> {
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
    let password = require_session_password(&session)?;
    let key = key_for_vault(&password, &root_path)?;
    let kw_lower = kw.to_lowercase();
    let mut hits = Vec::new();

    for entry in WalkDir::new(&root_path)
        .into_iter()
        .filter_entry(|e| {
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
        let Ok(text) = read_note_plaintext(path, &key) else {
            continue;
        };
        for (idx, line) in text.lines().enumerate() {
            if hits.len() >= 200 {
                break;
            }
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

/// Encrypt any plaintext notes under root (e.g. files just copied in).
#[tauri::command]
pub fn seal_plaintext_notes(
    root: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<u32> {
    let root_path = PathBuf::from(&root);
    let password = require_session_password(&session)?;
    let key = key_for_vault(&password, &root_path)?;
    let mut count = 0u32;
    for entry in WalkDir::new(&root_path)
        .into_iter()
        .filter_entry(|e| {
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
        let path = entry.path();
        if !path.is_file() || !is_note_file(path) {
            continue;
        }
        let Ok(raw) = fs::read(path) else { continue };
        if is_encrypted_bytes(&raw) {
            continue;
        }
        let cipher = encrypt_bytes(&key, &raw)?;
        fs::write(path, cipher)?;
        count += 1;
    }
    Ok(count)
}

/// Export decrypted notes (and copy other files) to `dest_root`, preserving relative paths.
/// `path` is optional: a file or subdirectory under `root`. When omitted, exports the whole workspace.
#[tauri::command]
pub fn export_decrypted(
    root: String,
    dest_root: String,
    path: Option<String>,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<u32> {
    let src_root = PathBuf::from(&root);
    let dest_root = PathBuf::from(&dest_root);
    if !src_root.is_dir() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("workspace not found: {root}"),
        ));
    }
    if dest_root.as_os_str().is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "请指定导出目录"));
    }

    let walk_from = match path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => {
            let candidate = PathBuf::from(p);
            if !candidate.exists() {
                return Err(AppError::new("NOT_FOUND", format!("路径不存在: {p}")));
            }
            let src_canon = src_root.canonicalize().unwrap_or(src_root.clone());
            let cand_canon = candidate.canonicalize().unwrap_or(candidate.clone());
            if cand_canon != src_canon && !cand_canon.starts_with(&src_canon) {
                return Err(AppError::new(
                    "INVALID_ARGUMENT",
                    "只能导出当前工作区内的路径",
                ));
            }
            candidate
        }
        None => src_root.clone(),
    };

    // Refuse exporting into the workspace itself
    let src_canon = src_root.canonicalize().unwrap_or(src_root.clone());
    if let Ok(dest_canon) = dest_root.canonicalize() {
        if dest_canon == src_canon || dest_canon.starts_with(&src_canon) {
            return Err(AppError::new(
                "INVALID_ARGUMENT",
                "导出目录不能是工作区或其子目录",
            ));
        }
    }
    fs::create_dir_all(&dest_root)?;

    let password = require_session_password(&session)?;
    let key = key_for_vault(&password, &src_root)?;
    let mut count = 0u32;

    // Single file
    if walk_from.is_file() {
        let name = walk_from
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "export".into());
        let dest = dest_root.join(name);
        if is_note_file(&walk_from) {
            let text = read_note_plaintext(&walk_from, &key)?;
            fs::write(&dest, text.as_bytes())?;
        } else {
            fs::copy(&walk_from, &dest)?;
        }
        return Ok(1);
    }

    // Directory (whole workspace or subtree)
    let prefix = walk_from.clone();
    for entry in WalkDir::new(&walk_from)
        .into_iter()
        .filter_entry(|e| {
            if e.path() == walk_from {
                return true;
            }
            e.file_name()
                .to_str()
                .map(|n| !is_hidden_name(n))
                .unwrap_or(true)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Ok(rel) = path.strip_prefix(&prefix) else {
            continue;
        };
        // When exporting a subdirectory, nest under that folder name
        let dest = if prefix == src_root {
            dest_root.join(rel)
        } else {
            let folder = prefix
                .file_name()
                .map(|n| PathBuf::from(n))
                .unwrap_or_else(|| PathBuf::from("export"));
            dest_root.join(folder).join(rel)
        };
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        if is_note_file(path) {
            let text = read_note_plaintext(path, &key)?;
            fs::write(&dest, text.as_bytes())?;
        } else {
            fs::copy(path, &dest)?;
        }
        count += 1;
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::{derive_key, encrypt_bytes, CryptoMeta};

    #[test]
    fn scan_shows_encrypted_notes() {
        let dir = tempfile::tempdir().unwrap();
        let key = derive_key("pass1234", b"0123456789abcdef").unwrap();
        let enc = encrypt_bytes(&key, b"# hi").unwrap();
        fs::write(dir.path().join("a.md"), &enc).unwrap();
        fs::write(dir.path().join("b.rs"), "x").unwrap();
        let nodes = scan_dir(dir.path()).unwrap();
        assert_eq!(nodes.len(), 2);
        let md = nodes.iter().find(|n| n.name == "a.md").unwrap();
        assert!(md.is_note);
    }

    #[test]
    fn encrypted_roundtrip_helpers() {
        let key = derive_key("pass1234", b"0123456789abcdef").unwrap();
        let enc = encrypt_bytes(&key, b"hello").unwrap();
        assert!(is_encrypted_bytes(&enc));
        let meta = CryptoMeta::new_random().unwrap();
        assert!(!meta.salt.is_empty());
    }
}
