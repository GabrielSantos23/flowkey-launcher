//! Windows-native Spotify transport control via the Windows Runtime
//! System Media Transport Controls (SMTC). Talking to the local Spotify
//! session directly has no network round-trip, so play/pause/skip feel
//! instant — unlike the Web API path, which needs Premium and a device
//! round-trip.

use crate::error::AppError;
use std::process::Command;

/// Shared SMTC plumbing:Await() bridges WinRT IAsyncOperation to PowerShell,
/// Get-SpotifySession finds the Spotify media session (starting Spotify if
/// needed), and Ensure-SpotifyRunning wraps that with a startup retry.
const SMTC_HELPERS: &str = r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

Function Get-SpotifySession {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
    $mediaManager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    $sessions = $mediaManager.GetSessions()
    $spotifySession = $sessions | Where-Object {
        $_.SourceAppUserModelId -match "Spotify"
    }

    return $spotifySession
}

Function Ensure-SpotifyRunning {
    $session = Get-SpotifySession

    if (-not $session) {
        try {
            Start-Process "spotify:"
        } catch {}

        $timeout = 15
        $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 1
            $elapsed++

            $session = Get-SpotifySession
            if ($session) {
                return $session
            }
        }
    }

    return $session
}
"#;

/// Per-action PowerShell body. `toggle` reads the session playback status so
/// a single command can play/pause without a state round-trip to the API.
fn action_body(action: &str) -> Option<&'static str> {
    match action {
        "play" => Some("Await ($session.TryPlayAsync()) ([bool])"),
        "pause" => Some("Await ($session.TryPauseAsync()) ([bool])"),
        "next" => Some("Await ($session.TrySkipNextAsync()) ([bool])"),
        "previous" => Some("Await ($session.TrySkipPreviousAsync()) ([bool])"),
        "toggle" => Some(
            "$pb = Await ($session.GetPlaybackInfoAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackInfo])\n    if ($pb.PlaybackStatus -eq 'Playing') { Await ($session.TryPauseAsync()) ([bool]) } else { Await ($session.TryPlayAsync()) ([bool]) }",
        ),
        _ => None,
    }
}

/// Build the full PowerShell script for an SMTC action.
pub fn build_smtc_script(action: &str) -> Result<String, AppError> {
    let body = action_body(action).ok_or_else(|| {
        AppError::Validation(format!(
            "Unknown Spotify media action '{action}' (expected play, pause, toggle, next or previous)"
        ))
    })?;

    Ok(format!(
        "{SMTC_HELPERS}\n$session = Ensure-SpotifyRunning\n    if ($session) {{\n        {body}\n    }}\n"
    ))
}

/// Run a native Windows media-control action against the local Spotify
/// session. Any action in {play, pause, toggle, next, previous}.
#[tauri::command]
pub async fn spotify_smtc_command(action: String) -> Result<(), AppError> {
    let script = build_smtc_script(&action)?;

    let output = tokio::task::spawn_blocking(move || {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .output()
    })
    .await
    .map_err(|e| AppError::Extension(format!("Failed to spawn PowerShell: {e}")))?
    .map_err(|e| AppError::Extension(format!("Failed to run PowerShell: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Extension(format!(
            "Spotify media control failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_smtc_script_maps_known_actions() {
        for action in ["play", "pause", "toggle", "next", "previous"] {
            let script = build_smtc_script(action).unwrap();
            assert!(script.contains("Ensure-SpotifyRunning"));
            assert!(script.contains("GlobalSystemMediaTransportControlsSessionManager"));
            assert!(
                !script.contains("$session.Await"),
                "script must not invoke non-existent $session.Await"
            );
        }
        assert!(build_smtc_script("play")
            .unwrap()
            .contains("Await ($session.TryPlayAsync()) ([bool])"));
        assert!(build_smtc_script("next")
            .unwrap()
            .contains("Await ($session.TrySkipNextAsync()) ([bool])"));
        assert!(build_smtc_script("previous")
            .unwrap()
            .contains("Await ($session.TrySkipPreviousAsync()) ([bool])"));
        assert!(build_smtc_script("pause")
            .unwrap()
            .contains("Await ($session.TryPauseAsync()) ([bool])"));
    }

    #[test]
    fn build_smtc_script_toggle_reads_playback_status() {
        let script = build_smtc_script("toggle").unwrap();
        assert!(script.contains("GetPlaybackInfoAsync"));
        assert!(script.contains("TryPauseAsync"));
        assert!(script.contains("TryPlayAsync"));
        assert!(!script.contains("$session.Await"));
    }

    #[test]
    fn build_smtc_script_rejects_unknown_actions() {
        assert!(build_smtc_script("set-volume").is_err());
        assert!(build_smtc_script("").is_err());
    }
}
