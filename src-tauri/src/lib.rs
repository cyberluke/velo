#[cfg(not(target_os = "linux"))]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconId},
};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

mod commands;
mod files;
mod imap;
mod keychain;
mod links;
mod mcp;
mod net;
mod notifications;
mod oauth;
mod semantic_search;
mod smtp;

/// Linux-only startup workarounds.
#[cfg(target_os = "linux")]
mod linux {
    /// WebKitGTK's dmabuf renderer aborts on NVIDIA/nouveau hosts (see
    /// tauri-apps/tauri#10702 and #9304): the app dies before a window ever
    /// appears, leaving an empty splashscreen. The driver is detected at
    /// runtime — `/sys/module/<name>` exists once the kernel module is
    /// loaded — and dmabuf is switched off before WebKit initializes.
    fn nvidia_or_nouveau_loaded() -> bool {
        ["nvidia", "nouveau"].iter().any(|module| {
            std::path::Path::new(&format!("/sys/module/{module}")).exists()
        })
    }

    pub fn disable_webkit_dmabuf_rendering_if_needed() {
        if nvidia_or_nouveau_loaded() {
            eprintln!(
                "Note: NVIDIA or Nouveau detected, disabling dmabuf renderer. Expect degraded renderer performance."
            );
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("splashscreen") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, tooltip: String) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app
            .tray_by_id(&TrayIconId::new("main-tray"))
            .ok_or_else(|| "Tray icon not found".to_string())?;
        tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = tooltip;
        let _ = app;
        log::debug!("set_tray_tooltip is not supported on Linux (KSNI tray)");
        Ok(())
    }
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        w.open_devtools();
    }
}

/// The identifier the app carried before it was renamed to NAI E-Mail.
#[cfg(any(target_os = "macos", target_os = "linux"))]
const LEGACY_IDENTIFIER: &str = "com.velomail.app";

/// The identifier of the previous product name — for a fork that renames the
/// app (scripts/naiise.mjs), the data written by the app it replaces must
/// still be found. Spelled with a hex escape so automated branding renames
/// leave this historical value alone; at runtime it reads as the plain
/// identifier.
#[cfg(any(target_os = "macos", target_os = "linux"))]
const PREVIOUS_IDENTIFIER: &str = "com.anydaysomething.\x76elopro";

/// Carry the data directory over to the new bundle identifier.
///
/// Tauri names the application-support directory after the identifier, so
/// renaming the app pointed it at an empty one: the database, the attachment
/// cache and every account with it would have looked simply gone. This runs
/// before the SQL plugin opens anything, and it is a rename rather than a
/// copy — the same volume, so it costs nothing however large the mailbox is.
///
/// Every identifier the app carried before the current one is moved over;
/// a rename that only changed the suffix keeps the chain intact for the next
/// one. It only ever moves a directory *into* a name that does not exist yet,
/// so a second run, or a fresh install that never had the old name, does
/// nothing.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn migrate_legacy_data_dir(identifier: &str) {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
        return;
    };
    #[cfg(target_os = "macos")]
    let roots = [home.join("Library/Application Support"), home.join("Library/Logs")];
    #[cfg(target_os = "linux")]
    let roots = [home.join(".local/share"), home.join(".config")];

    for legacy in [LEGACY_IDENTIFIER, PREVIOUS_IDENTIFIER] {
        if legacy == identifier {
            continue;
        }
        for root in &roots {
            let (old, new) = (root.join(legacy), root.join(identifier));
            if old.is_dir() && !new.exists() {
                match std::fs::rename(&old, &new) {
                    Ok(()) => log::info!("Moved {} to {}", old.display(), new.display()),
                    Err(e) => log::error!("Could not move {} to {}: {e}", old.display(), new.display()),
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before any plugin opens a file under it
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    migrate_legacy_data_dir("com.anydaysomething.naiemail");

    // And before any window exists: this one can put a system dialog on
    // screen, which must not end up behind the always-on-top splash
    keychain::migrate_legacy_key();

    // Set explicit AUMID on Windows so toast notifications show "NAI E-Mail"
    // instead of "Windows PowerShell"
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.anydaysomething.naiemail"));
        }
    }

    // Must run before any WebKit view is created: on NVIDIA/nouveau hosts the
    // dmabuf renderer aborts at startup, so it is disabled at runtime.
    #[cfg(target_os = "linux")]
    linux::disable_webkit_dmabuf_rendering_if_needed();

    tauri::Builder::default()
        // Single instance MUST be first
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            // Forward args for deep linking
            let _ = app.emit("single-instance-args", argv);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        // Writing a one-time code to the clipboard has to work while the app is
        // in the background, which the webview's own clipboard API cannot do
        .plugin(tauri_plugin_clipboard_manager::init())
        // Sandboxed message frames cannot execute click listeners in WebKit.
        // Own their navigations natively and return them to the trusted UI.
        .plugin(links::init())
        // One IDLE watcher per account, held so a restart can replace rather
        // than duplicate them
        .manage(std::sync::Arc::new(crate::imap::idle::IdleRegistry::new()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            oauth::start_oauth_server,
            oauth::oauth_exchange_token,
            oauth::oauth_refresh_token,
            keychain::keychain_get_key,
            keychain::keychain_set_key,
            keychain::keychain_delete_key,
            keychain::keychain_available,
            net::unsubscribe_one_click,
            files::save_attachment,
            files::quicklook_attachment,
            set_tray_tooltip,
            close_splashscreen,
            open_devtools,
            semantic_search::semantic_search_status,
            semantic_search::semantic_search_set_enabled,
            semantic_search::semantic_search_configure,
            semantic_search::semantic_search_list_models,
            semantic_search::semantic_search_reindex,
            semantic_search::semantic_search_upsert_batch,
            semantic_search::semantic_search_gc,
            semantic_search::semantic_search_finish_index,
            semantic_search::semantic_search_index_error,
            notifications::notification_native_available,
            notifications::notification_native_request_permission,
            notifications::notification_native_register_categories,
            notifications::notification_native_show,
            notifications::notification_native_ready,
            commands::imap_start_idle,
            commands::imap_stop_idle,
            commands::imap_stop_all_idle,
            commands::imap_test_connection,
            commands::imap_list_folders,
            commands::imap_fetch_messages,
            commands::imap_fetch_new_uids,
            commands::imap_search_all_uids,
            commands::imap_fetch_message_body,
            commands::imap_fetch_raw_message,
            commands::imap_set_flags,
            commands::imap_move_messages,
            commands::imap_delete_messages,
            commands::imap_get_folder_status,
            commands::imap_fetch_attachment,
            commands::imap_append_message,
            commands::imap_search_folder,
            commands::imap_sync_folder,
            commands::imap_raw_fetch_diagnostic,
            commands::imap_delta_check,
            commands::smtp_send_email,
            commands::smtp_test_connection,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_status,
            mcp::mcp_respond,
        ])
        .setup(|app| {
            {
                let level = if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                };
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(level)
                        .level_for("sqlx::query", log::LevelFilter::Warn)
                        .build(),
                )?;
            }

            // Before the app finishes launching: a notification click that
            // starts NAI is delivered to whatever delegate exists by then
            notifications::install(app.handle().clone());
            semantic_search::install(app.handle());

            #[cfg(not(target_os = "linux"))]
            {
                // Build system tray menu
                let show = MenuItem::with_id(app, "show", "Show NAI", true, None::<&str>)?;
                let check_mail =
                    MenuItem::with_id(app, "check_mail", "Check for Mail", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &check_mail, &quit])?;

                let icon = app
                    .default_window_icon()
                    .cloned()
                    .expect("app should have a default icon configured in tauri.conf.json bundle");

                TrayIconBuilder::with_id("main-tray")
                    .icon(icon)
                    .tooltip("NAI E-Mail")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "check_mail" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-check-mail", ());
                            }
                        }
                        "quit" => {
                            // Destroy the windows before exiting so WebView2
                            // closes its controllers cleanly — exiting with
                            // the webviews still alive is what surfaces the
                            // benign "Chrome_WidgetWin_0" teardown noise on
                            // Windows.
                            for label in ["main", "splashscreen"] {
                                if let Some(window) = app.get_webview_window(label) {
                                    let _ = window.destroy();
                                }
                            }
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            #[cfg(target_os = "linux")]
            {
                use tray_item::{IconSource, TrayItem};

                let app_handle = app.handle().clone();

                std::thread::spawn(move || {
                    let mut tray = match TrayItem::new("NAI E-Mail", IconSource::Resource("mail-read")) {
                        Ok(t) => t,
                        Err(e) => {
                            log::warn!("Failed to create system tray: {e}");
                            return;
                        }
                    };

                    let app_handle_show = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Show NAI", move || {
                        if let Some(window) = app_handle_show.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }) {
                        log::warn!("Failed to add tray menu item 'Show NAI': {e}");
                    }

                    let app_handle_check = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Check for Mail", move || {
                        if let Some(window) = app_handle_check.get_webview_window("main") {
                            let _ = window.emit("tray-check-mail", ());
                        }
                    }) {
                        log::warn!("Failed to add tray menu item 'Check for Mail': {e}");
                    }

                    let app_handle_quit = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Quit", move || {
                        // Same clean teardown as the Windows/macOS tray: close
                        // the webviews first so WebView2 exits without noise.
                        for label in ["main", "splashscreen"] {
                            if let Some(window) = app_handle_quit.get_webview_window(label) {
                                let _ = window.destroy();
                            }
                        }
                        app_handle_quit.exit(0);
                    }) {
                        log::warn!("Failed to add tray menu item 'Quit': {e}");
                    }

                    loop {
                        std::thread::park();
                    }
                });
            }

            // On Windows/Linux, remove decorations for custom titlebar.
            // macOS uses titleBarStyle: "overlay" from config instead, which
            // preserves native event routing in WKWebView.
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            // Start hidden in tray if launched with --hidden (autostart)
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                // Also close splash screen when starting hidden
                if let Some(splash) = app.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close instead of quitting (main window only)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(manager) = app.try_state::<std::sync::Arc<semantic_search::SemanticSearchManager>>() {
                    manager.shutdown();
                }
            }
        });

    log::info!("Tauri application exited normally");
}
