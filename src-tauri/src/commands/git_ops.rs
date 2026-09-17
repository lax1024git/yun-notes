use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeItem {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<ChangeItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub author: String,
    pub time: i64,
}

fn open_repo(root: &str) -> AppResult<git2::Repository> {
    git2::Repository::open(root).map_err(|_| {
        AppError::new("NOT_REPO", format!("not a git repository: {root}"))
    })
}

fn status_label(flags: git2::Status) -> (String, bool) {
    if flags.is_index_new() {
        return ("已暂存".into(), true);
    }
    if flags.is_index_modified() {
        return ("已暂存".into(), true);
    }
    if flags.is_index_deleted() {
        return ("已删除".into(), true);
    }
    if flags.is_wt_new() {
        return ("未跟踪".into(), false);
    }
    if flags.is_wt_modified() {
        return ("已修改".into(), false);
    }
    if flags.is_wt_deleted() {
        return ("已删除".into(), false);
    }
    ("变更".into(), false)
}

#[tauri::command]
pub fn git_init(root: String) -> AppResult<()> {
    git2::Repository::init(&root)?;
    Ok(())
}

#[tauri::command]
pub fn git_status(root: String) -> AppResult<GitStatus> {
    let repo = open_repo(&root)?;
    let head = repo.head().ok();
    let branch = head
        .as_ref()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".into());

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut changes = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let (status, staged) = status_label(entry.status());
        changes.push(ChangeItem {
            path,
            status,
            staged,
        });
    }

    let (ahead, behind) = compute_ahead_behind(&repo).unwrap_or((0, 0));

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        changes,
    })
}

fn compute_ahead_behind(repo: &git2::Repository) -> AppResult<(u32, u32)> {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok((0, 0)),
    };
    let local = match head.target() {
        Some(oid) => oid,
        None => return Ok((0, 0)),
    };
    let upstream = match repo.branch_upstream_name(head.name().unwrap_or("")) {
        Ok(name) => name.as_str().map(|s| s.to_string()).unwrap_or_default(),
        Err(_) => return Ok((0, 0)),
    };
    if upstream.is_empty() {
        return Ok((0, 0));
    }
    let remote_ref = repo.find_reference(&upstream)?;
    let remote_oid = remote_ref.target().unwrap_or(local);
    let (ahead, behind) = repo.graph_ahead_behind(local, remote_oid)?;
    Ok((ahead as u32, behind as u32))
}

fn signature(repo: &git2::Repository) -> AppResult<git2::Signature<'static>> {
    if let Ok(sig) = repo.signature() {
        // Convert to owned by re-creating
        return Ok(git2::Signature::now(
            sig.name().unwrap_or("Note User"),
            sig.email().unwrap_or("note@local"),
        )?);
    }
    Ok(git2::Signature::now("Note User", "note@local")?)
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> AppResult<String> {
    let msg = message.trim();
    if msg.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "commit message is empty"));
    }
    let repo = open_repo(&root)?;
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let sig = signature(&repo)?;
    let parents: Vec<git2::Commit> = match repo.head() {
        Ok(head) => {
            let commit = head.peel_to_commit()?;
            vec![commit]
        }
        Err(_) => vec![],
    };
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parent_refs)?;
    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_log(root: String, limit: u32) -> AppResult<Vec<CommitInfo>> {
    let repo = open_repo(&root)?;
    let mut revwalk = repo.revwalk()?;
    if repo.head().is_err() {
        return Ok(vec![]);
    }
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut list = Vec::new();
    for (i, oid_res) in revwalk.enumerate() {
        if i as u32 >= limit {
            break;
        }
        let oid = oid_res?;
        let commit = repo.find_commit(oid)?;
        let id = oid.to_string();
        let short_id = id.chars().take(7).collect();
        list.push(CommitInfo {
            id,
            short_id,
            message: commit.message().unwrap_or("").trim().to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            time: commit.time().seconds(),
        });
    }
    Ok(list)
}

fn ensure_system_git() -> AppResult<()> {
    let output = Command::new("git")
        .arg("--version")
        .output()
        .map_err(|_| AppError::new("GIT_ERROR", "系统未找到 git，请先安装 Git 并确保在 PATH 中"))?;
    if !output.status.success() {
        return Err(AppError::new(
            "GIT_ERROR",
            "系统未找到 git，请先安装 Git 并确保在 PATH 中",
        ));
    }
    Ok(())
}

fn run_git(args: &[&str], cwd: Option<&Path>) -> AppResult<String> {
    ensure_system_git()?;
    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = cmd
        .output()
        .map_err(|e| AppError::new("GIT_ERROR", e.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let combined = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        if combined.to_lowercase().contains("conflict") {
            return Err(AppError::new("GIT_CONFLICT", combined));
        }
        return Err(AppError::new("GIT_ERROR", combined));
    }
    Ok(stdout)
}

fn inject_token_if_needed(url: &str, token: Option<&str>) -> String {
    if url.contains("oauth2:") || url.starts_with("git@") || url.starts_with("ssh://") {
        return url.to_string();
    }
    let Some(token) = token.filter(|t| !t.is_empty()) else {
        return url.to_string();
    };
    if let Some(rest) = url.strip_prefix("https://") {
        return format!("https://oauth2:{token}@{rest}");
    }
    url.to_string()
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> AppResult<()> {
    if url.trim().is_empty() || dest.trim().is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "url or dest is empty"));
    }
    let dest_path = PathBuf::from(&dest);
    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    run_git(&["clone", "--", &url, &dest], None)?;
    Ok(())
}

/// 读取 origin 远程地址（可能含 oauth2 Token）
#[tauri::command]
pub fn git_get_remote(root: String) -> AppResult<Option<String>> {
    let repo = open_repo(&root)?;
    let remote = match repo.find_remote("origin") {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    Ok(remote.url().map(|s| s.to_string()))
}

/// 将完整 Git 地址（可含 Token）写入 origin，可直接 push/pull
#[tauri::command]
pub fn git_set_remote(root: String, url: String) -> AppResult<()> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "remote url is empty"));
    }
    if !(url.starts_with("https://")
        || url.starts_with("http://")
        || url.starts_with("git@")
        || url.starts_with("ssh://"))
    {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "请填写完整 Git 地址，例如 https://oauth2:<TOKEN>@gitee.com/owner/repo.git",
        ));
    }
    let repo = open_repo(&root)?;
    match repo.find_remote("origin") {
        Ok(_) => {
            repo.remote_set_url("origin", &url)?;
        }
        Err(_) => {
            repo.remote("origin", &url)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn git_push(root: String, token: Option<String>) -> AppResult<()> {
    let repo = open_repo(&root)?;
    maybe_rewrite_origin(&repo, token.as_deref())?;
    run_git(&["push"], Some(Path::new(&root)))?;
    Ok(())
}

#[tauri::command]
pub fn git_pull(root: String, token: Option<String>) -> AppResult<()> {
    let repo = open_repo(&root)?;
    maybe_rewrite_origin(&repo, token.as_deref())?;
    run_git(&["pull", "--rebase"], Some(Path::new(&root)))?;
    Ok(())
}

fn maybe_rewrite_origin(repo: &git2::Repository, token: Option<&str>) -> AppResult<()> {
    let Some(token) = token.filter(|t| !t.is_empty()) else {
        return Ok(());
    };
    let remote = match repo.find_remote("origin") {
        Ok(r) => r,
        Err(_) => return Ok(()),
    };
    let Some(url) = remote.url().map(|s| s.to_string()) else {
        return Ok(());
    };
    if url.starts_with("git@") || url.starts_with("ssh://") {
        return Ok(());
    }
    if url.contains("oauth2:") {
        return Ok(());
    }
    if url.starts_with("https://") {
        let new_url = inject_token_if_needed(&url, Some(token));
        repo.remote_set_url("origin", &new_url)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn status_on_non_repo_returns_not_repo() {
        let dir = tempfile::tempdir().unwrap();
        let err = git_status(dir.path().to_string_lossy().to_string()).unwrap_err();
        assert_eq!(err.code, "NOT_REPO");
    }

    #[test]
    fn set_remote_accepts_token_url() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        git_init(root.clone()).unwrap();
        let url = "https://oauth2:tok@gitee.com/alice/notes.git".to_string();
        git_set_remote(root.clone(), url.clone()).unwrap();
        let got = git_get_remote(root).unwrap();
        assert_eq!(got.as_deref(), Some(url.as_str()));
    }
}
