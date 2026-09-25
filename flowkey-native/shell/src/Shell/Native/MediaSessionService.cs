using System.Text.Json;
using Windows.Media.Control;

namespace FlowKey.Shell.Native;

public sealed record MediaSnapshot(
    bool Playing,
    string? Title,
    string? Artist,
    string? Album,
    int PositionMs,
    int DurationMs,
    long UpdatedAtMs);

public sealed class MediaSessionService
{
    private static readonly JsonSerializerOptions SnapshotOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly object gate = new();
    private GlobalSystemMediaTransportControlsSessionManager? manager;
    private GlobalSystemMediaTransportControlsSession? watched;
    private MediaSnapshot? latest;

    public async Task InitializeAsync()
    {
        try
        {
            manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            manager.CurrentSessionChanged += OnSessionSetChanged;
            manager.SessionsChanged += OnSessionSetChanged;
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            DebugLog.Write("media sessions unavailable: " + ex.Message);
        }
    }

    public MediaSnapshot? Current()
    {
        lock (gate)
        {
            return latest;
        }
    }

    public void TogglePlayPause()
    {
        var session = WatchedSession();
        if (session is null)
        {
            return;
        }
        var playing = session.GetPlaybackInfo()?.PlaybackStatus
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
        Control(session, async () =>
        {
            if (playing)
            {
                await session.TryPauseAsync();
            }
            else
            {
                await session.TryPlayAsync();
            }
        });
    }

    public void Next()
    {
        var session = WatchedSession();
        if (session is null)
        {
            return;
        }
        Control(session, async () => await session.TrySkipNextAsync());
    }

    public void Previous()
    {
        var session = WatchedSession();
        if (session is null)
        {
            return;
        }
        Control(session, async () => await session.TrySkipPreviousAsync());
    }

    private GlobalSystemMediaTransportControlsSession? WatchedSession()
    {
        lock (gate)
        {
            return watched;
        }
    }

    private async void Control(GlobalSystemMediaTransportControlsSession? session, Func<Task> control)
    {
        try
        {
            await control();
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            DebugLog.Write("media control failed: " + ex.Message);
        }
    }

    public NativeCallOutcome CurrentOutcome()
    {
        var snapshot = Current();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(
            snapshot ?? new MediaSnapshot(false, null, null, null, 0, 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),
            SnapshotOptions));
    }

    private GlobalSystemMediaTransportControlsSession? PickSession()
    {
        if (manager is null)
        {
            return null;
        }
        var sessions = manager.GetSessions();
        return sessions.FirstOrDefault(s =>
            s.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
            ?? manager.GetCurrentSession()
            ?? sessions.FirstOrDefault();
    }

    private async Task RefreshAsync()
    {
        try
        {
            var session = PickSession();
            Watch(session);
            if (session is null)
            {
                Set(new MediaSnapshot(false, null, null, null, 0, 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
                return;
            }
            var playback = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();
            var properties = await session.TryGetMediaPropertiesAsync();
            var playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            Set(new MediaSnapshot(
                playing,
                properties.Title,
                properties.Artist,
                properties.AlbumTitle,
                (int)timeline.Position.TotalMilliseconds,
                (int)timeline.EndTime.TotalMilliseconds,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
        }
        catch (Exception ex)
        {
            DebugLog.Write("media refresh failed: " + ex.Message);
        }
    }

    private void Watch(GlobalSystemMediaTransportControlsSession? session)
    {
        lock (gate)
        {
            if (ReferenceEquals(watched, session))
            {
                return;
            }
            if (watched is not null)
            {
                watched.PlaybackInfoChanged -= OnSessionUpdated;
                watched.TimelinePropertiesChanged -= OnSessionUpdated;
                watched.MediaPropertiesChanged -= OnSessionUpdated;
            }
            watched = session;
            if (session is not null)
            {
                session.PlaybackInfoChanged += OnSessionUpdated;
                session.TimelinePropertiesChanged += OnSessionUpdated;
                session.MediaPropertiesChanged += OnSessionUpdated;
            }
        }
    }

    private void OnSessionSetChanged(GlobalSystemMediaTransportControlsSessionManager sender, object? args)
    {
        _ = RefreshAsync();
    }

    private void OnSessionUpdated(GlobalSystemMediaTransportControlsSession sender, object? args)
    {
        _ = RefreshAsync();
    }

    private void Set(MediaSnapshot snapshot)
    {
        lock (gate)
        {
            latest = snapshot;
        }
    }
}
