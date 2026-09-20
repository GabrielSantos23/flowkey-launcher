//! Application discovery and launch commands.
//!
//! Thin Tauri command wrappers delegating to `crate::application::service`.

use crate::application::service::{self, FrontmostApplication, SyncResult};
use crate::application::{uninstall, IndexWatcher};
use crate::error::AppError;
use crate::permissions::ExtensionPermissionRegistry;
use crate::search_engine::models::Application;
use crate::search_engine::SearchState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;

/// Scans installed applications, diffs against the current search index,
/// and updates the index.
#[tauri::command]
pub async fn sync_application_index(
    app: AppHandle,
    search_state: tauri::State<'_, std::sync::Arc<SearchState>>,
    extra_paths: Option<Vec<String>>,
) -> Result<SyncResult, AppError> {
    let paths = extra_paths
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect();

    service::sync_application_index(&app, &search_state, paths)
}

/// Returns all installed applications found in system scan paths.
#[tauri::command]
pub async fn list_applications(
    app: AppHandle,
    extra_paths: Option<Vec<String>>,
) -> Result<Vec<Application>, AppError> {
    let paths = extra_paths
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect();

    service::list_applications(&app, paths)
}

/// Retrieves metadata about the currently focused application.
#[tauri::command]
pub async fn get_frontmost_application() -> Result<Option<FrontmostApplication>, AppError> {
    service::get_frontmost_application()
}

#[tauri::command]
pub fn get_default_app_scan_paths() -> Vec<String> {
    service::get_default_app_scan_paths()
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Normalizes a user-supplied scan path: trims whitespace and strips a
/// trailing separator. Canonicalization of the duplicate-against-defaults
/// check lives in Rust, so the UI stays display-only.
#[tauri::command]
pub fn normalize_scan_path(path: String) -> String {
    service::normalize_scan_path(&path)
}

/// Pushes the user-configured `additionalScanPaths` down to the Rust
/// index watcher. Called by `applicationService` whenever the TS settings
/// service reports a change to `search.additionalScanPaths`.
///
/// The watcher re-arms itself idempotently — unchanged paths stay watched,
/// removed paths are unwatched, new paths are watched. A missing watcher
/// (e.g. when setup hasn't finished yet) is a silent no-op so the settings
/// service doesn't need to know about lifecycle ordering.
#[tauri::command]
pub fn set_application_scan_paths(
    watcher: tauri::State<'_, Arc<IndexWatcher>>,
    paths: Vec<String>,
) -> Result<(), AppError> {
    let normalized: Vec<PathBuf> = paths
        .into_iter()
        .map(|p| PathBuf::from(service::normalize_scan_path(&p)))
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    watcher.set_extra_paths(normalized)
}

/// Opens an application at the given file system path.
#[tauri::command]
pub fn open_application_path(app_handle: AppHandle, path: String) -> Result<(), AppError> {
    service::open_application_path(&app_handle, path)
}

/// Uninstalls the selected application, optionally trashing associated
/// user-data paths (macOS).
///
/// macOS: moves the `.app` bundle to Trash, then trashes each path in
/// `data_paths` that survives the per-path safety validator
/// (`~/Library/*` scope, absolute, not a symlink). Windows: launches the
/// vendor uninstaller (`data_paths` is ignored — the uninstaller handles
/// user-data cleanup). Linux: unsupported.
///
/// Core-only (Tier 1 action panel). Rejects any Tier 2 caller — uninstalling
/// arbitrary apps is a capability beyond the read-only `application:*`
/// surface we expose to extensions. Delegates all safety gating and the
/// actual work to [`crate::application::uninstall::uninstall_application`].
#[tauri::command]
pub fn uninstall_application(
    permissions: tauri::State<'_, ExtensionPermissionRegistry>,
    extension_id: Option<String>,
    path: String,
    data_paths: Option<Vec<String>>,
) -> Result<(), AppError> {
    uninstall_application_inner(
        &permissions,
        extension_id,
        path,
        data_paths.unwrap_or_default(),
    )
}

pub(crate) fn uninstall_application_inner(
    _permissions: &ExtensionPermissionRegistry,
    extension_id: Option<String>,
    path: String,
    data_paths: Vec<String>,
) -> Result<(), AppError> {
    if extension_id.is_some() {
        return Err(AppError::Permission(
            "uninstall_application is only available to core callers".to_string(),
        ));
    }
    uninstall::uninstall_application(&path, &data_paths)
}

/// Stub for non-macOS targets. Returns an empty scan so the frontend can
/// treat the call uniformly — Windows and Linux simply don't show a
/// data-path breakdown in their confirm flow.
#[tauri::command]
pub fn scan_uninstall_targets(
    _permissions: tauri::State<'_, ExtensionPermissionRegistry>,
    _extension_id: Option<String>,
    _path: String,
) -> Result<crate::application::uninstall::UninstallScanResult, AppError> {
    Err(AppError::Platform(
        "scan_uninstall_targets is only supported on macOS".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_any_extension_caller() {
        let perms = ExtensionPermissionRegistry::new();
        let err = uninstall_application_inner(
            &perms,
            Some("any-extension-id".to_string()),
            "/Applications/Whatever.app".to_string(),
            vec![],
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Permission(_)), "got: {err:?}");
    }

    #[test]
    fn core_caller_reaches_validator() {
        // extension_id = None should bypass the core-only gate and fall through
        // to the platform-specific validator. We assert the error is NOT the
        // "only available to core callers" permission error — that's the
        // point. A non-existent path is NotFound on Windows.
        let perms = ExtensionPermissionRegistry::new();
        let probe = r"C:\__asyar_nonexistent_uninstall_cmd_test__.lnk".to_string();

        let err = uninstall_application_inner(&perms, None, probe, vec![]).unwrap_err();

        assert!(matches!(err, AppError::NotFound(_)), "got: {err:?}");
    }
}
