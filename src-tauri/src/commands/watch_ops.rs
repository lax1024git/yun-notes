//! Watch the workspace directory and emit events when files change externally.

use crate::error::{AppError, AppResult};
use crate::skip::skip_fs_path;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

pub const WORK_FS_CHANGED_EVENT: &str = "work-fs-changed";
const DEBOUNCE: Duration = Duration::from_millis(800);

pub struct WorkWatchState {
    watcher: Option<RecommendedWatcher>,
    watched: Option<PathBuf>,
}

impl Default for WorkWatchState {
    fn default() -> Self {
        Self {
            watcher: None,
            watched: None,
        }
    }
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

    guard.watcher = None;
    guard.watched = None;

    let app_handle = app.clone();
    let pending = Arc::new(AtomicBool::new(false));
    let last_event = Arc::new(Mutex::new(Instant::now()));
    let pending_cb = pending.clone();
    let last_cb = last_event.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        let Ok(event) = res else {
            return;
        };
        if !event_is_interesting(&event.kind) {
            return;
        }
        if event.paths.iter().all(|p| skip_fs_path(p)) {
            return;
        }
        if let Ok(mut t) = last_cb.lock() {
            *t = Instant::now();
        }
        // Trailing debounce: emit once after events go quiet.
        if pending_cb
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let app_handle = app_handle.clone();
        let pending_cb = pending_cb.clone();
        let last_cb = last_cb.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(DEBOUNCE);
                let quiet = last_cb
                    .lock()
                    .ok()
                    .map(|t| t.elapsed() >= DEBOUNCE)
                    .unwrap_or(true);
                if quiet {
                    pending_cb.store(false, Ordering::SeqCst);
                    let _ = app_handle.emit(WORK_FS_CHANGED_EVENT, ());
                    break;
                }
            }
        });
    })
    .map_err(|e| AppError::new("IO_ERROR", format!("watch start failed: {e}")))?;

    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| AppError::new("IO_ERROR", format!("watch path failed: {e}")))?;

    guard.watcher = Some(watcher);
    guard.watched = Some(path);
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
