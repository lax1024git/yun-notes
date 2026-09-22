use crate::crypto::CRYPTO_META_FILE;
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

/// Note files on disk must be ciphertext (NW1); skip meta / readme / non-notes.
fn assert_notes_are_ciphertext(root: &Path) -> AppResult<()> {
    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let rel = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let first = rel
            .components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .unwrap_or_default();
        if first == ".git" || first.starts_with('.') {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if name == CRYPTO_META_FILE || name.eq_ignore_ascii_case("readme.md") {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(ext.as_str(), "md" | "markdown" | "txt") {
            continue;
        }
        let mut magic = [0u8; 3];
        let Ok(mut f) = std::fs::File::open(path) else {
            continue;
        };
        use std::io::Read;
        if f.read(&mut magic).ok() != Some(3) || &magic != b"NW1" {
            return Err(AppError::new(
                "CRYPTO_ERROR",
                format!(
                    "发现未加密明文笔记：{}。请先解锁并保存/密封后再提交",
                    rel.display()
                ),
            ));
        }
    }
    Ok(())
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
    let path = PathBuf::from(&root);
    std::fs::create_dir_all(&path)?;
    if path.join(".git").exists() {
        return Ok(());
    }
    git2::Repository::init(&path)?;
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
        return Ok(git2::Signature::now(
            sig.name().unwrap_or("Note User"),
            sig.email().unwrap_or("note@local"),
        )?);
    }
    Ok(git2::Signature::now("Note User", "note@local")?)
}

/// Commit encrypted notes already on disk (no work↔vault sync).
#[tauri::command]
pub fn git_commit(root: String, message: String) -> AppResult<String> {
    let msg = message.trim();
    if msg.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "commit message is empty"));
    }
    let path = PathBuf::from(&root);
    assert_notes_are_ciphertext(&path)?;

    let repo = open_repo(&root)?;
    let mut index = repo.index()?;
    index.add_all(["*", ".*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    let meta = path.join(CRYPTO_META_FILE);
    if meta.exists() {
        let _ = index.add_path(Path::new(CRYPTO_META_FILE));
    }
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

/// Clone remote into dest (workspace root). Notes stay encrypted; UI decrypts on open.
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

#[tauri::command]
pub fn git_get_remote(root: String) -> AppResult<Option<String>> {
    let repo = open_repo(&root)?;
    let remote = match repo.find_remote("origin") {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    Ok(remote.url().map(|s| s.to_string()))
}

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
    assert_notes_are_ciphertext(Path::new(&root))?;
    let repo = open_repo(&root)?;
    maybe_rewrite_origin(&repo, token.as_deref())?;
    let cwd = Path::new(&root);
    if !has_any_commit(cwd) {
        return Err(AppError::new(
            "GIT_ERROR",
            "本地尚无提交，请先提交后再推送",
        ));
    }
    let branch = current_branch_name(cwd);
    match run_git(&["push"], Some(cwd)) {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.message.to_lowercase();
            if msg.contains("no upstream")
                || msg.contains("has no upstream")
                || msg.contains("set the remote as upstream")
                || msg.contains("does not have a tracking")
                || msg.contains("ambiguous argument 'head'")
            {
                run_git(&["push", "-u", "origin", &branch], Some(cwd))?;
                Ok(())
            } else {
                Err(e)
            }
        }
    }
}

fn remote_default_branch(cwd: &Path) -> AppResult<String> {
    if let Ok(out) = run_git(&["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], Some(cwd)) {
        let s = out.trim();
        if let Some(name) = s.strip_prefix("origin/") {
            if !name.is_empty() {
                return Ok(name.to_string());
            }
        }
    }
    for name in ["main", "master"] {
        let spec = format!("refs/remotes/origin/{name}");
        if run_git(&["show-ref", "--verify", "--quiet", &spec], Some(cwd)).is_ok() {
            return Ok(name.to_string());
        }
    }
    if let Ok(out) = run_git(&["branch", "-r", "--format=%(refname:short)"], Some(cwd)) {
        for line in out.lines() {
            let t = line.trim();
            if let Some(name) = t.strip_prefix("origin/") {
                if name != "HEAD" && !name.is_empty() {
                    return Ok(name.to_string());
                }
            }
        }
    }
    Ok("master".into())
}

fn has_any_commit(cwd: &Path) -> bool {
    run_git(&["rev-parse", "--verify", "HEAD"], Some(cwd)).is_ok()
}

fn current_branch_name(cwd: &Path) -> String {
    if let Ok(out) = run_git(&["branch", "--show-current"], Some(cwd)) {
        let name = out.trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }
    if let Ok(out) = run_git(&["symbolic-ref", "--short", "HEAD"], Some(cwd)) {
        let name = out.trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }
    "master".into()
}

fn has_upstream(cwd: &Path) -> bool {
    if !has_any_commit(cwd) {
        return false;
    }
    run_git(
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        Some(cwd),
    )
    .is_ok()
}

/// Remove local untracked files that would block checkout of `remote_ref`
/// (common case: local `.nw-crypto.json` created by project_init before first pull).
fn remove_untracked_conflicts_with_remote(cwd: &Path, remote_ref: &str) -> AppResult<()> {
    let remote_list =
        run_git(&["ls-tree", "-r", "--name-only", remote_ref], Some(cwd)).unwrap_or_default();
    let untracked =
        run_git(&["ls-files", "--others", "--exclude-standard"], Some(cwd)).unwrap_or_default();

    let remote_set: std::collections::HashSet<String> = remote_list
        .lines()
        .map(|l| l.trim().replace('\\', "/"))
        .filter(|s| !s.is_empty())
        .collect();

    for line in untracked.lines() {
        let rel = line.trim().replace('\\', "/");
        if rel.is_empty() || !remote_set.contains(&rel) {
            continue;
        }
        let path = cwd.join(Path::new(&rel));
        if path.is_file() {
            let _ = std::fs::remove_file(&path);
        } else if path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
    Ok(())
}

fn checkout_remote_branch(cwd: &Path, branch: &str, remote_ref: &str) -> AppResult<()> {
    remove_untracked_conflicts_with_remote(cwd, remote_ref)?;
    match run_git(&["checkout", "-B", branch, remote_ref], Some(cwd)) {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.message.to_lowercase();
            if msg.contains("would be overwritten") || msg.contains("untracked working tree") {
                // Parse again / force-clean known blockers then retry once
                remove_untracked_conflicts_with_remote(cwd, remote_ref)?;
                // Also drop local crypto meta if still blocking
                let meta = cwd.join(CRYPTO_META_FILE);
                if meta.exists() {
                    let tracked = run_git(
                        &["ls-files", "--error-unmatch", CRYPTO_META_FILE],
                        Some(cwd),
                    )
                    .is_ok();
                    if !tracked {
                        let _ = std::fs::remove_file(&meta);
                    }
                }
                run_git(&["checkout", "-B", branch, remote_ref], Some(cwd))?;
                Ok(())
            } else {
                Err(e)
            }
        }
    }
}

fn pull_rebase(cwd: &Path) -> AppResult<()> {
    run_git(&["fetch", "origin"], Some(cwd))?;
    let _ = run_git(&["remote", "set-head", "origin", "-a"], Some(cwd));

    let remote_branch = remote_default_branch(cwd)?;
    let remote_ref = format!("origin/{remote_branch}");

    if !has_any_commit(cwd) {
        if run_git(
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/remotes/{remote_ref}"),
            ],
            Some(cwd),
        )
        .is_err()
            && run_git(&["rev-parse", "--verify", &remote_ref], Some(cwd)).is_err()
        {
            return Err(AppError::new(
                "GIT_ERROR",
                format!("远程没有可用分支 origin/{remote_branch}，请确认仓库地址与权限"),
            ));
        }
        checkout_remote_branch(cwd, &remote_branch, &remote_ref)?;
        let _ = run_git(
            &[
                "branch",
                &format!("--set-upstream-to={remote_ref}"),
                &remote_branch,
            ],
            Some(cwd),
        );
        return Ok(());
    }

    if has_upstream(cwd) {
        return match run_git(&["pull", "--rebase"], Some(cwd)) {
            Ok(_) => Ok(()),
            Err(e) => {
                let msg = e.message.to_lowercase();
                if msg.contains("would be overwritten") || msg.contains("untracked working tree") {
                    remove_untracked_conflicts_with_remote(cwd, &remote_ref)?;
                    run_git(&["pull", "--rebase"], Some(cwd)).map(|_| ())
                } else {
                    Err(e)
                }
            }
        };
    }

    let local = current_branch_name(cwd);

    match run_git(
        &["pull", "--rebase", "origin", &remote_branch],
        Some(cwd),
    ) {
        Ok(_) => {}
        Err(e) => {
            let msg = e.message.to_lowercase();
            if msg.contains("unrelated histories") || msg.contains("refusing to merge") {
                remove_untracked_conflicts_with_remote(cwd, &remote_ref)?;
                run_git(
                    &[
                        "pull",
                        "--rebase",
                        "origin",
                        &remote_branch,
                        "--allow-unrelated-histories",
                    ],
                    Some(cwd),
                )?;
            } else if msg.contains("no tracking")
                || msg.contains("tracking information")
                || msg.contains("ambiguous argument")
                || msg.contains("would be overwritten")
                || msg.contains("untracked working tree")
            {
                checkout_remote_branch(cwd, &local, &remote_ref)?;
            } else {
                return Err(e);
            }
        }
    }

    let _ = run_git(
        &["branch", &format!("--set-upstream-to={remote_ref}"), &local],
        Some(cwd),
    );
    Ok(())
}

#[tauri::command]
pub fn git_pull(root: String, token: Option<String>) -> AppResult<()> {
    let repo = open_repo(&root)?;
    maybe_rewrite_origin(&repo, token.as_deref())?;
    pull_rebase(Path::new(&root))?;
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

    #[test]
    fn git_init_any_directory() {
        let dir = tempfile::tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir_all(&notes).unwrap();
        git_init(notes.to_string_lossy().to_string()).unwrap();
        assert!(notes.join(".git").exists());
    }
}
