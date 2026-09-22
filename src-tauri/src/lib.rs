mod commands;
mod crypto;
mod error;

use commands::{app_lock, fs_ops, git_ops, gitee_ops, sync_ops, watch_ops};
use crypto::{CryptoSession, SharedCryptoSession};
use std::sync::Mutex;
use watch_ops::WorkWatchState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(CryptoSession::default()) as SharedCryptoSession)
        .manage(Mutex::new(WorkWatchState::default()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let ctrl_shift_n =
                            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
                        let cmd_shift_n =
                            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
                        if shortcut == &ctrl_shift_n || shortcut == &cmd_shift_n {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(desktop)]
            {
                let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("Note Workstation")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                let ctrl_shift_n =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
                app.global_shortcut().register(ctrl_shift_n)?;
                #[cfg(target_os = "macos")]
                {
                    let cmd_shift_n =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
                    app.global_shortcut().register(cmd_shift_n)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs_ops::scan_workspace,
            fs_ops::read_md,
            fs_ops::write_md,
            fs_ops::create_file,
            fs_ops::create_dir,
            fs_ops::delete_path,
            fs_ops::rename_path,
            fs_ops::search_files,
            git_ops::git_init,
            git_ops::git_status,
            git_ops::git_commit,
            git_ops::git_log,
            git_ops::git_clone,
            git_ops::git_get_remote,
            git_ops::git_set_remote,
            git_ops::git_push,
            git_ops::git_pull,
            gitee_ops::gitee_build_auth_url,
            gitee_ops::gitee_get_user,
            gitee_ops::gitee_list_repos,
            gitee_ops::gitee_create_repo,
            app_lock::app_lock_hash,
            app_lock::app_lock_verify,
            app_lock::crypto_session_set,
            app_lock::crypto_session_clear,
            app_lock::crypto_session_ready,
            sync_ops::encrypt_work_to_vault,
            sync_ops::decrypt_vault_to_work,
            sync_ops::decrypt_vault_to_work_if_needed,
            sync_ops::rekey_vault_from_work,
            sync_ops::rekey_workspace,
            sync_ops::project_ensure,
            sync_ops::project_resolve,
            sync_ops::project_init,
            fs_ops::seal_plaintext_notes,
            fs_ops::export_decrypted,
            watch_ops::watch_work_dir,
            watch_ops::unwatch_work_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        // 有托盘时关窗口不会自动退出进程；点关闭应真正退出
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            api.prevent_close();
            app_handle.exit(0);
        }
        _ => {}
    });
}
