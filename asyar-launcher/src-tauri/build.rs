use std::path::PathBuf;

fn main() {
    let base_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());

    // Expose the build-time target triple to the crate so process.rs can locate
    // the `tauri dev` sidecar/binary layout (`binaries/<name>-<triple>`).
    println!(
        "cargo:rustc-env=TARGET_TRIPLE={}",
        std::env::var("TARGET").expect("TARGET env var not set")
    );
    println!("cargo:rerun-if-env-changed=ASYAR_KEYCHAIN_SERVICE");
    if let Ok(service) = std::env::var("ASYAR_KEYCHAIN_SERVICE") {
        println!("cargo:rustc-env=ASYAR_KEYCHAIN_SERVICE={service}");
    }
    let features_source_dir = base_dir.join("../src/built-in-features");
    let staging_dir = base_dir.join("built-in-features");

    println!("cargo:rerun-if-changed=../src/built-in-features");

    // Clean previous staging area
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(&staging_dir);
    }
    std::fs::create_dir_all(&staging_dir).expect("Failed to create staging directory");

    // Copy only manifest.json from each feature
    if let Ok(entries) = std::fs::read_dir(&features_source_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let feature_name = path.file_name().unwrap().to_str().unwrap();
            let manifest_src = path.join("manifest.json");

            if manifest_src.exists() {
                let target_dir = staging_dir.join(feature_name);
                std::fs::create_dir_all(&target_dir).unwrap_or_else(|_| {
                    panic!("Failed to create staging dir for {}", feature_name)
                });

                let manifest_dest = target_dir.join("manifest.json");
                std::fs::copy(&manifest_src, &manifest_dest).unwrap_or_else(|_| {
                    panic!("Failed to copy manifest.json for {}", feature_name)
                });

                println!("Staged manifest.json for: {}", feature_name);
            }
        }
    }

    // Inject the SDK version from asyar-sdk/package.json so the Rust-side
    // compatibility check cannot drift from the real SDK version.
    let sdk_pkg_path = [
        base_dir.join("../node_modules/asyar-sdk/package.json"),
        base_dir.join("../../asyar-sdk/package.json"),
        base_dir.join("../../../asyar-sdk/package.json"),
    ]
    .into_iter()
    .find(|p| p.is_file())
    .unwrap_or_else(|| base_dir.join("../../asyar-sdk/package.json"));

    let sdk_version = read_sdk_version(&sdk_pkg_path);
    println!("cargo:rustc-env=ASYAR_SDK_VERSION={}", sdk_version);
    println!("cargo:rerun-if-changed={}", sdk_pkg_path.display());

    // Windows (MSVC): make `cargo test` loadable.
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if is_windows_msvc {
        const COMCTL6_DEPENDENCY: &str = "type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'";
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:{COMCTL6_DEPENDENCY}");
    }

    let mut attributes = tauri_build::Attributes::new();
    if is_windows_msvc {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

fn read_sdk_version(path: &std::path::Path) -> String {
    let content = std::fs::read_to_string(path).unwrap_or_else(|e| {
        panic!(
            "build.rs failed to read asyar-sdk/package.json at {:?}: {}",
            path, e
        )
    });

    let version = content
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("\"version\":")
                .map(|rest| rest.trim().trim_end_matches(','))
                .map(|v| v.trim_matches('"').to_string())
        })
        .unwrap_or_else(|| panic!("build.rs could not find a \"version\" field in {:?}", path));

    if semver::Version::parse(&version).is_err() {
        panic!(
            "build.rs read invalid semver \"{}\" from {:?}",
            version, path
        );
    }

    version
}
