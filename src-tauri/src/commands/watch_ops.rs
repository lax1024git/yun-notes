//! Watch the plaintext `work/` directory and emit events when files change externally.

use crate::error::{AppError, AppResult};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

pub const WORK_FS_CHANGED_EVENT: &str = "work-fs-changed";

pub struct WorkWatchState {
    watcher: Option<RecommendedWatcher>,
    watched: Option<PathBuf>,
    /// Debounce emit storms from a single copy operation.
    last_emit: Instant,
}

impl Default for WorkWatchState {
    fn default() -> Self {
        Self {
            watcher: None,
            watched: None,
            last_emit: Instant::now()
                .checked_sub(Duration::from_secs(10))
                .unwrap_or_else(Instant::now),
        }
    }
}

fn should_ignore_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| {
            n.starts_with('.')
                || n.ends_with(".tmp")
                || n.eq_ignore_ascii_case("vault")
        })
        .unwrap_or(false)
}

fn event_is_interesting(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
    )
}

/// Start (or restart) watching `work_root` recursively. Emits `work-fs-changed`.
#[tauri::command]
pub fn watch_work_dir(
    app: AppHandle,
    work_root: String,
    state: State<'_, Mutex<WorkWatchState>>,
) -> AppResult<()> {
    let path = PathBuf::from(&work_root);
    if !path.is_dir() {
        return Err(AppError::new(
            "NOT_FOUND",
            format!("work directory not found: {work_root}"),
        ));
    }

    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("INTERNAL", "watch state lock poisoned"))?;

    if guard.watched.as_ref() == Some(&path) && guard.watcher.is_some() {
        return Ok(());
    }

    // Drop previous watcher
    guard.watcher = None;
    guard.watched = None;

    let app_handle = app.clone();
    let last_emit = std::sync::Arc::new(Mutex::new(
        Instant::now()
            .checked_sub(Duration::from_secs(10))
            .unwrap_or_else(Instant::now),
    ));
    let last_emit_cb = last_emit.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        let Ok(event) = res else {
            return;
        };
        if !event_is_interesting(&event.kind) {
            return;
        }
        if event.paths.iter().all(|p| should_ignore_path(p)) {
            return;
        }
        // ~250ms debounce on Rust side
        if let Ok(mut t) = last_emit_cb.lock() {
            let now = Instant::now();
            if now.duration_since(*t) < Duration::from_millis(250) {
                return;
            }
            *t = now;
        }
        let _ = app_handle.emit(WORK_FS_CHANGED_EVENT, ());
    })
    .map_err(|e| AppError::new("IO_ERROR", format!("watch start failed: {e}")))?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| AppError::new("IO_ERROR", format!("watch path failed: {e}")))?;

    guard.watcher = Some(watcher);
    guard.watched = Some(path);
    guard.last_emit = Instant::now()
        .checked_sub(Duration::from_secs(10))
        .unwrap_or_else(Instant::now);
    Ok(())
}

#[tauri::command]
pub fn unwatch_work_dir(state: State<'_, Mutex<WorkWatchState>>) -> AppResult<()> {
    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("INTERNAL", "watch state lock poisoned"))?;
    guard.watcher = None;
    guard.watched = None;
    Ok(())
}
