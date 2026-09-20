use crate::error::AppError;
use crate::search_engine::models::{build_app_id, Application, SearchableItem};
use crate::search_engine::SearchState;
use log::info;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FrontmostApplication {
    pub name: String,
    pub bundle_id: Option<String>,
    pub path: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Serialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub added: u32,
    pub removed: u32,
    pub total: u32,
}

/// Launches an application using the platform-native mechanism for its path.
pub fn open_application_path<R: tauri::Runtime>(
    app_handle: &AppHandle<R>,
    path: String,
) -> Result<(), AppError> {
    if path.starts_with("shell:AppsFolder\\") {
        use std::process::Command;
        Command::new("explorer.exe")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Platform(format!("Failed to launch AppX app: {}", e)))?;
        return Ok(());
    }

    use tauri_plugin_opener::OpenerExt;
    app_handle
        .opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| AppError::Platform(format!("Failed to open path '{}': {}", path, e)))
}

/// Retrieves metadata about the currently focused application.
pub fn get_frontmost_application() -> Result<Option<FrontmostApplication>, AppError> {
    if let Some((name, path, title)) =
        crate::platform::windows::get_frontmost_application_metadata()
    {
        return Ok(Some(FrontmostApplication {
            name,
            bundle_id: None,
            path: Some(path),
            window_title: Some(title),
        }));
    }

    Ok(None)
}

/// Scans for applications in default and extra paths, diffs against the search index,
/// and updates the search state.
pub fn sync_application_index<R: tauri::Runtime>(
    app: &AppHandle<R>,
    search_state: &SearchState,
    extra_paths: Vec<PathBuf>,
) -> Result<SyncResult, AppError> {
    // 1. Scan applications
    let mut scanner = AppScanner::new();
    scanner.scan_all(extra_paths)?;

    let icon_cache_dir = get_icon_cache_dir(app);

    // 2. Build current app set
    let mut current_apps: HashMap<String, Application> = HashMap::new();
    for path_str in &scanner.paths {
        let path = Path::new(path_str);
        let full_app_id = build_app_id(&bundle_file_name(path), path_str);

        current_apps.insert(
            full_app_id.clone(),
            Application {
                id: full_app_id,
                name: display_name(path),
                path: path_str.clone(),
                usage_count: 0,
                icon: extract_app_icon(path_str, &icon_cache_dir),
                last_used_at: None,
                bundle_id: extract_bundle_id(Path::new(path_str)),
            },
        );
    }

    for uwp in &scanner.uwp_apps {
        let full_app_id = build_app_id(uwp_stable_name(&uwp.aumid), &uwp.aumid);
        let path = format!("shell:AppsFolder\\{}", uwp.aumid);

        current_apps.insert(
            full_app_id.clone(),
            Application {
                id: full_app_id,
                name: uwp.name.clone(),
                path: path.clone(),
                usage_count: 0,
                icon: extract_uwp_app_icon(&uwp.aumid, &uwp.install_location, &icon_cache_dir),
                last_used_at: None,
                bundle_id: Some(uwp.aumid.clone()),
            },
        );
    }

    // 2.5 Migrate legacy UWP app IDs if any were indexed under localized display names
    let alias_state = app.try_state::<crate::aliases::AliasState>();
    let _ = migrate_uwp_app_ids(search_state, alias_state.as_deref());

    // 3. Get currently indexed app_ IDs
    let indexed_ids: Vec<String> = {
        let items = search_state
            .items
            .read()
            .map_err(|e| AppError::Other(e.to_string()))?;
        items
            .iter()
            .filter_map(|item| {
                let id = item.id();
                if id.starts_with("app_") {
                    Some(id.to_string())
                } else {
                    None
                }
            })
            .collect()
    };
    let indexed_set: HashSet<&str> = indexed_ids.iter().map(|s| s.as_str()).collect();
    let current_set: HashSet<&str> = current_apps.keys().map(|s| s.as_str()).collect();

    // 4. Diff
    let to_add: Vec<String> = current_set
        .difference(&indexed_set)
        .map(|s| s.to_string())
        .collect();
    let to_remove: Vec<String> = indexed_set
        .difference(&current_set)
        .map(|s| s.to_string())
        .collect();

    let added = to_add.len() as u32;
    let removed = to_remove.len() as u32;

    // 5. Update SearchState
    let renamed = {
        let mut items = search_state
            .items
            .write()
            .map_err(|e| AppError::Other(e.to_string()))?;

        if !to_remove.is_empty() {
            let remove_set: HashSet<String> = to_remove.into_iter().collect();
            items.retain(|item| !remove_set.contains(item.id()));
        }

        let renamed = refresh_display_names(&mut items, &current_apps);

        for id in to_add {
            if let Some(app) = current_apps.remove(&id) {
                items.push(SearchableItem::Application(app));
            }
        }

        renamed
    };

    // 6. Persist
    search_state
        .save_items_to_db()
        .map_err(|e| AppError::Other(format!("Failed to save index: {}", e)))?;

    let total = {
        let items = search_state
            .items
            .read()
            .map_err(|e| AppError::Other(e.to_string()))?;
        items.iter().filter(|i| i.id().starts_with("app_")).count() as u32
    };

    info!(
        "App sync complete: {} added, {} removed, {} renamed, {} total apps",
        added, removed, renamed, total
    );
    Ok(SyncResult {
        added,
        removed,
        total,
    })
}

fn refresh_display_names(
    items: &mut [SearchableItem],
    scanned: &HashMap<String, Application>,
) -> u32 {
    let mut renamed = 0;
    for item in items.iter_mut() {
        let SearchableItem::Application(indexed) = item else {
            continue;
        };
        let Some(fresh) = scanned.get(&indexed.id) else {
            continue;
        };
        if indexed.name != fresh.name {
            indexed.name.clone_from(&fresh.name);
            renamed += 1;
        }
    }
    renamed
}

pub fn list_applications<R: tauri::Runtime>(
    app: &AppHandle<R>,
    extra_paths: Vec<PathBuf>,
) -> Result<Vec<Application>, AppError> {
    let mut scanner = AppScanner::new();
    scanner.scan_all(extra_paths)?;

    let icon_cache_dir = get_icon_cache_dir(app);
    let mut applications = Vec::new();

    for path_str in &scanner.paths {
        let path = Path::new(path_str);
        let full_app_id = build_app_id(&bundle_file_name(path), path_str);

        applications.push(Application {
            id: full_app_id,
            name: display_name(path),
            path: path_str.clone(),
            usage_count: 0,
            icon: extract_app_icon(path_str, &icon_cache_dir),
            last_used_at: None,
            bundle_id: extract_bundle_id(Path::new(path_str)),
        });
    }

    for uwp in &scanner.uwp_apps {
        let full_app_id = build_app_id(uwp_stable_name(&uwp.aumid), &uwp.aumid);
        let path = format!("shell:AppsFolder\\{}", uwp.aumid);

        applications.push(Application {
            id: full_app_id,
            name: uwp.name.clone(),
            path: path.clone(),
            usage_count: 0,
            icon: extract_uwp_app_icon(&uwp.aumid, &uwp.install_location, &icon_cache_dir),
            last_used_at: None,
            bundle_id: Some(uwp.aumid.clone()),
        });
    }

    Ok(applications)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct UwpApp {
    pub name: String,
    pub aumid: String,
    pub install_location: String,
}

struct AppScanner {
    paths: Vec<String>,
    seen: HashSet<String>,
    uwp_apps: Vec<UwpApp>,
}

impl AppScanner {
    fn new() -> Self {
        Self {
            paths: Vec::new(),
            seen: HashSet::new(),
            uwp_apps: Vec::new(),
        }
    }

    fn record(&mut self, path: &Path) {
        if let Some(path_str) = path.to_str() {
            if self.seen.insert(path_str.to_string()) {
                self.paths.push(path_str.to_string());
            }
        }
    }

    fn scan_directory(&mut self, dir_path: &Path) -> Result<(), AppError> {
        if is_app_bundle(dir_path) && dir_path.exists() {
            self.record(dir_path);
            return Ok(());
        }
        if !dir_path.is_dir() {
            return Ok(());
        }
        for entry in fs::read_dir(dir_path)?.filter_map(Result::ok) {
            let path = entry.path();
            if is_app_bundle(&path) {
                self.record(&path);
            } else if path.is_dir() {
                let _ = self.scan_directory(&path);
            }
        }
        Ok(())
    }

    fn scan_all(&mut self, extra_paths: Vec<PathBuf>) -> Result<(), AppError> {
        let mut directories = get_default_app_scan_paths();
        directories.extend(extra_paths);

        for dir in directories {
            if let Err(e) = self.scan_directory(&dir) {
                info!("Error scanning {:?}: {}", dir, e);
            }
        }

        if let Err(e) = self.scan_uwp_apps() {
            info!("Error scanning UWP apps: {}", e);
        }

        Ok(())
    }

    fn scan_uwp_apps(&mut self) -> Result<(), AppError> {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                uwp_scan_powershell_script(),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let output = match output {
            Ok(out) => out,
            Err(e) => {
                info!("Failed to run PowerShell for UWP apps: {}", e);
                return Ok(());
            }
        };

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            info!("PowerShell UWP scan failed: {}", err_msg);
            return Ok(());
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let trimmed = json_str.trim();
        if trimmed.is_empty() {
            return Ok(());
        }

        let raw_apps: Vec<UwpApp> = if trimmed.starts_with('[') {
            serde_json::from_str(trimmed).unwrap_or_default()
        } else {
            serde_json::from_str::<UwpApp>(trimmed)
                .map(|app| vec![app])
                .unwrap_or_default()
        };

        for app in raw_apps {
            if self.seen.insert(app.aumid.clone()) {
                self.uwp_apps.push(app);
            }
        }

        Ok(())
    }
}

fn uwp_scan_powershell_script() -> &'static str {
    r#"
            $OutputEncoding = [System.Text.Encoding]::UTF8
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            $packages = @{}
            Get-AppxPackage | ForEach-Object {
                if ($_.InstallLocation) {
                    $packages[$_.PackageFamilyName] = $_.InstallLocation
                }
            }
            $result = Get-StartApps | Where-Object { $_.AppID -like '*!*' } | ForEach-Object {
                $aumid = $_.AppID
                $family = $aumid.Split('!')[0]
                $loc = $packages[$family]
                if (-not $loc) { $loc = '' }
                [PSCustomObject]@{
                    Name = $_.Name
                    Aumid = $aumid
                    InstallLocation = $loc
                }
            }
            if ($result) {
                $result | ConvertTo-Json -Compress
            }
        "#
}

pub fn is_default_app_location(app_path: &str) -> bool {
    let path = Path::new(app_path);
    get_default_app_scan_paths()
        .iter()
        .any(|dir| path.starts_with(dir))
}

pub fn display_path(app_path: &str) -> String {
    let path = Path::new(app_path);
    if let Some(home) = dirs::home_dir() {
        if let Ok(rest) = path.strip_prefix(&home) {
            if rest.as_os_str().is_empty() {
                return "~".to_string();
            }
            return format!("~{}{}", std::path::MAIN_SEPARATOR, rest.display());
        }
    }
    app_path.to_string()
}

pub fn normalize_scan_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.len() <= 1 {
        return trimmed.to_string();
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() == 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
        && bytes[0].is_ascii_alphabetic()
    {
        return trimmed.to_string();
    }
    trimmed
        .trim_end_matches(['/', std::path::MAIN_SEPARATOR])
        .to_string()
}

pub fn display_parent_dir(app_path: &str) -> String {
    let parent = Path::new(app_path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or(app_path);
    display_path(parent)
}

pub fn get_default_app_scan_paths() -> Vec<PathBuf> {
    let mut paths = vec![];
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(programdata) = std::env::var("PROGRAMDATA") {
        paths.push(PathBuf::from(programdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    paths
}

fn is_app_bundle(path: &Path) -> bool {
    path.extension().map(|e| e == "lnk").unwrap_or(false)
}

fn find_uwp_icon_path_from_manifest_content(content: &str) -> Option<String> {
    if let Some(caps) = Regex::new(r#"Square44x44Logo\s*=\s*"([^"]+)""#)
        .ok()?
        .captures(content)
    {
        Some(caps.get(1)?.as_str().to_string())
    } else if let Some(caps) = Regex::new(r#"Square150x150Logo\s*=\s*"([^"]+)""#)
        .ok()?
        .captures(content)
    {
        Some(caps.get(1)?.as_str().to_string())
    } else if let Some(caps) = Regex::new(r#"Logo\s*=\s*"([^"]+)""#)
        .ok()?
        .captures(content)
    {
        Some(caps.get(1)?.as_str().to_string())
    } else {
        None
    }
}

fn score_candidate(filename: &str) -> i32 {
    let mut score = 0;
    if filename.contains("targetsize-48") {
        score += 100;
    } else if filename.contains("targetsize-32") {
        score += 90;
    } else if filename.contains("targetsize-256") {
        score += 85;
    } else if filename.contains("scale-200") {
        score += 80;
    } else if filename.contains("scale-150") {
        score += 70;
    } else if filename.contains("scale-100") {
        score += 60;
    } else if !filename.contains("scale-") && !filename.contains("targetsize-") {
        score += 50;
    }

    if filename.contains("altform-unplated") {
        score += 10;
    }

    score
}

pub(crate) fn bundle_file_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Unknown_App")
        .to_string()
}

pub(crate) fn uwp_stable_name(aumid: &str) -> &str {
    let package_family = aumid.split('!').next().unwrap_or(aumid);
    if let Some((name, _publisher_id)) = package_family.rsplit_once('_') {
        if !name.is_empty() {
            return name;
        }
    }
    package_family
}

pub(crate) fn migrate_uwp_app_ids(
    search_state: &SearchState,
    alias_state: Option<&crate::aliases::AliasState>,
) -> Result<u32, AppError> {
    let mut items = search_state
        .items
        .write()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let mut migrated = 0;
    for item in items.iter_mut() {
        let SearchableItem::Application(app) = item else {
            continue;
        };
        let aumid_opt = if let Some(ref bundle_id) = app.bundle_id {
            if app.path.starts_with(r"shell:AppsFolder\") {
                Some(bundle_id.clone())
            } else {
                None
            }
        } else {
            app.path
                .strip_prefix(r"shell:AppsFolder\")
                .map(|aumid| aumid.to_string())
        };

        if let Some(aumid) = aumid_opt {
            let target_id = build_app_id(uwp_stable_name(&aumid), &aumid);
            if app.id != target_id {
                let old_id = app.id.clone();
                app.id = target_id.clone();
                migrated += 1;
                if let Some(aliases) = alias_state {
                    let _ = aliases.migrate_object_id(&old_id, &target_id);
                }
            }
        }
    }
    Ok(migrated)
}

pub(crate) fn display_name(path: &Path) -> String {
    crate::platform::localized_bundle_name(path).unwrap_or_else(|| bundle_file_name(path))
}

pub(crate) fn extract_bundle_id(_path: &Path) -> Option<String> {
    None
}

fn get_icon_cache_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|p| p.join("icon_cache"))
        .unwrap_or_else(|_| {
            app.path()
                .app_local_data_dir()
                .unwrap_or_default()
                .join("icon_cache")
        })
}

pub(crate) fn extract_app_icon(app_path: &str, cache_dir: &Path) -> Option<String> {
    let cache_key = app_path
        .replace(['/', '\\', ':', ' '], "_")
        .replace(".app", "")
        .replace(".desktop", "")
        .replace(".exe", "");

    let base_name = &cache_key[..cache_key.len().min(200)];
    let cache_filename_png = format!("{base_name}.png");
    let cache_file_png = cache_dir.join(&cache_filename_png);
    if cache_file_png.exists() {
        return Some(format!(
            "http://asyar-icon.localhost/{}",
            cache_filename_png
        ));
    }

    let cache_filename_svg = format!("{base_name}.svg");
    let cache_file_svg = cache_dir.join(&cache_filename_svg);
    if cache_file_svg.exists() {
        return Some(format!(
            "http://asyar-icon.localhost/{}",
            cache_filename_svg
        ));
    }

    let missing_marker = cache_dir.join(format!("{base_name}.missing"));
    if missing_marker.exists() {
        return None;
    }

    if let Some(bytes) = crate::platform::extract_icon(Path::new(app_path)) {
        let _ = std::fs::create_dir_all(cache_dir);
        let is_svg = bytes.starts_with(b"<") || bytes.windows(4).take(32).any(|w| w == b"<svg");
        let (chosen_filename, chosen_file) = if is_svg {
            (cache_filename_svg, cache_file_svg)
        } else {
            (cache_filename_png, cache_file_png)
        };
        let _ = std::fs::write(&chosen_file, bytes);
        return Some(format!("http://asyar-icon.localhost/{}", chosen_filename));
    }

    let _ = std::fs::create_dir_all(cache_dir);
    let _ = std::fs::File::create(&missing_marker);

    None
}

pub(crate) fn extract_uwp_app_icon(
    aumid: &str,
    install_location: &str,
    cache_dir: &Path,
) -> Option<String> {
    let cache_key = format!("uwp_{}", aumid.replace(['/', '\\', ':', ' ', '!'], "_"));
    let cache_filename = format!("{}.png", &cache_key[..cache_key.len().min(200)]);
    let cache_file = cache_dir.join(&cache_filename);

    if cache_file.exists() {
        return Some(format!("http://asyar-icon.localhost/{}", cache_filename));
    }

    if let Some(bytes) = find_uwp_icon_bytes(install_location) {
        let _ = std::fs::create_dir_all(cache_dir);
        if std::fs::write(&cache_file, bytes).is_ok() {
            return Some(format!("http://asyar-icon.localhost/{}", cache_filename));
        }
    }

    None
}

fn find_uwp_icon_bytes(install_location: &str) -> Option<Vec<u8>> {
    if install_location.is_empty() {
        return None;
    }
    let manifest_path = Path::new(install_location).join("AppxManifest.xml");
    if !manifest_path.is_file() {
        return None;
    }

    let content = std::fs::read_to_string(&manifest_path).ok()?;
    let logo_path = find_uwp_icon_path_from_manifest_content(&content)?;

    let logo_path_clean = if logo_path.starts_with("ms-resource:") {
        logo_path.strip_prefix("ms-resource:").unwrap().to_string()
    } else {
        logo_path
    };

    let logo_path_normalized = logo_path_clean.replace('\\', "/");
    let full_logo_path = Path::new(install_location).join(&logo_path_normalized);

    let parent_dir = full_logo_path.parent()?;
    if !parent_dir.is_dir() {
        return None;
    }

    let stem = full_logo_path.file_stem()?.to_str()?;
    let stem_lower = stem.to_lowercase();

    let mut best_candidate: Option<PathBuf> = None;
    let mut best_score = -1;

    if let Ok(entries) = std::fs::read_dir(parent_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    let filename_lower = filename.to_lowercase();
                    if filename_lower.starts_with(&stem_lower) {
                        let score = score_candidate(&filename_lower);
                        if score > best_score {
                            best_score = score;
                            best_candidate = Some(path);
                        }
                    }
                }
            }
        }
    }

    if let Some(cand) = best_candidate {
        std::fs::read(cand).ok()
    } else {
        std::fs::read(full_logo_path).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_uwp_scan_script_indexes_apps_without_install_location() {
        let script = uwp_scan_powershell_script();
        assert!(script.contains("Get-StartApps"));
        assert!(script.contains("$_.AppID -like '*!*'"));
        assert!(!script.contains("if ($loc) {"));
        assert!(script.contains("if (-not $loc) { $loc = '' }"));
    }

    #[test]
    fn test_uwp_app_deserializes_pascalcase_powershell_json() {
        let json = r#"{"Name":"Calculator","Aumid":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App","InstallLocation":"C:\\Program Files\\WindowsApps\\Calc"}"#;
        let app: UwpApp = serde_json::from_str(json).expect("PascalCase JSON must deserialize");
        assert_eq!(app.name, "Calculator");
        assert_eq!(app.aumid, "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App");
        assert_eq!(app.install_location, "C:\\Program Files\\WindowsApps\\Calc");

        let arr = r#"[{"Name":"A","Aumid":"a!b","InstallLocation":""}]"#;
        let apps: Vec<UwpApp> = serde_json::from_str(arr).expect("array form must deserialize");
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].install_location, "");
    }

    #[test]
    fn test_uwp_scan_script_forces_utf8_output() {
        let script = uwp_scan_powershell_script();
        assert!(script.contains("[Console]::OutputEncoding = [System.Text.Encoding]::UTF8"));
    }

    #[test]
    fn test_uwp_scan_script_avoids_quadratic_array_growth() {
        let script = uwp_scan_powershell_script();
        assert!(!script.contains("+="));
    }

    #[test]
    fn test_get_default_app_scan_paths_is_non_empty() {
        let paths = get_default_app_scan_paths();
        assert!(!paths.is_empty());
    }

    fn indexed_app(id: &str, name: &str, usage_count: u32) -> SearchableItem {
        SearchableItem::Application(Application {
            id: id.to_string(),
            name: name.to_string(),
            path: format!("C:\\Apps\\{name}.lnk"),
            usage_count,
            icon: None,
            last_used_at: Some(1_700_000_000),
            bundle_id: None,
        })
    }

    fn scanned_app(id: &str, name: &str) -> (String, Application) {
        (
            id.to_string(),
            Application {
                id: id.to_string(),
                name: name.to_string(),
                path: format!("C:\\Apps\\{name}.lnk"),
                usage_count: 0,
                icon: None,
                last_used_at: None,
                bundle_id: None,
            },
        )
    }

    #[test]
    fn test_refresh_display_names_updates_a_stale_name() {
        let mut items = vec![indexed_app("app_Photos", "Photos", 0)];
        let scanned = HashMap::from([scanned_app("app_Photos", "Fotos")]);

        assert_eq!(refresh_display_names(&mut items, &scanned), 1);
        assert_eq!(items[0].get_name(), "Fotos");
    }

    #[test]
    fn test_refresh_display_names_preserves_frecency() {
        let mut items = vec![indexed_app("app_Photos", "Photos", 42)];
        let scanned = HashMap::from([scanned_app("app_Photos", "Fotos")]);

        refresh_display_names(&mut items, &scanned);

        let SearchableItem::Application(app) = &items[0] else {
            panic!("item must stay an application");
        };
        assert_eq!(app.usage_count, 42);
        assert_eq!(app.last_used_at, Some(1_700_000_000));
    }

    #[test]
    fn test_scanner_records_a_scan_root_that_is_itself_a_bundle() {
        let tmp = std::env::temp_dir().join("asyar_test_bundle_root");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let app_path = tmp.join("Rooted.lnk");
        fs::write(&app_path, b"test").unwrap();

        let mut scanner = AppScanner::new();
        scanner.scan_directory(&app_path).unwrap();

        assert_eq!(scanner.paths, vec![app_path.to_str().unwrap().to_string()]);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_normalize_scan_path_trims_whitespace() {
        assert_eq!(normalize_scan_path("  C:\\Apps  "), "C:\\Apps");
    }

    #[test]
    fn test_normalize_scan_path_strips_trailing_backslash_on_windows() {
        assert_eq!(
            normalize_scan_path("C:\\Program Files\\"),
            "C:\\Program Files"
        );
    }

    #[test]
    fn test_normalize_scan_path_preserves_windows_drive_root() {
        assert_eq!(normalize_scan_path("C:\\"), "C:\\");
        assert_eq!(normalize_scan_path("D:\\"), "D:\\");
    }

    #[test]
    fn test_scanner_discovers_app_bundles_in_temp_dir() {
        let tmp = std::env::temp_dir().join("asyar_test_scanner");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let app_path = tmp.join("Test.lnk");
        fs::write(&app_path, b"test").unwrap();

        let mut scanner = AppScanner::new();
        let _ = scanner.scan_directory(&tmp);

        assert_eq!(scanner.paths.len(), 1);
        assert!(scanner.paths[0].to_lowercase().contains("test"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
