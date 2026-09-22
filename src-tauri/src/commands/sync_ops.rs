//! Single-directory workspace: notes encrypted on disk; UI decrypts on display.

use crate::crypto::{
    self, decrypt_bytes, encrypt_bytes, key_for_vault, require_session_password,
    rotate_meta_and_key, SharedCryptoSession,
};
use crate::error::{AppError, AppResult};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPaths {
    pub root: String,
}

/// Resolve workspace root. Legacy work+vault → prefer vault (already ciphertext).
#[tauri::command]
pub fn project_resolve(root: String) -> AppResult<ProjectPaths> {
    let project = PathBuf::from(&root);
    if !project.exists() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("path not found: {root}"),
        ));
    }
    let work = project.join("work");
    let vault = project.join("vault");
    // Legacy dual layout: use vault as the encrypted workspace
    if work.is_dir() && vault.is_dir() {
        return Ok(ProjectPaths {
            root: vault.to_string_lossy().to_string(),
        });
    }
    if project.file_name().and_then(|n| n.to_str()) == Some("work") {
        if let Some(parent) = project.parent() {
            let v = parent.join("vault");
            if v.is_dir() {
                return Ok(ProjectPaths {
                    root: v.to_string_lossy().to_string(),
                });
            }
        }
    }
    Ok(ProjectPaths {
        root: project.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn project_ensure(root: String) -> AppResult<ProjectPaths> {
    project_resolve(root)
}

/// Init single-dir workspace: crypto meta + optional git.
#[tauri::command]
pub fn project_init(root: String) -> AppResult<ProjectPaths> {
    let paths = project_resolve(root)?;
    let dir = PathBuf::from(&paths.root);
    fs::create_dir_all(&dir)?;

    // Ensure crypto meta exists (salt for transparent encryption)
    let _ = crypto::load_or_create_meta(&dir)?;

    if !dir.join(".git").exists() {
        let _ = git2::Repository::init(&dir);
    }

    Ok(paths)
}

fn rekey_workspace_inner(
    root: &str,
    new_password: String,
    session: &SharedCryptoSession,
) -> AppResult<()> {
    if new_password.chars().count() < 4 {
        return Err(AppError::new("INVALID_ARGUMENT", "密码至少 4 个字符"));
    }
    let dir = PathBuf::from(root);
    let old_password = require_session_password(session)?;
    let old_key = key_for_vault(&old_password, &dir)?;
    let new_key = rotate_meta_and_key(&new_password, &dir)?;

    for entry in WalkDir::new(&dir)
        .into_iter()
        .filter_entry(|e| {
            if e.path() == dir {
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
        let plain = if raw.len() >= 3 && &raw[..3] == b"NW1" {
            decrypt_bytes(&old_key, &raw)?
        } else {
            raw
        };
        let cipher = encrypt_bytes(&new_key, &plain)?;
        fs::write(path, cipher)?;
    }

    let mut guard = session
        .lock()
        .map_err(|_| AppError::new("INTERNAL", "crypto session lock poisoned"))?;
    guard.set_password(new_password);
    Ok(())
}

/// Re-encrypt all notes under root with a new password (new salt).
#[tauri::command]
pub fn rekey_workspace(
    root: String,
    new_password: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
    rekey_workspace_inner(&root, new_password, &session)
}

// Keep old command names as thin aliases so existing handlers compile during transition.
#[tauri::command]
pub fn encrypt_work_to_vault(
    _work_root: String,
    _vault_root: String,
    _session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub fn decrypt_vault_to_work(
    _work_root: String,
    _vault_root: String,
    _session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub fn decrypt_vault_to_work_if_needed(
    _work_root: String,
    _vault_root: String,
    _session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<bool> {
    Ok(false)
}

#[tauri::command]
pub fn rekey_vault_from_work(
    work_root: String,
    vault_root: String,
    new_password: String,
    session: tauri::State<'_, SharedCryptoSession>,
) -> AppResult<()> {
    // Prefer vault (legacy) or work_root as single encrypted root
    let root = if Path::new(&vault_root).is_dir() {
        vault_root
    } else {
        work_root
    };
    rekey_workspace_inner(&root, new_password, &session)
}
