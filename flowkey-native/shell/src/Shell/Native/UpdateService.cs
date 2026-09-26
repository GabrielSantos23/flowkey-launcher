using System.Reflection;
using System.Windows.Threading;
using Velopack;
using Velopack.Sources;

namespace FlowKey.Shell.Native;

/// <summary>
/// Wraps Velopack update checks and installs against the GitHub Releases of this
/// repository. Phase transitions surface through <see cref="StatusChanged"/>; the
/// banner row and the settings About page both subscribe to it.
/// </summary>
public sealed class UpdateService
{
    public const string DefaultSource = "https://github.com/GabrielSantos23/flowkey-launcher";
    private static readonly TimeSpan AutoCheckInterval = TimeSpan.FromHours(6);
    private static readonly long MinAutoCheckGapMs = (long)TimeSpan.FromHours(1).TotalMilliseconds;

    private readonly string settingsDirectory;
    private readonly string source;
    private readonly UpdateStateTracker tracker;
    private readonly object gate = new();
    private DispatcherTimer? autoCheckTimer;

    public event Action<UpdateStatus>? StatusChanged;

    public UpdateService(string dataDirectory, string? source = null)
    {
        settingsDirectory = dataDirectory;
        this.source = source ?? DefaultSource;
        tracker = new UpdateStateTracker(CurrentVersion());
    }

    public static string CurrentVersion()
    {
        var version = Assembly.GetEntryAssembly()?.GetName().Version;
        return version is null ? "0.0.0" : $"{version.Major}.{version.Minor}.{version.Build}";
    }

    public UpdateStatus Status => tracker.Status;

    /// <summary>
    /// Must run before any window is created so Velopack can process its
    /// install/uninstall/obsolete command-line hooks.
    /// </summary>
    public static void HookInstaller()
    {
        try
        {
            VelopackApp.Build().Run();
        }
        catch (Exception ex)
        {
            DebugLog.Write("velopack hook failed: " + ex.Message);
        }
    }

    public void StartAutomaticChecks(Dispatcher dispatcher)
    {
        var settings = UpdateSettingsStore.Load(settingsDirectory);
        if (!settings.AutoCheckEnabled)
        {
            return;
        }
        autoCheckTimer = new DispatcherTimer(AutoCheckInterval, DispatcherPriority.Background, (_, _) => _ = CheckNowAsync(), dispatcher);
        var lastChecked = settings.LastCheckedAtMs;
        var stale = lastChecked is null
            || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - lastChecked.Value > MinAutoCheckGapMs;
        if (stale)
        {
            dispatcher.BeginInvoke(async () => await CheckNowAsync(), DispatcherPriority.Background);
        }
    }

    public void SetAutoCheckEnabled(bool enabled, Dispatcher dispatcher)
    {
        var settings = UpdateSettingsStore.Load(settingsDirectory) with { AutoCheckEnabled = enabled };
        UpdateSettingsStore.Save(settingsDirectory, settings);
        if (enabled)
        {
            StartAutomaticChecks(dispatcher);
        }
        else
        {
            autoCheckTimer?.Stop();
            autoCheckTimer = null;
        }
    }

    public bool IsAutoCheckEnabled() => UpdateSettingsStore.Load(settingsDirectory).AutoCheckEnabled;

    public async Task CheckNowAsync()
    {
        var status = tracker.BeginCheck();
        Raise(status);
        var settings = UpdateSettingsStore.Load(settingsDirectory) with
        {
            LastCheckedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };
        UpdateSettingsStore.Save(settingsDirectory, settings);
        try
        {
            var manager = CreateManager();
            if (manager is null)
            {
                tracker.CheckCompleted(false, null, "Development build — updates install via a Velopack release");
                Raise(tracker.Status);
                return;
            }
            var update = await manager.CheckForUpdatesAsync();
            if (update is null)
            {
                tracker.CheckCompleted(false, null, "You're up to date");
            }
            else
            {
                tracker.CheckCompleted(true, update.TargetFullRelease.Version.ToNormalizedString(), null);
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write("update check failed: " + ex.Message);
            tracker.CheckFailed(ex.Message);
        }
        Raise(tracker.Status);
    }

    public async Task DownloadAndApplyAsync()
    {
        tracker.BeginDownload();
        Raise(tracker.Status);
        try
        {
            var manager = CreateManager();
            if (manager is null)
            {
                tracker.DownloadFailed("Development build — nothing to download");
                Raise(tracker.Status);
                return;
            }
            var update = await manager.CheckForUpdatesAsync();
            if (update is null)
            {
                tracker.DownloadFailed("Update no longer available");
                Raise(tracker.Status);
                return;
            }
            await manager.DownloadUpdatesAsync(update, progress =>
            {
                Raise(tracker.DownloadProgress(progress));
            });
            tracker.DownloadCompleted();
            Raise(tracker.Status);
            manager.ApplyUpdatesAndRestart(update);
        }
        catch (Exception ex)
        {
            DebugLog.Write("update download failed: " + ex.Message);
            tracker.DownloadFailed(ex.Message);
            Raise(tracker.Status);
        }
    }

    private UpdateManager? CreateManager()
    {
        try
        {
            // Throws when the app is not running from a Velopack install
            // (e.g. a plain dotnet publish / dev checkout) — treat as dev build.
            // GitHubReleasesSource is required: Velopack 1.x has no built-in
            // GitHub source and a bare repo URL 404s on /RELEASES.
            return new UpdateManager(new GitHubReleasesSource(source));
        }
        catch (Exception ex)
        {
            DebugLog.Write("update manager unavailable: " + ex.Message);
            return null;
        }
    }

    private void Raise(UpdateStatus status)
    {
        StatusChanged?.Invoke(status);
    }
}
