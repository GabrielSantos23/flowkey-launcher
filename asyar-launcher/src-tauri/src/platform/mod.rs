//! Platform-specific abstractions.
//!
//! Windows implementation with safe wrappers around OS-level APIs.

pub mod input;
pub mod windows;
pub mod windows_key_resolver;

pub use windows::extract_icon;

/// Windows builds have no bundle-level display-name lookup, so callers fall
/// back to the file stem.
pub fn localized_bundle_name(_path: &std::path::Path) -> Option<String> {
    None
}
