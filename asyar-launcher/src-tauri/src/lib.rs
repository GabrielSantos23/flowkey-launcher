#[allow(unused_imports)]
use tauri::{Emitter, Listener, Manager};

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::extensions::extension_runtime::{
    ticker as extension_runtime_ticker, ExtensionRuntimeManager, RuntimeConfig,
};

/// Shared application state managed by Tauri's state system.
pub struct AppState {
    /// When `true`, prevents the launcher window from losing keyboard focus.
    pub focus_locked: AtomicBool,
    /// Maps shortcut strings (e.g. `"Alt+Space"`) to the object ID they activate.
    pub user_shortcuts: Mutex<HashMap<String, String>>,
    /// The current global shortcut string used to show/hide the launcher.
    pub launcher_shortcut: Mutex<String>,
    /// When `true`, the text snippet expansion listener is active.
    pub snippets_enabled: AtomicBool,
    /// Tracks whether the launcher window is currently visible.
    pub asyar_visible: AtomicBool,
    /// Mirrors `!isCompactIdle` from the TS side — true whenever the launcher
    /// is in an expanded state the user has committed to (typed query, active
    /// extension view, active context chip, Show More click). Read by the
    /// panel resign handler to decide whether to reset compact geometry on
    /// hide. TS owns the decision because it depends on UI-only state
    /// (navigation stack, context chips); Rust just receives the answer.
    pub launcher_keep_expanded: AtomicBool,
    /// The currently active snippet definitions (keyword → expansion text).
    pub active_snippets: Mutex<HashMap<String, String>>,
    /// Per-extension contributed shortcode → expansion maps, merged into the
    /// active matcher view at lookup time. User-created snippets in
    /// `active_snippets` shadow these on key collision.
    pub contributed_snippets: Mutex<crate::snippets::ContributedSnippets>,
    /// Active trigger characters/delimiters for shortcode miss events.
    pub shortcode_triggers: Mutex<Vec<String>>,
    /// Guards against registering the global event listener more than once.
    pub listener_started: AtomicBool,
    /// Handle to the previously focused window, restored when the launcher hides (Windows only).
    pub previous_hwnd: Mutex<isize>,
    /// Set during snippet expansion to suppress the monitor from re-triggering.
    pub is_expanding: AtomicBool,
}

use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
mod aliases;
pub mod app_events;
pub mod app_updater;
pub mod application;
pub mod auth;
pub mod browser;
pub mod calculator;
pub mod clipboard_cache;
pub mod clipboard_markup;
pub mod clipboard_privacy;
pub mod color_sampler;
pub mod commands;
pub mod crypto;
pub mod deeplink;
pub mod diagnostics;
pub mod error;
pub mod event_bridge;
pub mod event_hub;
pub mod ext_overrides;
pub mod extension_tray;
pub mod extensions;
pub mod feedback;
pub mod file_index;
pub mod files_scope;
pub mod fs_watcher;
pub mod index_events;
pub mod island_window;
mod launcher;
pub mod launcher_placement;
pub mod locale;
pub mod media_watcher;
pub mod network;
mod notes_export;
pub mod notifications;
pub mod oauth;
pub mod onboarding;
pub mod opener_scope;
pub mod permissions;
pub mod platform;
pub mod power;
pub mod process_manager;
pub mod profile;
pub mod raycast_import;
pub mod runs;
pub mod runtimes;
mod scheduler;
pub mod scripts;
mod search_engine;
pub mod secret_detection;
pub mod selection;
pub mod shell;
pub mod snap_guides;
mod snippets;
pub mod sticky_window;
pub mod storage;
pub mod sync;
pub mod system_actions;
pub mod system_events;
pub mod templating;
pub mod thumbnail;
pub mod timers;
pub mod tray;
pub mod uri_schemes;
pub mod usage;
pub mod walkthrough;
pub mod window_drag;
pub mod window_management;

pub const SPOTLIGHT_LABEL: &str = "main";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launcher_coordinator = std::sync::Arc::new(launcher::LauncherCoordinator::new());
    let single_instance_coordinator = launcher_coordinator.clone();

    let builder = tauri::Builder::default()
        // Single-instance must be the FIRST plugin: it intercepts a second
        // launch before other plugins initialize, and (with the "deep-link"
        // feature) forwards that instance's asyar:// URL argv into on_open_url
        // — the only way a deep link reaches an already-running app.
        .plugin(tauri_plugin_single_instance::init(
            move |app, args, _cwd| {
                let scheme = deeplink::deep_link_scheme(app);

                if let Some(action) = launcher::classify_secondary_launch(&args, scheme) {
                    if let Err(error) = single_instance_coordinator.request(action) {
                        log::warn!("[launcher] failed to queue secondary launch action: {error}");
                    }
                }
            },
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    #[cfg(debug_assertions)]
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                // The plugin defaults to Trace; a release build must not
                // pay for TRACE-file logging (e.g. `wmi` logs one line per
                // WMI query) on the hot path.
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .level_for("wmi", log::LevelFilter::Warn)
                .level_for("axum", log::LevelFilter::Warn)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("hyper_util", log::LevelFilter::Warn)
                .level_for("tower_http", log::LevelFilter::Warn)
                .level_for("tokio_tungstenite", log::LevelFilter::Warn)
                .level_for("tungstenite", log::LevelFilter::Warn)
                .level_for("keyring", log::LevelFilter::Warn)
                .level_for("mio", log::LevelFilter::Warn)
                .level_for("notify", log::LevelFilter::Warn)
                .level_for("notify_debouncer_full", log::LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init());

    builder
        .register_uri_scheme_protocol("asyar-extension", |ctx, req| {
            uri_schemes::handle_extension_request(ctx.app_handle(), req)
        })
        .register_uri_scheme_protocol("asyar-icon", |ctx, req| {
            uri_schemes::handle_icon_request(ctx.app_handle(), req)
        })
        .register_uri_scheme_protocol("asyar-thumb", |ctx, req| {
            uri_schemes::handle_thumbnail_request(ctx.app_handle(), req)
        })
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    commands::handle_shortcut(app, shortcut, event);
                })
                .build(),
        )
        .manage(extensions::headless::HeadlessRegistry(Mutex::new(
            HashMap::new(),
        )))
        .manage(extensions::ExtensionRegistryState::new())
        .manage(extensions::dynamic_commands::DynamicCommandRegistry::new())
        .manage(permissions::ExtensionPermissionRegistry::new())
        .manage(network::websocket::WebSocketManager::new())
        .manage(auth::state::AuthState::default())
        .manage(auth::api_client::ApiClient::new())
        .manage(oauth::OAuthPendingFlowState::new())
        .manage(deeplink::PendingDeeplinks::default())
        .manage(island_window::IslandState::default())
        .manage(snap_guides::SnapGuidesState::default())
        .manage(shell::ShellProcessRegistry::new())
        .manage(extensions::scheduler::SchedulerState::new())
        .manage(scripts::InlineSchedulerState::new())
        .manage(std::sync::Arc::new(ExtensionRuntimeManager::new(
            RuntimeConfig::default(),
        )))
        .manage(extensions::onboarding_intercept::StashRegistry::default())
        .manage(app_updater::AppUpdaterState::new())
        .manage(scheduler::Scheduler::new())
        .manage(power::PowerRegistry::new(power::default_backend()))
        .manage(std::sync::Arc::new(
            system_actions::SystemActionsState::new(system_actions::default_backend()),
        ))
        .manage(std::sync::Arc::new(system_events::SystemEventsHub::new()))
        .manage(std::sync::Arc::new(app_events::AppEventsHub::new()))
        .manage(std::sync::Arc::new(index_events::IndexEventsHub::new()))
        .manage(std::sync::Arc::new(fs_watcher::FsWatcherRegistry::new()))
        .manage(clipboard_privacy::ClipboardPrivacyState::new())
        .manage(commands::clipboard_privacy::UserDenylist::new())
        .manage(secret_detection::SecretDetectionState::new())
        .manage::<std::sync::Arc<dyn app_events::AppPresenceQuery>>(std::sync::Arc::from(
            app_events::default_presence_query(),
        ))
        .manage(calculator::CalculatorState::default())
        .manage(runtimes::RuntimeManager::new())
        .manage(feedback::channel::FeedbackChannelState::default())
        .manage(feedback::PendingCrash::default())
        .manage(locale::LocaleService::new())
        .manage(launcher_coordinator)
        .manage(AppState {
            focus_locked: AtomicBool::new(false),
            user_shortcuts: Mutex::new(HashMap::new()),
            launcher_shortcut: Mutex::new(String::from("Alt+Space")),
            snippets_enabled: AtomicBool::new(false),
            asyar_visible: AtomicBool::new(false),
            launcher_keep_expanded: AtomicBool::new(false),
            active_snippets: Mutex::new(HashMap::new()),
            contributed_snippets: Mutex::new(HashMap::new()),
            shortcode_triggers: Mutex::new(vec![":".to_string()]),
            listener_started: AtomicBool::new(false),
            previous_hwnd: Mutex::new(0),
            is_expanding: AtomicBool::new(false),
        })
        .manage(crate::onboarding::commands::OnboardingCursor::new())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            deeplink::flush_pending_deeplinks,
            scheduler::get_scheduler_snapshot,
            event_bridge::bridge_poll,
            commands::set_focus_lock,
            commands::feedback_publish,
            commands::feedback_get_current,
            commands::feedback_update_progress,
            commands::feedback_finish_progress,
            commands::feedback_dismiss,
            commands::feedback_accept_announcement,
            commands::set_launcher_keep_expanded,
            commands::set_launcher_height,
            commands::confirm_launcher_paint,
            commands::cancel_launcher_resize,
            commands::set_panel_appearance,
            commands::set_dock_icon_visible,
            commands::set_tray_icon_visible,
            commands::quit_app,
            commands::list_applications,
            commands::sync_application_index,
            commands::get_frontmost_application,
            commands::get_default_app_scan_paths,
            commands::normalize_scan_path,
            commands::show,
            commands::prepare_show,
            commands::commit_show,
            commands::is_visible,
            commands::hide,
            commands::show_island,
            commands::hide_island,
            commands::get_island_state,
            commands::get_snap_guide_state,
            commands::island_mark_shown,
            commands::simulate_paste,
            commands::check_accessibility_permission,
            commands::update_global_shortcut,
            commands::get_persisted_shortcut,
            commands::initialize_shortcut_from_settings,
            commands::initialize_autostart_from_settings,
            commands::get_autostart_status,
            commands::check_path_exists,
            commands::filter_compatible_extensions,
            commands::uninstall_extension,
            commands::open_application_path,
            commands::uninstall_application,
            commands::scan_uninstall_targets,
            commands::get_extensions_dir,
            commands::list_installed_extensions,
            commands::get_builtin_features_path,
            commands::register_dev_extension,
            commands::get_dev_extension_paths,
            commands::discover_extensions,
            commands::set_extension_enabled,
            commands::get_extension,
            commands::get_scheduled_tasks,
            commands::extension_runtime::dispatch_to_extension,
            commands::extension_runtime::iframe_ready_ack,
            commands::extension_runtime::iframe_unmount_ack,
            commands::extension_runtime::iframe_mount_timeout_reported,
            commands::extension_runtime::get_extension_runtime_snapshot,
            commands::extension_runtime::force_remount_worker,
            commands::extension_runtime::restore_workers,
            commands::extension_state::state_get,
            commands::extension_state::state_get_all,
            commands::extension_state::state_get_subscriptions,
            commands::extension_state::state_set,
            commands::extension_state::state_subscribe,
            commands::extension_state::state_unsubscribe,
            commands::extension_state::state_clear,
            commands::extension_state::state_rpc_request,
            commands::extension_state::state_rpc_abort,
            commands::extension_state::state_rpc_reply,
            commands::fs_watcher::fs_watch_create,
            commands::fs_watcher::fs_watch_dispose,
            search_engine::commands::index_item,
            search_engine::commands::favorite_toggle,
            search_engine::commands::favorites_list,
            search_engine::commands::batch_index_items,
            search_engine::commands::save_search_index,
            search_engine::commands::search_items,
            search_engine::commands::merged_search,
            search_engine::commands::rank_items,
            search_engine::commands::classify_items,
            search_engine::commands::sync_command_index,
            search_engine::commands::get_indexed_object_ids,
            search_engine::commands::delete_item,
            search_engine::commands::reset_search_index,
            search_engine::commands::record_item_usage,
            search_engine::commands::update_command_metadata,
            commands::dynamic_commands::replace_dynamic_commands,
            commands::dynamic_commands::replace_dynamic_commands_builtin,
            commands::dynamic_commands::get_dynamic_command_meta,
            commands::scripts::scripts_add_directory,
            commands::scripts::scripts_remove_directory,
            commands::scripts::scripts_list_directories,
            commands::scripts::scripts_pick_directory,
            commands::scripts::scripts_rescan,
            commands::scripts::scripts_make_executable,
            commands::scripts::scripts_set_inline_scripts,
            commands::calculator::calculator_evaluate,
            commands::calculator::calculator_configure,
            commands::calculator::calculator_refresh_rates,
            commands::browser::browser_list_available_browsers,
            commands::browser::browser_is_companion_installed,
            commands::browser::browser_list_bookmarks,
            commands::browser::browser_search_history,
            commands::browser::browser_list_tabs,
            commands::browser::browser_get_active_tab,
            commands::browser::browser_activate_tab,
            commands::browser::browser_close_tab,
            commands::browser::browser_open_url,
            commands::opener_open_url,
            commands::opener_open_path,
            commands::opener_reveal,
            commands::browser::browser_list_paired_browsers,
            commands::browser::browser_list_pending_pairings,
            commands::browser::browser_resolve_pairing,
            commands::browser::browser_revoke_pairing,
            commands::browser::browser_events_subscribe,
            commands::browser::browser_events_unsubscribe,
            commands::browser::browser_get_current_page,
            commands::browser::browser_query_page,
            commands::browser::browser_act_on_page,
            commands::browser::browser_search_web,
            commands::browser::browser_get_most_recent_active_browser,
            commands::write_binary_file_recursive,
            commands::write_text_file_absolute,
            commands::read_text_file_absolute,
            commands::read_text_preview,
            commands::files_read_text,
            commands::files_glob,
            commands::files_thumbnail,
            commands::mkdir_absolute,
            commands::spawn_headless_extension,
            commands::kill_extension,
            commands::fetch_url,
            commands::ws_connect,
            commands::ws_send,
            commands::ws_close,
            crate::notifications::commands::send_notification,
            crate::notifications::commands::dismiss_notification,
            commands::register_item_shortcut,
            commands::unregister_item_shortcut,
            commands::pause_user_shortcuts,
            commands::resume_user_shortcuts,
            commands::pause_all_shortcuts,
            commands::resume_all_shortcuts,
            extension_tray::commands::tray_register_item,
            extension_tray::commands::tray_update_item,
            extension_tray::commands::tray_unregister_item,
            extension_tray::commands::tray_remove_all_for_extension,
            commands::expand_and_paste,
            commands::sync_snippets_to_rust,
            commands::set_snippets_enabled,
            commands::check_snippet_permission,
            commands::open_accessibility_preferences,
            commands::contribute_shortcodes,
            commands::revoke_shortcodes,
            permissions::register_extension_permissions,
            permissions::check_extension_permission,
            extensions::consent::check_extension_consent,
            extensions::consent::set_extension_consent,
            extensions::consent::revoke_extension_consent,
            commands::auth_initiate,
            commands::auth_poll,
            commands::auth_load_cached,
            commands::auth_get_state,
            commands::auth_refresh_entitlements,
            commands::auth_logout,
            commands::gate_check,
            commands::submit_feedback,
            commands::get_system_locale,
            commands::get_locale_candidates,
            commands::get_pending_crash,
            commands::send_pending_crash,
            commands::usage::record_active_day,
            commands::usage::get_usage_stats,
            commands::usage::get_usage_anon_id,
            commands::usage::reset_usage_anon_id,
            commands::usage::send_pending_usage,
            commands::usage::send_usage_now,
            commands::walkthrough::sync_walkthrough_tasks,
            commands::walkthrough::get_walkthrough,
            commands::walkthrough::complete_walkthrough_task,
            commands::walkthrough::uncomplete_walkthrough_task,
            commands::walkthrough::complete_all_walkthrough_tasks,
            commands::walkthrough::set_walkthrough_dismissed,
            commands::walkthrough::reset_walkthrough,
            commands::dismiss_pending_crash,
            commands::sync::sync_run,
            commands::sync::sync_get_status,
            commands::sync::sync_mark_tombstone,
            commands::sync_e2ee::sync_e2ee_get_status,
            commands::sync_e2ee::sync_e2ee_enrol,
            commands::sync_e2ee::sync_e2ee_unlock,
            commands::sync_e2ee::sync_e2ee_rotate,
            commands::sync_e2ee::sync_e2ee_recover_with_mnemonic,
            commands::sync_e2ee::sync_e2ee_disable,
            commands::sync_e2ee::sync_e2ee_show_recovery_phrase,
            commands::export_profile,
            commands::import_profile,
            commands::show_save_profile_dialog,
            commands::show_open_profile_dialog,
            commands::install_extension_from_file,
            commands::show_open_extension_dialog,
            commands::inspect_extension_folder,
            commands::show_open_folder_dialog,
            commands::get_theme_definition,
            commands::get_valid_shortcut_keys,
            // Storage: clipboard
            storage::commands::clipboard_list_initial,
            storage::commands::clipboard_list_older,
            storage::commands::clipboard_search,
            storage::commands::clipboard_get_item,
            storage::commands::clipboard_get_merged_text,
            storage::commands::clipboard_export_for_sync,
            storage::commands::clipboard_count,
            storage::commands::clipboard_record_capture,
            storage::commands::clipboard_toggle_favorite,
            storage::commands::clipboard_delete_item,
            storage::commands::clipboard_clear_non_favorites,
            commands::clipboard_markup::clipboard_strip_html,
            commands::clipboard_markup::clipboard_strip_rtf,
            clipboard_cache::commands::clipboard_adopt_image,
            clipboard_cache::commands::clipboard_forget_image,
            // Storage: snippets
            storage::commands::snippet_upsert,
            storage::commands::snippet_get_all,
            storage::commands::snippet_remove,
            storage::commands::snippet_toggle_pin,
            storage::commands::snippet_clear_all,
            // Storage: notes
            storage::commands::note_upsert,
            storage::commands::note_get_all,
            storage::commands::note_get_by_id,
            storage::commands::note_update,
            storage::commands::note_remove,
            storage::commands::note_toggle_pin,
            storage::commands::note_search,
            storage::commands::note_find,
            storage::commands::note_backlinks,
            storage::commands::note_export_markdown,
            // Sticky notes (one always-on-top window per pinned note)
            window_drag::window_drag_start,
            window_drag::window_drag_move,
            window_drag::window_drag_end,
            launcher_placement::commands::get_launcher_placement,
            launcher_placement::commands::set_launcher_placement,
            sticky_window::sticky_open,
            sticky_window::sticky_close,
            sticky_window::sticky_new,
            sticky_window::sticky_is_stuck,
            sticky_window::sticky_list,
            sticky_window::sticky_save_geometry,
            // Raycast import
            commands::raycast_import::raycast_import_parse,
            // Storage: shortcuts
            storage::commands::shortcut_upsert,
            storage::commands::shortcut_get_all,
            storage::commands::shortcut_remove,
            // Storage: extension key-value
            storage::commands::ext_kv_get,
            storage::commands::ext_kv_set,
            storage::commands::ext_kv_delete,
            storage::commands::ext_kv_get_all,
            storage::commands::ext_kv_clear,
            // Storage: extension cache
            storage::commands::ext_cache_get,
            storage::commands::ext_cache_set,
            storage::commands::ext_cache_delete,
            storage::commands::ext_cache_clear,
            commands::get_selected_text,
            commands::get_selected_finder_items,
            // OAuth PKCE for extensions
            commands::oauth_start_flow,
            commands::oauth_exchange_code,
            commands::oauth_get_stored_token,
            commands::spotify_smtc_command,
            commands::oauth_get_stored_token_refreshable,
            commands::oauth_revoke_extension_token,
            commands::oauth_refresh_token,
            commands::shell_spawn,
            commands::shell_kill,
            commands::shell_list,
            commands::shell_attach,
            commands::shell_write_stdin,
            commands::shell_close_stdin,
            commands::shell_resolve_path,
            commands::shell_check_trust,
            commands::shell_grant_trust,
            commands::shell_revoke_trust,
            commands::shell_list_trusted,
            commands::show_in_file_manager,
            commands::trash_path,
            commands::open_in_terminal,
            commands::quick_look_path,
            file_index::commands::file_search,
            file_index::commands::file_index_status,
            file_index::commands::file_index_rebuild,
            file_index::commands::file_index_set_config,
            file_index::commands::file_search_record_selection,
            file_index::commands::file_search_pin,
            file_index::commands::file_search_unpin,
            file_index::commands::file_search_list_pinned,
            file_index::commands::file_search_clear_history,
            file_index::commands::deep_search_availability,
            file_index::commands::deep_search,
            thumbnail::commands::get_file_thumbnail,
            commands::extension_preferences_get_all,
            commands::extension_preferences_set,
            commands::extension_preferences_reset,
            commands::extension_preferences_export_all,
            commands::extension_preferences_import_all,
            commands::command_arg_defaults_get,
            commands::command_arg_defaults_set,
            commands::resolve_command_arguments,
            commands::searchbar_accessory_get,
            commands::searchbar_accessory_set,
            commands::window_management_get_bounds,
            commands::window_management_set_bounds,
            commands::window_management_set_fullscreen,
            commands::window_management_get_monitors,
            commands::window_management_apply_preset,
            commands::app_updater_check_now,
            commands::app_updater_get_pending,
            commands::app_relaunch,
            commands::app_updater_should_show_whats_new,
            commands::factory_reset,
            commands::power_keep_awake,
            commands::power_release,
            commands::power_list,
            commands::system_actions_supported,
            commands::system_action_run,
            commands::screen_pick_color,
            commands::process::process_list,
            commands::process::process_kill,
            commands::system_events_subscribe,
            commands::system_events_unsubscribe,
            commands::app_events_subscribe,
            commands::app_events_unsubscribe,
            commands::app_is_running,
            commands::application_index_subscribe,
            commands::application_index_unsubscribe,
            commands::set_application_scan_paths,
            commands::timer_schedule,
            commands::timer_cancel,
            commands::timer_list,
            // Aliases
            aliases::commands::set_alias,
            aliases::commands::unset_alias,
            aliases::commands::list_aliases,
            aliases::commands::find_alias_conflict,
            aliases::commands::get_indexed_items,
            // Onboarding (app-level wizard)
            crate::onboarding::commands::get_onboarding_state,
            crate::onboarding::commands::advance_onboarding_step,
            crate::onboarding::commands::go_back_onboarding_step,
            crate::onboarding::commands::complete_onboarding,
            crate::onboarding::commands::dismiss_onboarding,
            crate::onboarding::commands::reset_onboarding,
            // Per-extension onboarding
            commands::extension_onboarding::complete_extension_onboarding,
            commands::extension_onboarding::reset_extension_onboarding,
            commands::extension_onboarding::is_extension_onboarded,
            // Clipboard capture-time privacy filter
            commands::clipboard_privacy::clipboard_privacy_classify,
            commands::clipboard_privacy::clipboard_privacy_get_session_stats,
            commands::clipboard_privacy::clipboard_privacy_set_user_denylist,
            commands::clipboard_privacy::clipboard_privacy_get_user_denylist,
            commands::clipboard_privacy::clipboard_privacy_get_default_denylist,
            // Secret-format redaction
            commands::secret_detection::secret_detection_redact,
            commands::secret_detection::secret_detection_get_session_stats,
            commands::secret_detection::secret_detection_get_catalog,
            // At-rest encryption status + IPC-side encrypt/decrypt
            commands::crypto::crypto_get_status,
            commands::crypto::crypto_encrypt,
            commands::crypto::crypto_decrypt,
            // Run tracker
            commands::runs::runs_start,
            commands::runs::runs_write,
            commands::runs::runs_done,
            commands::runs::runs_fail,
            commands::runs::runs_cancel,
            commands::runs::runs_list,
            commands::runs::runs_get,
            commands::runs::runs_history_list,
            commands::runs::runs_history_clear,
            commands::runs::runs_get_output,
            commands::runs::runs_dismiss,
            commands::runs::runs_upsert_bucket,
            commands::templating::resolve_template,
            commands::templating::get_available_placeholders,
            // On-demand sidecar runtimes (bun/uv).
            commands::runtimes::resolve_runtime,
            commands::runtimes::ensure_runtime,
            commands::runtimes::download_runtime,
            commands::runtimes::list_runtimes,
            commands::runtimes::remove_runtime,
            commands::runtimes::get_runtime_download_sizes,
            commands::runtimes::get_runtime_consumers,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // Closing a window must NEVER quit Asyar — it lives in the tray and
            // is summoned by hotkey, so windows come and go (sticky notes,
            // settings, onboarding). Tauri's default is to exit once the last
            // window closes; every intentional quit path (tray menu, the Quit
            // command, factory reset) calls `app.exit(0)` instead, which
            // carries an exit code. Only those are allowed through.
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } => {
                api.prevent_exit();
            }
            // Clear the run marker on graceful exit so the next launch does not
            // mistake a clean shutdown for a crash.
            tauri::RunEvent::Exit => {
                if let Ok(data_dir) = app_handle.path().app_data_dir() {
                    feedback::crash_reporter::remove_marker(&data_dir);
                }
            }
            _ => {}
        });
}

/// Reads `settings.appearance.launchView` from `settings.dat` synchronously,
/// so setup_app can seed the correct launcher geometry before window show.
/// Falling back to "default" matches the JS DEFAULT_SETTINGS for fresh installs.
fn read_launch_view(app: &tauri::AppHandle) -> &'static str {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("settings.dat") else {
        return "default";
    };
    parse_launch_view(store.get("settings").as_ref())
}

/// The user's explicit theme preference, read from `settings.dat` on startup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemePreference {
    Light,
    Dark,
    System,
}

/// Maps the JS string argument sent by `set_panel_appearance` to a
/// `ThemePreference`. Unknown strings fall back to `System` (safe default).
pub fn parse_theme_preference_str(s: &str) -> ThemePreference {
    match s {
        "light" => ThemePreference::Light,
        "dark" => ThemePreference::Dark,
        _ => ThemePreference::System,
    }
}

/// Pure JSON-navigation helper for `appearance.theme`.
/// Returns `System` on missing/unknown values, matching JS defaults.
pub fn parse_appearance_theme(settings_root: Option<&serde_json::Value>) -> ThemePreference {
    match settings_root
        .and_then(|s| s.get("appearance"))
        .and_then(|a| a.get("theme"))
        .and_then(|v| v.as_str())
    {
        Some("light") => ThemePreference::Light,
        Some("dark") => ThemePreference::Dark,
        _ => ThemePreference::System,
    }
}

/// Pure JSON-navigation helper for `general.showTrayIcon`.
/// Defaults to `true` (tray icon visible by default).
pub fn parse_show_tray_icon(settings_root: Option<&serde_json::Value>) -> bool {
    settings_root
        .and_then(|s| s.get("general"))
        .and_then(|g| g.get("showTrayIcon"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Reads `settings.general.showTrayIcon` from `settings.dat` synchronously.
pub fn read_show_tray_icon(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("settings.dat") else {
        return true;
    };
    parse_show_tray_icon(store.get("settings").as_ref())
}

/// Pure JSON-navigation helper for `general.showDockIcon`.
/// Defaults to `false` (hidden from Dock / Taskbar).
pub fn parse_show_dock_icon(settings_root: Option<&serde_json::Value>) -> bool {
    settings_root
        .and_then(|s| s.get("general"))
        .and_then(|g| g.get("showDockIcon"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Reads `settings.general.showDockIcon` from `settings.dat` synchronously.
pub fn read_show_dock_icon(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("settings.dat") else {
        return false;
    };
    parse_show_dock_icon(store.get("settings").as_ref())
}

/// Pure JSON-navigation helper extracted from `read_launch_view`. Returns
/// `"compact"` only when the value at `appearance.launchView` is the string
/// `"compact"`; any other shape or value yields `"default"`.
fn parse_launch_view(settings_root: Option<&serde_json::Value>) -> &'static str {
    let is_compact = settings_root
        .and_then(|s| s.get("appearance"))
        .and_then(|a| a.get("launchView"))
        .and_then(|v| v.as_str())
        == Some("compact");
    if is_compact {
        "compact"
    } else {
        "default"
    }
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Honor any pending factory-reset request from the previous session
    if commands::perform_pending_factory_reset_if_marked(app.handle()) {
        log::warn!("[setup_app] factory reset performed; continuing fresh boot");
    }

    let launcher_coordinator = app
        .state::<std::sync::Arc<launcher::LauncherCoordinator>>()
        .inner()
        .clone();
    launcher_coordinator
        .attach_app(app.handle().clone())
        .map_err(|error| format!("failed to attach launcher coordinator: {error}"))?;

    let initial_args = std::env::args().collect::<Vec<_>>();
    if let Some(action) =
        launcher::classify_initial_launch(&initial_args, deeplink::deep_link_scheme(app.handle()))
    {
        launcher_coordinator
            .request(action)
            .map_err(|error| format!("failed to queue initial launcher action: {error}"))?;
    }

    tray::setup_tray(app)?;

    // Watch the OS media session (Windows SMTC) so track changes — including
    // plays started inside Spotify itself — can drive the Dynamic Island.
    media_watcher::spawn(app.handle().clone());

    // Install a panic hook that emits a `feedback:report` event before
    // the process unwinds.
    {
        let app_handle = app.handle().clone();
        std::panic::set_hook(Box::new(move |info| {
            let location = info
                .location()
                .map(|l| format!("{}:{}", l.file(), l.line()))
                .unwrap_or_else(|| "unknown".into());
            let detail = info.to_string();
            let payload = serde_json::json!({
                "source": "rust",
                "kind": "panic",
                "severity": "fatal",
                "retryable": false,
                "context": { "location": location },
                "developerDetail": detail,
            });
            let _ = tauri::Emitter::emit(&app_handle, "feedback:report", payload);
            log::error!("panic: {info}");
        }));
    }

    // Long-poll IPC bridge: queue Rust->JS events for `bridge_poll` instead
    // of letting Tauri `app.emit` eval-format each one in the webview.
    app.manage(std::sync::Arc::new(event_bridge::EventBridge::default()));

    // ── Crash-report detection (next launch) ──────────────────────────────
    {
        use tauri_plugin_store::StoreExt;
        let handle = app.handle().clone();

        if let Ok(data_dir) = app.path().app_data_dir() {
            let _ = std::fs::create_dir_all(&data_dir);
            let marker_exists = data_dir
                .join(feedback::crash_reporter::MARKER_FILE)
                .exists();

            if feedback::crash_reporter::crashed_last_run(marker_exists) {
                if let Some((panic_msg, backtrace)) =
                    feedback::crash_reporter::read_and_clear_crash(&data_dir)
                {
                    let log_path = app
                        .path()
                        .app_log_dir()
                        .map(|d| d.join("asyar.log"))
                        .unwrap_or_default();
                    let log_tail = feedback::crash_reporter::read_log_tail(&log_path, 64 * 1024);
                    let payload = feedback::CrashPayload {
                        panic: panic_msg,
                        backtrace,
                        log_tail,
                    };

                    let mode = handle
                        .store("settings.dat")
                        .ok()
                        .and_then(|s| s.get("settings"))
                        .map(|v| feedback::parse_crash_report_mode(&v.to_string()))
                        .unwrap_or(feedback::CrashReportMode::Off);
                    let action = feedback::decide_crash_action(mode, true);
                    log::info!(
                        "crash-report: previous run crashed; mode={mode:?} action={action:?}"
                    );

                    match action {
                        feedback::CrashAction::SendSilently => {
                            let api = (*app.state::<auth::api_client::ApiClient>()).clone();
                            let token = app
                                .state::<auth::state::AuthState>()
                                .token
                                .lock()
                                .ok()
                                .and_then(|t| t.clone());
                            let report = feedback::build_report(
                                feedback::FeedbackInput {
                                    kind: "crash".into(),
                                    category: None,
                                    message: None,
                                    email: None,
                                },
                                Some(payload),
                            );
                            tauri::async_runtime::spawn(async move {
                                match api.submit_feedback(&report, token.as_deref()).await {
                                    Ok(()) => {
                                        log::info!("crash-report: auto-sent crash report")
                                    }
                                    Err(e) => {
                                        log::warn!("crash-report: auto-send failed: {e}")
                                    }
                                }
                            });
                        }
                        feedback::CrashAction::Prompt => {
                            if let Ok(mut slot) = app.state::<feedback::PendingCrash>().0.lock() {
                                *slot = Some(payload);
                                let _ = handle.emit("crash-report-pending", true);
                                log::info!("crash-report: stored pending crash + emitted prompt");
                            }
                        }
                        feedback::CrashAction::Ignore => {
                            log::info!("crash-report: consent is Off — ignoring crash");
                        }
                    }
                } else {
                    log::info!(
                        "crash-report: run marker present but no last_crash.json \
                         (force-quit/kill rather than a panic) — nothing to report"
                    );
                }
            }

            feedback::crash_reporter::write_marker(&data_dir);
            feedback::crash_reporter::install_panic_hook(data_dir);
        }
    }

    // Notification-action registry.
    {
        use std::sync::Arc;
        let registry = Arc::new(crate::notifications::NotificationActionRegistry::new());
        let backend = crate::notifications::build_default_backend(
            app.handle().clone(),
            Arc::clone(&registry),
        );
        app.manage(registry);
        app.manage(backend);
    }

    // Extension-tray manager.
    {
        use std::sync::Arc;
        let lookup: Arc<dyn extension_tray::icon::ExtensionDirLookup + Send + Sync> = Arc::new(
            extension_tray::extension_lookup::AppHandleExtensionDirLookup::new(
                app.handle().clone(),
            ),
        );
        let backend = extension_tray::backend::TauriTrayBackend::new(app.handle().clone(), lookup);
        app.manage(extension_tray::ExtensionTrayManager::new(Box::new(backend)));
    }

    // Deep link handler.
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        let scheme = deeplink::deep_link_scheme(app.handle());

        let handle = app.handle().clone();
        app.deep_link().on_open_url(move |event| {
            for url in event.urls() {
                deeplink::dispatch_url(&handle, scheme, url.as_str());
            }
        });

        match app.deep_link().get_current() {
            Ok(Some(urls)) => {
                let pending = app.state::<deeplink::PendingDeeplinks>();
                for url in urls {
                    pending.push(url.to_string());
                }
            }
            Ok(None) => {}
            Err(err) => log::warn!("[Deeplink] get_current failed: {err}"),
        }
    }

    let handle = app.app_handle();
    let window = handle
        .get_webview_window(SPOTLIGHT_LABEL)
        .ok_or("Main launcher window not found")?;

    // Dragging the launcher placement handlers.
    {
        let handle_for_drop = handle.clone();
        window_drag::register_drop_handler(SPOTLIGHT_LABEL, move || {
            launcher_placement::service::persist_dragged(&handle_for_drop);
        });

        let handle_for_move = handle.clone();
        window_drag::register_move_adjuster(SPOTLIGHT_LABEL, move |x, y| {
            launcher_placement::service::adjust_for_snap(&handle_for_move, x, y)
        });
    }

    let compact = read_launch_view(handle) == "compact";
    if compact {
        use tauri::{LogicalSize, Size};
        if let Ok(size) = window.inner_size() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let logical_width = size.width as f64 / scale;
            let _ = window.set_size(Size::Logical(LogicalSize {
                width: logical_width,
                height: 96.0,
            }));
        }
    }

    // Onboarding: open the window if the user hasn't completed it yet.
    if let Err(e) = crate::onboarding::window::open_if_needed(handle) {
        log::warn!("Onboarding window failed to open: {}", e);
    }

    let _ = crate::platform::windows::setup_spotlight_window(&window);

    // Initialize the search state when the app starts
    let state = search_engine::initialize_search_state(app.handle())?;
    let state = std::sync::Arc::new(state);
    app.manage(state.clone());

    // Local-first usage recording.
    match usage::initialize_usage_state(app.handle()) {
        Ok(usage_state) => {
            app.manage(std::sync::Arc::new(usage_state));
        }
        Err(e) => log::error!("usage state init failed: {e}"),
    }

    // Walkthrough task registry.
    app.manage(std::sync::Arc::new(
        walkthrough::registry::WalkthroughState::new(),
    ));

    // Opt-in usage share.
    if let Some(usage_state) = app.try_state::<std::sync::Arc<usage::UsageState>>() {
        use tauri_plugin_store::StoreExt;
        let handle = app.handle().clone();
        let usage_state = usage_state.inner().clone();
        let mode = handle
            .store("settings.dat")
            .ok()
            .and_then(|s| s.get("settings"))
            .map(|v| usage::parse_usage_share_mode(&v.to_string()))
            .unwrap_or(usage::UsageShareMode::Off);

        let today = usage::local_day();
        if let Ok(Some(day)) = usage::sender::earliest_unsent_day_before(&usage_state, &today) {
            match usage::sender::decide_send_action(mode) {
                usage::sender::SendAction::DoNothing => {}
                usage::sender::SendAction::SendNow => {
                    let st = usage_state.clone();
                    let handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let platform = crate::feedback::platform_string();
                        let version = handle.package_info().version.to_string();
                        if let Ok(payload) =
                            usage::sender::build_payload(&st, &day, &version, &platform)
                        {
                            let client = crate::auth::api_client::ApiClient::new();
                            if client.submit_usage_ping(&payload).await.is_ok() {
                                let _ = usage::sender::mark_day_sent(&st, &day);
                            }
                        }
                    });
                }
                usage::sender::SendAction::Prompt => {
                    let _ = handle.emit("usage:pending-share", &day);
                }
            }
        }
    }

    // At-rest encryption keystore
    {
        use tauri::Manager;
        let app_data_dir = app
            .handle()
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");
        std::fs::create_dir_all(&app_data_dir)?;
        let store: std::sync::Arc<dyn crypto::keystore::KeyStore> =
            std::sync::Arc::from(crypto::keystore::select_keystore(&app_data_dir));
        let keystore_state = crypto::keystore::KeystoreState::from_keystore(&*store)?;
        log::info!(
            "[crypto] keystore initialised — os-backed: {}",
            keystore_state.is_os_backed()
        );
        app.manage(keystore_state);
        app.manage(store);
    }

    // Initialize the SQLite data store for clipboard, snippets, shortcuts
    let data_store = storage::DataStore::initialize(app.handle())?;

    // Prune all expired cache entries on setup
    {
        let conn = data_store.conn()?;
        let _ = storage::extension_cache::prune_all_expired(&conn);
    }

    // One-shot timer registry
    let timer_registry = timers::TimerRegistry::new(data_store.clone());

    // Launcher-brokered extension state store + RPC primitive.
    let extension_state_service = std::sync::Arc::new(
        crate::extensions::extension_state::ExtensionStateService::new(data_store.clone()),
    );
    extension_state_service.set_emitter(Box::new(
        crate::extensions::extension_state::TauriStateEmitter {
            app: app.handle().clone(),
        },
    ));
    {
        use tauri::Manager;
        match app.handle().path().app_data_dir() {
            Ok(dir) => log::info!(
                "[extension_state] using SQLite database at {}",
                dir.join("asyar_data.db").display()
            ),
            Err(e) => log::warn!("[extension_state] could not resolve app_data_dir: {e}"),
        }
    }
    app.manage(std::sync::Arc::clone(&extension_state_service));

    // File index config
    let file_index_config = {
        use tauri_plugin_store::StoreExt;
        app.handle()
            .store("settings.dat")
            .ok()
            .and_then(|s| s.get("settings"))
            .and_then(|v| v.get("fileSearch").cloned())
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    };
    let file_index_state =
        std::sync::Arc::new(file_index::service::FileIndexState::new(file_index_config));
    {
        let conn = data_store.conn()?;
        let rows: Vec<(String, u64, u32, i64)> = storage::file_search_selections::load_all(&conn)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|r| {
                file_index::file_id::from_hex(&r.file_id)
                    .map(|id| (r.query_prefix, id, r.count as u32, r.last_used))
            })
            .collect();
        let pinned: Vec<u64> = storage::file_search_pinned::list(&conn)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|r| file_index::file_id::from_hex(&r.file_id))
            .collect();
        file_index_state.seed_learning(rows, pinned);
    }
    app.manage(file_index_state.clone());
    app.manage(std::sync::Arc::new(
        file_index::watcher::FileIndexWatcherHandle::new(),
    ));
    app.manage(std::sync::Arc::new(thumbnail::ThumbnailState::default()));

    app.manage(data_store);

    // Clipboard FTS
    {
        let fts = std::sync::Arc::new(
            crate::storage::clipboard_fts::ClipboardFts::new_in_memory()
                .expect("Clipboard FTS in-memory DB must initialise"),
        );
        app.manage(fts.clone());

        let store = app.state::<storage::DataStore>().inner().clone();
        let master_key: [u8; 32] = *app
            .state::<crate::crypto::keystore::KeystoreState>()
            .master_key();
        let app_handle = app.handle().clone();
        let fts_for_task = fts.clone();
        tauri::async_runtime::spawn(async move {
            let result = tokio::task::spawn_blocking(move || {
                let conn = match store.conn() {
                    Ok(c) => c,
                    Err(_) => return false,
                };
                crate::storage::clipboard_fts::rebuild_from_disk(&conn, &fts_for_task, &master_key)
                    .is_ok()
            })
            .await
            .unwrap_or(false);
            if result {
                crate::storage::clipboard_fts::mark_ready();
                let _ = app_handle.emit("clipboard:fts-ready", ());
            }
        });
    }

    // Notes FTS
    {
        let fts = std::sync::Arc::new(
            crate::storage::notes_fts::NotesFts::new_in_memory()
                .expect("Notes FTS in-memory DB must initialise"),
        );
        app.manage(fts.clone());

        let store = app.state::<storage::DataStore>().inner().clone();
        let master_key: [u8; 32] = *app
            .state::<crate::crypto::keystore::KeystoreState>()
            .master_key();
        let app_handle = app.handle().clone();
        let fts_for_task = fts.clone();
        tauri::async_runtime::spawn(async move {
            let result = tokio::task::spawn_blocking(move || {
                let conn = match store.conn() {
                    Ok(c) => c,
                    Err(_) => return false,
                };
                crate::storage::notes_fts::rebuild_from_disk(&conn, &fts_for_task, &master_key)
                    .is_ok()
            })
            .await
            .unwrap_or(false);
            if result {
                crate::storage::notes_fts::mark_ready();
                let _ = app_handle.emit("notes:fts-ready", ());
            }
        });
    }

    // Re-open every pinned note's sticky window.
    if let Err(e) = sticky_window::restore_all(app.handle()) {
        log::warn!("[sticky] restore_all failed: {e}");
    }

    // Scripts watcher
    {
        use std::sync::Arc;
        let initial_dirs: Vec<std::path::PathBuf> = {
            let data_store_state = app.state::<storage::DataStore>();
            let conn = data_store_state.conn()?;
            crate::storage::script_directories::list(&conn)?
                .into_iter()
                .map(std::path::PathBuf::from)
                .collect()
        };
        let directories_state = crate::scripts::watcher::build_directories_state(initial_dirs);
        let app_handle_for_emit = app.handle().clone();
        let scripts_watcher =
            crate::scripts::watcher::ScriptsWatcher::start(directories_state, move || {
                let _ = app_handle_for_emit.emit("scripts:changed", ());
            })?;
        app.manage(crate::commands::scripts::ScriptsWatcherState(Arc::clone(
            &scripts_watcher,
        )));
    }

    // Alias storage
    {
        let alias_state =
            aliases::AliasState::new_with_db(app.state::<storage::DataStore>().inner().clone())
                .expect("init alias state");
        if let Some(search_state) = app.try_state::<std::sync::Arc<search_engine::SearchState>>() {
            if let Ok(live_ids) = search_state.all_ids() {
                let _ = alias_state.prune_orphans(&live_ids);
            }
        }
        app.manage(alias_state);
    }

    // Startup backlog for timers
    {
        let now_at_scan = shell::now_millis();
        match timer_registry.due_now(now_at_scan) {
            Ok(due) if !due.is_empty() => {
                let count = due.len();
                log::info!("[timers] catching up {count} overdue timer(s) from previous run");
                let app_handle = app.handle().clone();
                let registry_for_backlog = timer_registry.clone();
                tauri::async_runtime::spawn(async move {
                    let plan = timers::startup::stagger_startup_fires(due, 10);
                    for (desc, delay) in plan {
                        if !delay.is_zero() {
                            tokio::time::sleep(delay).await;
                        }
                        timers::scheduler::fire_one(
                            &app_handle,
                            &registry_for_backlog,
                            desc,
                            shell::now_millis(),
                        );
                    }
                });
            }
            Ok(_) => {}
            Err(e) => log::warn!("[timers] startup scan failed: {e}"),
        }
    }

    // Live scheduler
    timers::scheduler::start(app.handle().clone(), timer_registry.clone());
    app.manage(timer_registry);

    // Window focus / blur event listener
    {
        let handle_clone = handle.clone();
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let state = handle_clone.state::<AppState>();
                if state.focus_locked.load(Ordering::Relaxed) {
                    return;
                }
                state.asyar_visible.store(false, Ordering::Relaxed);
                let _ = window_clone.hide();
            }
        });
    }

    // Resize on launchView change.
    {
        let handle_for_listen = handle.clone();
        handle.listen("asyar:launch-view-changed", move |event| {
            let compact = serde_json::from_str::<serde_json::Value>(event.payload())
                .ok()
                .and_then(|v| {
                    v.get("launchView")
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_owned())
                })
                .as_deref()
                == Some("compact");

            let handle_for_main = handle_for_listen.clone();
            let _ = handle_for_listen.run_on_main_thread(move || {
                let Some(window) = handle_for_main.get_webview_window(SPOTLIGHT_LABEL) else {
                    return;
                };

                use tauri::{LogicalSize, Size};
                let height = if compact {
                    96.0
                } else {
                    crate::launcher_placement::LAUNCHER_MAX_HEIGHT
                };
                if let Ok(size) = window.inner_size() {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let logical_width = size.width as f64 / scale;
                    let _ = window.set_size(Size::Logical(LogicalSize {
                        width: logical_width,
                        height,
                    }));
                }
            });
        });
    }

    {
        use window_vibrancy::{apply_acrylic, apply_mica};
        if apply_acrylic(&window, Some((0, 0, 0, 0))).is_err() {
            let _ = apply_mica(&window, None);
        }
    }

    // Prevent the settings window from being destroyed on close — hide it instead
    if let Some(settings_window) = handle.get_webview_window("settings") {
        let sw = settings_window.clone();
        settings_window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = sw.hide();
            }
        });
    }

    // Setup global shortcut with default configuration
    setup_global_shortcut(handle);

    // Central background scheduler
    {
        let sched = app.state::<crate::scheduler::Scheduler>();
        // Self-replacing updater must never run in dev builds — it would
        // download the last GitHub release and kill the dev session.
        #[cfg(not(debug_assertions))]
        let handle = app.handle();
        #[cfg(not(debug_assertions))]
        sched.register(crate::app_updater::scheduler::job(handle.clone()));
        sched.register(crate::shell::scheduler::job(
            app.state::<crate::shell::ShellProcessRegistry>()
                .inner()
                .clone(),
        ));
        sched.register(crate::notifications::scheduler::job(
            app.state::<std::sync::Arc<crate::notifications::NotificationActionRegistry>>()
                .inner()
                .clone(),
        ));
    }

    // System-events hub emitter
    {
        let app_handle_for_events = app.handle().clone();
        let hub: tauri::State<'_, std::sync::Arc<system_events::SystemEventsHub>> = app.state();
        let hub_arc: std::sync::Arc<system_events::SystemEventsHub> = hub.inner().clone();
        hub_arc.set_emitter(Box::new(move |extension_id, event| {
            let payload = serde_json::json!({
                "extensionId": extension_id,
                "event": event,
            });
            crate::event_bridge::bridge_emit(
                &app_handle_for_events,
                "asyar:system-event",
                &payload,
            );
            if let Some(mgr) =
                app_handle_for_events.try_state::<std::sync::Arc<ExtensionRuntimeManager>>()
            {
                let now = std::time::Instant::now();
                mgr.enqueue_worker(
                    &extension_id,
                    crate::extensions::extension_runtime::PendingMessage {
                        kind: crate::extensions::extension_runtime::MessageKind::Action,
                        payload,
                        enqueued_at: now,
                        source: crate::extensions::extension_runtime::TriggerSource::Invoke,
                    },
                    now,
                );
            }
        }));
        if let Err(e) = system_events::default_watcher().start(hub_arc) {
            log::warn!("[system_events] watcher start failed: {e}");
        }
    }

    // App-events hub emitter
    {
        let app_handle_for_app_events = app.handle().clone();
        let hub: tauri::State<'_, std::sync::Arc<app_events::AppEventsHub>> = app.state();
        let hub_arc: std::sync::Arc<app_events::AppEventsHub> = hub.inner().clone();
        hub_arc.set_emitter(Box::new(move |extension_id, event| {
            let payload = serde_json::json!({
                "extensionId": extension_id,
                "event": event,
            });
            crate::event_bridge::bridge_emit(
                &app_handle_for_app_events,
                "asyar:app-event",
                &payload,
            );
            if let Some(mgr) =
                app_handle_for_app_events.try_state::<std::sync::Arc<ExtensionRuntimeManager>>()
            {
                let now = std::time::Instant::now();
                mgr.enqueue_worker(
                    &extension_id,
                    crate::extensions::extension_runtime::PendingMessage {
                        kind: crate::extensions::extension_runtime::MessageKind::Action,
                        payload,
                        enqueued_at: now,
                        source: crate::extensions::extension_runtime::TriggerSource::Invoke,
                    },
                    now,
                );
            }
        }));
        if let Err(e) = app_events::default_watcher().start(hub_arc) {
            log::warn!("[app_events] watcher start failed: {e}");
        }
    }

    // Index-events hub emitter
    {
        let app_handle_for_index_events = app.handle().clone();
        let hub: tauri::State<'_, std::sync::Arc<index_events::IndexEventsHub>> = app.state();
        let hub_arc: std::sync::Arc<index_events::IndexEventsHub> = hub.inner().clone();
        hub_arc.set_emitter(Box::new(move |extension_id, event| {
            let payload = serde_json::json!({
                "extensionId": extension_id,
                "event": event,
            });
            crate::event_bridge::bridge_emit(
                &app_handle_for_index_events,
                "asyar:application-index",
                &payload,
            );
            if let Some(mgr) =
                app_handle_for_index_events.try_state::<std::sync::Arc<ExtensionRuntimeManager>>()
            {
                let now = std::time::Instant::now();
                mgr.enqueue_worker(
                    &extension_id,
                    crate::extensions::extension_runtime::PendingMessage {
                        kind: crate::extensions::extension_runtime::MessageKind::Action,
                        payload,
                        enqueued_at: now,
                        source: crate::extensions::extension_runtime::TriggerSource::Invoke,
                    },
                    now,
                );
            }
        }));

        let app_handle_for_watcher = app.handle().clone();
        std::thread::spawn(move || {
            match application::IndexWatcher::start(
                app_handle_for_watcher.clone(),
                hub_arc,
                Vec::new(),
            ) {
                Ok(watcher) => {
                    app_handle_for_watcher.manage(watcher);
                }
                Err(e) => {
                    log::warn!("[index_watcher] start failed: {e}");
                }
            }
        });
    }

    // File index startup
    {
        let app_handle_for_file_index = app.handle().clone();
        let file_index_state = file_index_state.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));

            let cfg = file_index_state.config();
            if !cfg.enabled {
                return;
            }
            let snapshot_path = app_handle_for_file_index
                .path()
                .app_data_dir()
                .ok()
                .map(|d| d.join(file_index::snapshot::SNAPSHOT_FILE_NAME));

            if let Some(path) = &snapshot_path {
                file_index_state.load_snapshot_or_empty(path);
            }
            if file_index_state.status().state != file_index::types::IndexStateKind::Ready {
                let roots = if cfg.include_roots.is_empty() {
                    app_handle_for_file_index
                        .path()
                        .home_dir()
                        .map(|h| vec![h])
                        .unwrap_or_default()
                } else {
                    cfg.include_roots
                        .iter()
                        .map(std::path::PathBuf::from)
                        .collect()
                };
                file_index_state.run_full_scan(
                    roots,
                    cfg.exclude_patterns.clone(),
                    file_index::walker::HARD_CAP,
                    file_index::ranking::now_seconds(),
                );
                if let Some(path) = &snapshot_path {
                    let _ = file_index_state.save_snapshot(path);
                }
            }

            let roots = if cfg.include_roots.is_empty() {
                app_handle_for_file_index
                    .path()
                    .home_dir()
                    .map(|h| vec![h])
                    .unwrap_or_default()
            } else {
                cfg.include_roots
                    .iter()
                    .map(std::path::PathBuf::from)
                    .collect()
            };
            if let Some(handle) = app_handle_for_file_index
                .try_state::<std::sync::Arc<file_index::watcher::FileIndexWatcherHandle>>()
            {
                let exclusions = file_index::watcher::build_exclusion_set(&cfg.exclude_patterns);
                let on_rescan = file_index::commands::make_on_rescan(
                    app_handle_for_file_index.clone(),
                    file_index_state.clone(),
                );
                handle.rearm(roots, exclusions, file_index_state.clone(), on_rescan);
            }

            let _ = app_handle_for_file_index
                .emit("asyar:file-index-status", file_index_state.status());
        });
    }

    // Wire fs-watcher registry emitter
    {
        let app_handle_for_fs_watch = app.handle().clone();
        let reg: tauri::State<'_, std::sync::Arc<fs_watcher::FsWatcherRegistry>> = app.state();
        let reg_arc: std::sync::Arc<fs_watcher::FsWatcherRegistry> = reg.inner().clone();
        reg_arc.set_emitter(Box::new(move |ext_id, handle_id, event| {
            let paths: Vec<String> = event
                .paths
                .into_iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            let payload = serde_json::json!({
                "extensionId": ext_id,
                "event": {
                    "handleId": handle_id,
                    "change": {
                        "type": "change",
                        "paths": paths,
                    }
                }
            });
            crate::event_bridge::bridge_emit(&app_handle_for_fs_watch, "asyar:fs-watch", &payload);
        }));
    }

    // Apply any pending update from previous session
    #[cfg(not(debug_assertions))]
    {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            crate::app_updater::service::apply_on_start(&handle).await;
        });
    }

    // Drive context-lifecycle idle-unmount / mount-timeout sweeps
    if let Some(mgr) = app.try_state::<std::sync::Arc<ExtensionRuntimeManager>>() {
        extension_runtime_ticker::spawn_ticker(
            app.app_handle().clone(),
            mgr.inner().clone(),
            RuntimeConfig::default().view.tick_interval,
        );
    }

    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::MacosLauncher;
        use tauri_plugin_autostart::ManagerExt;

        let _ = app.handle().plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ));

        let autostart_manager = app.autolaunch();
        log::info!(
            "current autostart status: {}",
            autostart_manager.is_enabled().unwrap_or(false)
        );
    }

    // Browser bridge
    {
        use crate::browser::bridge::{
            cache::TabSnapshotCache, connections::CompanionRegistry, pairing::PairingRegistry,
            rate_limit::ConnectionRateLimiter, server::start_server,
            token_store::KeyringTokenStore, BridgeState,
        };
        use std::sync::Arc;
        use tauri::Emitter;

        let token_store = Arc::new(KeyringTokenStore::new());
        let token_store_clone = token_store.clone();
        std::thread::spawn(move || {
            token_store_clone.load_paired_from_backend();
        });

        let bridge_state = BridgeState {
            tokens: token_store,
            pairing: Arc::new(PairingRegistry::new()),
            connections: Arc::new(CompanionRegistry::new()),
            cache: Arc::new(TabSnapshotCache::new()),
            events: Arc::new(crate::browser::events::BrowserEventsHub::new()),
            last_active: Arc::new(std::sync::RwLock::new(None)),
            rate_limiter: Arc::new(ConnectionRateLimiter::default()),
            app_handle: app.handle().clone(),
        };

        let bridge_for_server = bridge_state.clone();
        let app_handle_for_emit = app.handle().clone();
        let app_handle_for_manage = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            match start_server(bridge_for_server).await {
                Ok(handle) => {
                    let port = handle.port();
                    log::info!("browser bridge listening on 127.0.0.1:{}", port);
                    let _ = app_handle_for_emit
                        .emit("browser:bridge-ready", serde_json::json!({ "port": port }));
                    app_handle_for_manage.manage(handle);
                }
                Err(e) => {
                    log::error!("failed to start browser bridge: {}", e);
                }
            }
        });

        app.manage(Arc::clone(&bridge_state.events));
        {
            let app_handle_for_events = app.handle().clone();
            let hub_arc: Arc<crate::browser::events::BrowserEventsHub> =
                Arc::clone(&bridge_state.events);
            hub_arc.set_emitter(Box::new(move |extension_id, event| {
                let payload = serde_json::json!({
                    "extensionId": extension_id,
                    "event": event,
                });
                crate::event_bridge::bridge_emit(
                    &app_handle_for_events,
                    "asyar:browser-event",
                    &payload,
                );
                if let Some(mgr) = app_handle_for_events.try_state::<Arc<ExtensionRuntimeManager>>()
                {
                    let now = std::time::Instant::now();
                    mgr.enqueue_worker(
                        &extension_id,
                        crate::extensions::extension_runtime::PendingMessage {
                            kind: crate::extensions::extension_runtime::MessageKind::Action,
                            payload,
                            enqueued_at: now,
                            source: crate::extensions::extension_runtime::TriggerSource::Invoke,
                        },
                        now,
                    );
                }
            }));
        }

        app.manage(bridge_state);
    }

    launcher_coordinator
        .mark_ready()
        .map_err(|error| format!("failed to mark launcher coordinator ready: {error}"))?;

    Ok(())
}

fn setup_global_shortcut(app_handle: &tauri::AppHandle) {
    let shortcut_config = commands::ShortcutConfig::default();
    let shortcut_manager = app_handle.global_shortcut();

    let mod_key = match shortcut_config.modifier.as_str() {
        "Super" => Some(Modifiers::SUPER),
        "Shift" => Some(Modifiers::SHIFT),
        "Control" => Some(Modifiers::CONTROL),
        "Alt" => Some(Modifiers::ALT),
        "" | "None" | "none" => None,
        _ => Some(Modifiers::ALT),
    };

    let code = match commands::get_code_from_string(&shortcut_config.key) {
        Ok(code) => code,
        Err(_) => Code::Space,
    };

    let shortcut = Shortcut::new(mod_key, code);

    if let Err(e) = shortcut_manager.register(shortcut) {
        log::error!("Failed to register shortcut: {}", e);
    }
}

#[cfg(test)]
mod launch_view_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn returns_compact_at_canonical_path() {
        let v = json!({ "appearance": { "launchView": "compact" } });
        assert_eq!(parse_launch_view(Some(&v)), "compact");
    }

    #[test]
    fn returns_default_when_value_is_default() {
        let v = json!({ "appearance": { "launchView": "default" } });
        assert_eq!(parse_launch_view(Some(&v)), "default");
    }

    #[test]
    fn returns_default_when_settings_root_is_none() {
        assert_eq!(parse_launch_view(None), "default");
    }

    #[test]
    fn returns_default_when_appearance_key_missing() {
        let v = json!({ "general": { "startAtLogin": false } });
        assert_eq!(parse_launch_view(Some(&v)), "default");
    }

    #[test]
    fn returns_default_when_launch_view_key_missing() {
        let v = json!({ "appearance": { "theme": "dark", "windowWidth": 800 } });
        assert_eq!(parse_launch_view(Some(&v)), "default");
    }

    #[test]
    fn returns_default_when_launch_view_is_not_string() {
        let v = json!({ "appearance": { "launchView": 42 } });
        assert_eq!(parse_launch_view(Some(&v)), "default");
    }

    #[test]
    fn returns_default_for_unrecognised_string_value() {
        let v = json!({ "appearance": { "launchView": "ultrawide" } });
        assert_eq!(parse_launch_view(Some(&v)), "default");
    }

    #[test]
    fn extracts_from_full_default_settings_shape() {
        let v = json!({
            "general": { "startAtLogin": false, "showDockIcon": true },
            "search": { "searchApplications": true },
            "shortcut": { "modifier": "Alt", "key": "Space" },
            "appearance": {
                "theme": "system",
                "launchView": "compact",
                "windowWidth": 800,
                "windowHeight": 600,
            },
            "extensions": { "enabled": {}, "autoUpdate": true },
            "updates": { "channel": "stable", "autoCheck": true },
        });
        assert_eq!(parse_launch_view(Some(&v)), "compact");
    }
}

#[cfg(test)]
mod appearance_theme_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn returns_light_when_theme_is_light() {
        let v = json!({ "appearance": { "theme": "light" } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::Light);
    }

    #[test]
    fn returns_dark_when_theme_is_dark() {
        let v = json!({ "appearance": { "theme": "dark" } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::Dark);
    }

    #[test]
    fn returns_system_when_theme_is_system() {
        let v = json!({ "appearance": { "theme": "system" } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::System);
    }

    #[test]
    fn returns_system_when_theme_key_missing() {
        let v = json!({ "appearance": { "launchView": "default" } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::System);
    }

    #[test]
    fn returns_system_when_appearance_key_missing() {
        let v = json!({ "general": { "startAtLogin": false } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::System);
    }

    #[test]
    fn returns_system_for_unknown_theme_value() {
        let v = json!({ "appearance": { "theme": "hot-pink" } });
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::System);
    }

    #[test]
    fn returns_system_when_json_is_empty_object() {
        let v = json!({});
        assert_eq!(parse_appearance_theme(Some(&v)), ThemePreference::System);
    }
}

#[cfg(test)]
mod tray_icon_preference_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn returns_true_by_default_when_settings_root_is_none() {
        assert!(parse_show_tray_icon(None));
    }

    #[test]
    fn returns_true_by_default_when_general_key_missing() {
        let v = json!({ "appearance": { "theme": "dark" } });
        assert!(parse_show_tray_icon(Some(&v)));
    }

    #[test]
    fn returns_true_by_default_when_show_tray_icon_key_missing() {
        let v = json!({ "general": { "startAtLogin": true } });
        assert!(parse_show_tray_icon(Some(&v)));
    }

    #[test]
    fn returns_false_when_explicitly_set_to_false() {
        let v = json!({ "general": { "showTrayIcon": false } });
        assert!(!parse_show_tray_icon(Some(&v)));
    }

    #[test]
    fn returns_true_when_explicitly_set_to_true() {
        let v = json!({ "general": { "showTrayIcon": true } });
        assert!(parse_show_tray_icon(Some(&v)));
    }
}

#[cfg(test)]
mod dock_icon_preference_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn returns_false_by_default_when_settings_root_is_none() {
        assert!(!parse_show_dock_icon(None));
    }

    #[test]
    fn returns_false_by_default_when_general_key_missing() {
        let v = json!({ "appearance": { "theme": "dark" } });
        assert!(!parse_show_dock_icon(Some(&v)));
    }

    #[test]
    fn returns_false_by_default_when_show_dock_icon_key_missing() {
        let v = json!({ "general": { "startAtLogin": true } });
        assert!(!parse_show_dock_icon(Some(&v)));
    }

    #[test]
    fn returns_true_when_explicitly_set_to_true() {
        let v = json!({ "general": { "showDockIcon": true } });
        assert!(parse_show_dock_icon(Some(&v)));
    }

    #[test]
    fn returns_false_when_explicitly_set_to_false() {
        let v = json!({ "general": { "showDockIcon": false } });
        assert!(!parse_show_dock_icon(Some(&v)));
    }
}

#[cfg(test)]
mod theme_preference_str_tests {
    use super::*;

    #[test]
    fn maps_light_string_to_light() {
        assert_eq!(parse_theme_preference_str("light"), ThemePreference::Light);
    }

    #[test]
    fn maps_dark_string_to_dark() {
        assert_eq!(parse_theme_preference_str("dark"), ThemePreference::Dark);
    }

    #[test]
    fn maps_system_string_to_system() {
        assert_eq!(
            parse_theme_preference_str("system"),
            ThemePreference::System
        );
    }

    #[test]
    fn unknown_string_falls_back_to_system() {
        assert_eq!(
            parse_theme_preference_str("hot-pink"),
            ThemePreference::System
        );
    }
}

#[cfg(test)]
mod panic_hook_tests {
    #[test]
    fn diagnostic_panic_payload_shape() {
        let info_str = "panic at src/foo.rs:1:1: oh no";
        let location = ("src/foo.rs", 1u32);
        let payload = serde_json::json!({
            "source": "rust",
            "kind": "panic",
            "severity": "fatal",
            "retryable": false,
            "context": { "location": format!("{}:{}", location.0, location.1) },
            "developerDetail": info_str,
        });
        assert_eq!(payload["kind"], "panic");
        assert_eq!(payload["severity"], "fatal");
        assert_eq!(payload["context"]["location"], "src/foo.rs:1");
    }
}

#[cfg(test)]
mod link_audit_tests {
    #[test]
    fn liblzma_sys_static_feature_is_enabled_in_manifest() {
        let manifest = include_str!("../Cargo.toml");
        let declares_static = manifest.lines().any(|raw| {
            let line = raw.trim();
            line.starts_with("liblzma-sys")
                && line.contains("features")
                && line.contains("\"static\"")
        });
        assert!(
            declares_static,
            "asyar-launcher/src-tauri/Cargo.toml must declare liblzma-sys with static feature"
        );
    }
}
