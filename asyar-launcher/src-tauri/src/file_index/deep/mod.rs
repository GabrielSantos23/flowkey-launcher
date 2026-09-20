//! Deep-search: on-demand delegation to the OS-native search tool, run
//! exactly once per explicit user action (never per keystroke). Whichever
//! provider exists on this machine wins; if none does, the feature simply
//! isn't offered — no cross-platform shim, no degraded fallback.

pub mod everything;

use std::sync::OnceLock;

use super::provider::DeepProvider;

fn platform_provider() -> Box<dyn DeepProvider> {
    {
        Box::new(everything::EverythingProvider)
    }
}

static AVAILABLE: OnceLock<bool> = OnceLock::new();

/// Returns this platform's deep-search provider if it's actually usable on
/// this machine (probed once, cached for the process lifetime — deep
/// search availability cannot change mid-session).
pub fn provider_for_platform() -> Option<Box<dyn DeepProvider>> {
    let provider = platform_provider();
    let available = *AVAILABLE.get_or_init(|| provider.probe());
    available.then_some(provider)
}
