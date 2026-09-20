//! Application-uninstall service module for Windows.
//!
//! Windows — the scanner indexes `.lnk` shortcuts. Uninstall resolves
//! the shortcut's display name against `…\CurrentVersion\Uninstall\*`
//! registry keys and launches the discovered `UninstallString` via
//! `cmd /C`. The vendor's own uninstaller UI then takes over.

use crate::error::AppError;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// A single filesystem entry associated with an installed application.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppDataPath {
    pub path: String,
    pub size_bytes: u64,
    pub category: String,
}

/// The complete scan result shown in the confirm sheet before uninstall.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UninstallScanResult {
    pub app_path: String,
    pub app_size_bytes: u64,
    pub data_paths: Vec<AppDataPath>,
    pub total_bytes: u64,
}

pub fn uninstall_application(path: &str, _data_paths: &[String]) -> Result<(), AppError> {
    uninstall_windows(path)
}

pub fn scan_app_data(_bundle_id: Option<&str>, _app_name: &str) -> Vec<AppDataPath> {
    Vec::new()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WindowsUninstallEntry {
    pub display_name: String,
    pub uninstall_string: String,
    pub system_component: bool,
    pub publisher: Option<String>,
}

pub(crate) const ASYAR_WINDOWS_DISPLAY_NAME: &str = "flowkey";

pub(crate) fn validate_windows_shortcut_path(path: &str) -> Result<PathBuf, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::Validation("path must be non-empty".to_string()));
    }

    let raw = Path::new(path);

    if !raw.is_absolute() {
        return Err(AppError::Validation(format!(
            "path must be absolute: {}",
            path
        )));
    }

    if raw.extension().and_then(|e| e.to_str()) != Some("lnk") {
        return Err(AppError::Validation(format!(
            "path must point to a .lnk shortcut: {}",
            path
        )));
    }

    if !raw.exists() {
        return Err(AppError::NotFound(format!(
            "shortcut does not exist: {}",
            path
        )));
    }

    Ok(raw.to_path_buf())
}

pub(crate) fn derive_display_name_from_shortcut(lnk: &Path) -> Result<String, AppError> {
    let name = lnk
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim();
    if name.is_empty() {
        return Err(AppError::Validation(
            "cannot derive display name from .lnk path".to_string(),
        ));
    }
    Ok(name.to_string())
}

pub(crate) fn match_windows_entry<'a>(
    entries: &'a [WindowsUninstallEntry],
    target: &str,
) -> Option<&'a WindowsUninstallEntry> {
    if let Some(exact) = entries
        .iter()
        .find(|e| e.display_name.eq_ignore_ascii_case(target))
    {
        return Some(exact);
    }

    let target_lower = target.to_ascii_lowercase();
    let prefix_matches: Vec<&WindowsUninstallEntry> = entries
        .iter()
        .filter(|e| {
            e.display_name
                .to_ascii_lowercase()
                .starts_with(&target_lower)
        })
        .collect();
    if prefix_matches.len() == 1 {
        return Some(prefix_matches[0]);
    }
    None
}

pub(crate) fn ensure_windows_entry_allowed(
    entry: &WindowsUninstallEntry,
    own_display_name: &str,
) -> Result<(), AppError> {
    if entry.system_component {
        return Err(AppError::Permission(format!(
            "cannot uninstall system component: {}",
            entry.display_name
        )));
    }
    if entry.display_name.eq_ignore_ascii_case(own_display_name) {
        return Err(AppError::Permission(
            "refusing to uninstall Asyar itself".to_string(),
        ));
    }
    if entry.uninstall_string.trim().is_empty() {
        return Err(AppError::Validation(format!(
            "uninstall entry for '{}' has empty UninstallString",
            entry.display_name
        )));
    }
    Ok(())
}

fn uninstall_windows(path: &str) -> Result<(), AppError> {
    if path.starts_with("shell:AppsFolder\\") {
        return Err(AppError::Platform(
            "Uninstalling Microsoft Store apps is not supported".to_string(),
        ));
    }
    let lnk = validate_windows_shortcut_path(path)?;
    let display_name = derive_display_name_from_shortcut(&lnk)?;
    let entries = scan_uninstall_registry()?;
    let matched = match_windows_entry(&entries, &display_name).ok_or_else(|| {
        AppError::NotFound(format!(
            "no uninstall registry entry matches '{}'",
            display_name
        ))
    })?;
    ensure_windows_entry_allowed(matched, ASYAR_WINDOWS_DISPLAY_NAME)?;
    spawn_windows_uninstaller(&matched.uninstall_string)
}

fn scan_uninstall_registry() -> Result<Vec<WindowsUninstallEntry>, AppError> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut out = Vec::new();
    collect_entries_from(
        &RegKey::predef(HKEY_LOCAL_MACHINE),
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        &mut out,
    );
    collect_entries_from(
        &RegKey::predef(HKEY_LOCAL_MACHINE),
        r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        &mut out,
    );
    collect_entries_from(
        &RegKey::predef(HKEY_CURRENT_USER),
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        &mut out,
    );
    Ok(out)
}

fn collect_entries_from(
    root: &winreg::RegKey,
    subpath: &str,
    out: &mut Vec<WindowsUninstallEntry>,
) {
    let uninstall_key = match root.open_subkey(subpath) {
        Ok(k) => k,
        Err(_) => return,
    };
    for name in uninstall_key.enum_keys().flatten() {
        let entry_key = match uninstall_key.open_subkey(&name) {
            Ok(k) => k,
            Err(_) => continue,
        };
        let display_name: String = match entry_key.get_value("DisplayName") {
            Ok(v) => v,
            Err(_) => continue,
        };
        let uninstall_string: String = match entry_key.get_value("UninstallString") {
            Ok(v) => v,
            Err(_) => continue,
        };
        let system_component: u32 = entry_key.get_value("SystemComponent").unwrap_or(0);
        let publisher: Option<String> = entry_key.get_value("Publisher").ok();
        out.push(WindowsUninstallEntry {
            display_name,
            uninstall_string,
            system_component: system_component != 0,
            publisher,
        });
    }
}

fn spawn_windows_uninstaller(uninstall_string: &str) -> Result<(), AppError> {
    use std::process::Command;
    Command::new("cmd")
        .args(["/C", uninstall_string])
        .spawn()
        .map_err(|e| {
            AppError::Other(format!(
                "failed to launch uninstaller '{}': {}",
                uninstall_string, e
            ))
        })?;
    Ok(())
}

/// Best-effort on-disk size of `path`'s subtree. Symlinks are skipped so a
/// link loop cannot recurse without bound.
pub fn dir_size_bytes(path: &Path) -> u64 {
    fn walk(path: &Path, total: &mut u64) {
        let entries = match std::fs::read_dir(path) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.file_type() else {
                continue;
            };
            if meta.is_symlink() {
                continue;
            }
            if meta.is_file() {
                if let Ok(md) = entry.metadata() {
                    *total = total.saturating_add(md.len());
                }
            } else if meta.is_dir() {
                walk(&entry.path(), total);
            }
        }
    }
    let mut total = 0u64;
    walk(path, &mut total);
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    mod windows_logic {
        use super::*;

        fn entry(name: &str, uninstall_string: &str) -> WindowsUninstallEntry {
            WindowsUninstallEntry {
                display_name: name.to_string(),
                uninstall_string: uninstall_string.to_string(),
                system_component: false,
                publisher: None,
            }
        }

        #[test]
        fn match_entry_finds_exact_name() {
            let entries = vec![entry("Firefox", "C:\\uninst.exe")];
            let found = match_windows_entry(&entries, "Firefox").unwrap();
            assert_eq!(found.display_name, "Firefox");
        }

        #[test]
        fn match_entry_is_case_insensitive() {
            let entries = vec![entry("Firefox", "C:\\uninst.exe")];
            assert!(match_windows_entry(&entries, "firefox").is_some());
            assert!(match_windows_entry(&entries, "FIREFOX").is_some());
            assert!(match_windows_entry(&entries, "FiReFoX").is_some());
        }

        #[test]
        fn match_entry_returns_none_for_no_match() {
            let entries = vec![entry("Firefox", "C:\\uninst.exe")];
            assert!(match_windows_entry(&entries, "Chrome").is_none());
        }

        #[test]
        fn match_entry_returns_none_for_empty_list() {
            let entries: Vec<WindowsUninstallEntry> = vec![];
            assert!(match_windows_entry(&entries, "Firefox").is_none());
        }

        #[test]
        fn match_entry_starts_with_fallback_hits_versioned_display_name() {
            let entries = vec![entry("Mozilla Firefox (x64 en-US)", "uninstall.exe")];
            let found = match_windows_entry(&entries, "Mozilla Firefox").unwrap();
            assert_eq!(found.uninstall_string, "uninstall.exe");
        }

        #[test]
        fn match_entry_starts_with_fallback_is_case_insensitive() {
            let entries = vec![entry("Mozilla Firefox (x64 en-US)", "uninstall.exe")];
            let found = match_windows_entry(&entries, "mozilla firefox").unwrap();
            assert_eq!(found.uninstall_string, "uninstall.exe");
        }

        #[test]
        fn match_entry_refuses_ambiguous_prefix() {
            let entries = vec![
                entry("Firefox Nightly", "uninst1.exe"),
                entry("Firefox Developer Edition", "uninst2.exe"),
            ];
            assert!(match_windows_entry(&entries, "Firefox").is_none());
        }

        #[test]
        fn validate_shortcut_rejects_non_lnk() {
            let err = validate_windows_shortcut_path("C:\\Apps\\test.exe").unwrap_err();
            assert!(matches!(err, AppError::Validation(_)));
        }

        #[test]
        fn ensure_allowed_rejects_system_component() {
            let mut e = entry("Windows Subsystem for Linux", "uninst.exe");
            e.system_component = true;
            let err = ensure_windows_entry_allowed(&e, "flowkey").unwrap_err();
            assert!(matches!(err, AppError::Permission(_)));
        }

        #[test]
        fn ensure_allowed_rejects_flowkey_itself() {
            let e = entry("Flowkey", "C:\\uninst.exe");
            let err = ensure_windows_entry_allowed(&e, "flowkey").unwrap_err();
            assert!(matches!(err, AppError::Permission(_)));
        }

        #[test]
        fn ensure_allowed_rejects_empty_uninstall_string() {
            let e = entry("SomeApp", "   ");
            let err = ensure_windows_entry_allowed(&e, "flowkey").unwrap_err();
            assert!(matches!(err, AppError::Validation(_)));
        }

        #[test]
        fn derive_display_name_extracts_stem() {
            let path =
                Path::new("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Slack.lnk");
            let name = derive_display_name_from_shortcut(path).unwrap();
            assert_eq!(name, "Slack");
        }
    }
}
