using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Threading;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed class AppLauncherService : IDisposable
{
    private readonly AppUsageStore usage;
    private readonly List<AppEntry> cache = new();
    private readonly object gate = new();
    private readonly FileSystemWatcher[] watchers;
    private DispatcherTimer? rebuildTimer;

    public AppLauncherService()
    {
        usage = new AppUsageStore(DataDirectory);
        Directory.CreateDirectory(IconUriPolicy.IconCacheRoot);
        watchers = new[]
        {
            Watch(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu)),
            Watch(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)),
        };
        StartRebuildThread();
    }

    public static string DataDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FlowKey.Shell");

    public void SetRebuildDispatcher(Dispatcher dispatcher)
    {
        uiDispatcher = dispatcher;
        rebuildTimer = new DispatcherTimer(DispatcherPriority.Background, dispatcher) { Interval = TimeSpan.FromSeconds(1.5) };
        rebuildTimer.Tick += (_, _) =>
        {
            rebuildTimer.Stop();
            StartRebuildThread();
        };
    }

    private Dispatcher? uiDispatcher;

    private void StartRebuildThread()
    {
        var thread = new Thread(Rebuild);
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
    }

    private void RequestRebuild()
    {
        if (uiDispatcher is { } dispatcher)
        {
            dispatcher.BeginInvoke(() => rebuildTimer?.Start());
        }
        else
        {
            StartRebuildThread();
        }
    }

    private FileSystemWatcher Watch(string path)
    {
        if (string.IsNullOrEmpty(path) || !Directory.Exists(path))
        {
            return new FileSystemWatcher { EnableRaisingEvents = false };
        }
        var watcher = new FileSystemWatcher(path, "*.lnk")
        {
            IncludeSubdirectories = true,
            EnableRaisingEvents = true,
        };
        watcher.Created += (_, _) => RequestRebuild();
        watcher.Deleted += (_, _) => RequestRebuild();
        watcher.Renamed += (_, _) => RequestRebuild();
        return watcher;
    }

    public void Rebuild()
    {
        FlowKey.Shell.DebugLog.Write("app cache rebuild started");
        List<AppEntry> rebuilt;
        try
        {
            rebuilt = AppRanker.Deduplicate(AppsFolderEnumerator.Enumerate());
            FlowKey.Shell.DebugLog.Write("app cache enumerate returned " + rebuilt.Count);
        }
        catch (Exception ex)
        {
            FlowKey.Shell.DebugLog.Write("app cache rebuild failed: " + ex.Message);
            return;
        }
        lock (gate)
        {
            cache.Clear();
            cache.AddRange(rebuilt);
        }
        FlowKey.Shell.DebugLog.Write("app cache rebuilt: " + rebuilt.Count + " apps");
        uiDispatcher?.BeginInvoke(() => CacheUpdated?.Invoke());
        var iconThread = new Thread(() => ExtractAllIcons(rebuilt));
        iconThread.SetApartmentState(ApartmentState.STA);
        iconThread.Start();
    }

    public event Action? CacheUpdated;

    public List<(AppEntry Entry, string? IconPath)> List(string query, int dpiPixelSize)
    {
        List<AppEntry> snapshot;
        lock (gate)
        {
            snapshot = cache.ToList();
        }
        return snapshot
            .Select(e => (Entry: e, Score: AppRanker.Score(e, query, usage.GetCount(e.Id))))
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.Name, StringComparer.OrdinalIgnoreCase)
            .Take(100)
            .Select(x => (x.Entry, CachedIconPath(x.Entry, dpiPixelSize)))
            .ToList();
    }

    private string? CachedIconPath(AppEntry entry, int dpiPixelSize)
    {
        var cached = Path.Combine(IconUriPolicy.IconCacheRoot, AppIconCache.Hash(entry.IconKey) + "_" + dpiPixelSize + ".png");
        return File.Exists(cached) ? cached : null;
    }

    private void ExtractAllIcons(List<AppEntry> entries)
    {
        foreach (var entry in entries)
        {
            if (CachedIconPath(entry, IconPixelSize) is not null)
            {
                continue;
            }
            IntPtr pidl = IntPtr.Zero;
            try
            {
                if (SHParseDisplayName(entry.LaunchPath, IntPtr.Zero, out pidl, 0, out _) < 0 || pidl == IntPtr.Zero)
                {
                    continue;
                }
                AppIconCache.ExtractToCache(pidl, entry.IconKey, IconPixelSize);
            }
            catch
            {
                /* icon is optional */
            }
            finally
            {
                if (pidl != IntPtr.Zero) ILFree(pidl);
            }
        }
    }

    private const int IconPixelSize = 32;

    public void Launch(string appId)
    {
        AppEntry? entry;
        lock (gate)
        {
            entry = cache.FirstOrDefault(e => string.Equals(e.Id, appId, StringComparison.OrdinalIgnoreCase));
        }
        if (entry is null)
        {
            throw new KeyNotFoundException(appId);
        }
        usage.Increment(entry.Id);
        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = entry.LaunchPath,
            UseShellExecute = true,
        };
        System.Diagnostics.Process.Start(psi);
    }

    public void Dispose()
    {
        foreach (var watcher in watchers)
        {
            watcher.Dispose();
        }
    }

    [DllImport("shell32.dll")]
    private static extern int SHParseDisplayName([MarshalAs(UnmanagedType.LPWStr)] string pszName, IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);

    [DllImport("shell32.dll")]
    private static extern void ILFree(IntPtr pidl);
}
