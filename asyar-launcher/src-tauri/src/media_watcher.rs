//! Windows media-session watcher — watches the System Media Transport
//! Controls (SMTC) for the Spotify session and emits a `media:track-changed`
//! bridge event whenever the playing track changes.
//!
//! This is the event source behind the Dynamic Island's "now playing"
//! notification: no network round-trips, no Spotify API quota, and it fires
//! even when the change comes from the Spotify app itself rather than an
//! Asyar command. Non-Windows platforms have no watcher; the Spotify
//! feature's Web API fallback covers island notifications there.
//!
//! Polling rather than subscribing: SMTC metadata change events fire in
//! bursts (often 3-4 per track transition), and a typed event handler has to
//! marshal WinRT callbacks across threads. A 2s in-process poll that diffs
//! (title, artist) against the last emitted pair is simpler, cheap (a
//! native COM call, not a PowerShell spawn), and debounce comes free.

use base64::Engine;
use serde::Serialize;

use crate::event_bridge::bridge_emit;

/// How often to sample the SMTC session (a native COM call — negligible).
/// 1s keeps track-change detection snappy without measurable cost.
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackChangedPayload {
    pub title: String,
    pub artist: String,
    /// Album art as a data URL, extracted natively from the SMTC thumbnail —
    /// no network round-trip. `None` when the session provides no artwork.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub art: Option<String>,
}

/// Spawn the watcher thread. No-op on non-Windows.
pub fn spawn(app: tauri::AppHandle) {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("media-watcher".into())
        .spawn(move || {
            if let Err(err) = run(app) {
                log::warn!("[media_watcher] exited: {err}");
            }
        })
        .expect("spawn media-watcher thread");
    #[cfg(not(windows))]
    {
        let _ = app; // unused on non-Windows
    }
}

/// Locate the Spotify SMTC session, if one is running. Returns `None` when
/// Spotify isn't running — the loop keeps polling and picks the session up
/// when Spotify starts.
#[cfg(windows)]
fn spotify_session(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    let sessions = manager.GetSessions().ok()?;
    sessions.into_iter().find(|session| {
        session
            .SourceAppUserModelId()
            .map(|id| id.to_string_lossy().contains("Spotify"))
            .unwrap_or(false)
    })
}

#[cfg(windows)]
fn run(app: tauri::AppHandle) -> windows::core::Result<()> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    // RequestAsync().get() blocks until the session manager is ready; doing
    // it once up front keeps the poll loop allocation-free.
    let manager: GlobalSystemMediaTransportControlsSessionManager =
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;

    let mut last: Option<(String, String)> = None;
    loop {
        std::thread::sleep(POLL_INTERVAL);

        let Some(session) = spotify_session(&manager) else {
            // Spotify stopped — reset so a restart shows the first track.
            last = None;
            continue;
        };

        let Ok(props) = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()) else {
            continue;
        };
        let Ok(title) = props.Title() else { continue };
        let Ok(artist) = props.Artist() else { continue };

        let current = (title.to_string(), artist.to_string());
        if Some(&current) == last.as_ref() {
            continue;
        }
        let art = thumbnail_data_url(&props);
        last = Some(current.clone());

        log::info!(
            "[media_watcher] track changed: {} — {} (art={})",
            current.0,
            current.1,
            art.is_some()
        );
        bridge_emit(
            &app,
            "media:track-changed",
            TrackChangedPayload {
                title: current.0,
                artist: current.1,
                art,
            },
        );
    }
}

/// Extract the session's album-art thumbnail as a `data:` URL. The SMTC
/// thumbnail is a small PNG/JPEG (a few KB), so base64-embedding it into the
/// event payload keeps the island's show path completely offline — the art is
/// on screen with zero extra latency.
#[cfg(windows)]
fn thumbnail_data_url(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    let stream_ref = props.Thumbnail().ok()?;
    let stream = stream_ref.OpenReadAsync().ok()?.get().ok()?;
    let size: u64 = stream.Size().ok()?;
    if size == 0 || size > 4 * 1024 * 1024 {
        return None;
    }
    let content_type = stream
        .ContentType()
        .map(|ct| ct.to_string())
        .unwrap_or_else(|_| "image/png".into());
    let mime = if content_type.contains("jpeg") || content_type.contains("jpg") {
        "image/jpeg"
    } else {
        "image/png"
    };

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.get().ok()?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;

    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
