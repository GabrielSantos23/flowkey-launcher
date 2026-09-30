using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Point = System.Windows.Point;
using Brush = System.Windows.Media.Brush;
using TextBox = System.Windows.Controls.TextBox;
using CheckBox = System.Windows.Controls.CheckBox;
using ComboBox = System.Windows.Controls.ComboBox;
using ComboBoxItem = System.Windows.Controls.ComboBoxItem;
using SelectionMode = System.Windows.Controls.SelectionMode;
using ListBox = System.Windows.Controls.ListBox;
using ListBoxItem = System.Windows.Controls.ListBoxItem;
using PasswordBox = System.Windows.Controls.PasswordBox;
using Button = System.Windows.Controls.Button;
using Orientation = System.Windows.Controls.Orientation;
using System.Windows.Threading;
using FlowKey.Shell.Native;
using FlowKey.Shell.Rendering;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace FlowKey.Shell.Windows;

public partial class MainWindow : Window
{
    public const uint HotkeyModifier = MOD_ALT;
    public const uint HotkeyVirtualKey = VK_SPACE;
    public const string HotkeyDisplayName = "Alt+Space";

    private const int HOTKEY_ID = 0x464B;
    private const int SummonHotkeyId = 0x464B;
    private const int WM_HOTKEY = 0x0312;
    private const int WM_CLIPBOARDUPDATE = 0x031D;
    public const int WM_APP_OPEN_SETTINGS = 0x8001;
    private const uint CF_UNICODETEXT = 13;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint VK_SPACE = 0x20;

    private const int SearchDebounceMs = 120;

    // The launcher window is a fixed Raycast-style size; only its position
    // adapts (per summon, to the focused app's monitor).
    private const int RootAppsCap = 6;

    private readonly SidecarHost sidecar;
    private readonly NativeMethodTable nativeMethods = new();
    private readonly MediaSessionService mediaSessions = new();
    private readonly SearchState searchState = new();
    private readonly DispatcherTimer searchDebounce;
    private readonly Queue<(string Message, DateTime At)> toastLog = new();
    private readonly AppLauncherService appLauncher;
    private readonly HttpFetchService httpFetch = new();
    private readonly UpdateService updateService;
    private readonly ClipboardHistoryStore clipboardHistory = new(AppLauncherService.DataDirectory);
    private readonly PreferencesStore preferencesStore = new(AppLauncherService.DataDirectory);
    private readonly TokenVault tokenVault = new(AppLauncherService.DataDirectory);
    private readonly UsageTracker usageTracker = new(AppLauncherService.DataDirectory);
    private readonly FavoritesStore favoritesStore = new(AppLauncherService.DataDirectory);
    private readonly ActionUsageStore actionUsage = new(AppLauncherService.DataDirectory);
    private readonly SecretsStore secretsStore = new(AppLauncherService.DataDirectory);
    private readonly OAuthService oauthService;
    private readonly ImageFetchService imageFetch = new();
    private readonly InstalledExtensionsStore installedExtensionsStore = new(AppLauncherService.DataDirectory);
    private readonly ExtensionStorageStore extensionStorageStore = new(AppLauncherService.DataDirectory);
    private readonly ExtensionCacheStore extensionCacheStore = new(AppLauncherService.DataDirectory);
    private readonly string extensionsRoot;
    private readonly ExtensionFsService extensionFsService = new();
    private readonly ExtensionPackageManager extensionManager;
    private readonly ExtensionPolicy extensionPolicy;
    private readonly string? repoRoot;
    private IReadOnlyList<Protocol.ReadyFailure> readyFailures = Array.Empty<Protocol.ReadyFailure>();
    private List<UiItem> gridItems = new();
    private DetailTree? currentDetail;
    private string? currentDetailExtensionId;
    private int gridColumns;
    private int gridIndex;
    private List<GridCellVm> gridCells = new();
    private IntPtr previousForegroundWindow;
    private long suppressAutoHideUntil;
    private bool allowClose;
    private bool suppressSearchDebounce;
    private HotkeyManager? hotkeyManager;
    private HotkeySettingsStore hotkeySettings = new(AppLauncherService.DataDirectory);
    private SettingsWebViewWindow? settingsWindow;
    private ActionPanel? actionPanel;
    private HudWindow? hudWindow;
    /// <summary>The value the search-bar filter dropdown currently shows.</summary>
    private string? currentFilterValue;
    private ToastWindow? toastWindow;
    private const int CommandHotkeyBase = 0x4B00;
    private readonly Dictionary<int, (string ExtensionId, string CommandId)> commandHotkeyIds = new();
    private bool commandHotkeysRegistered;

    private IReadOnlyList<Protocol.ReadyExtension> readyExtensions = Array.Empty<Protocol.ReadyExtension>();
    private int pendingOperations;
    private DispatcherTimer? loadingBarDelayTimer;
    private System.Windows.Media.Animation.DoubleAnimation? loadingBarAnimation;

    private void BeginOperation()
    {
        var pending = Interlocked.Increment(ref pendingOperations);
        DebugLog.Write("loading bar: begin, pending=" + pending);
        Dispatcher.BeginInvoke(UpdateLoadingBar);
    }

    private void EndOperation()
    {
        var remaining = Interlocked.Decrement(ref pendingOperations);
        DebugLog.Write("loading bar: end, pending=" + remaining);
        if (remaining < 0)
        {
            Interlocked.CompareExchange(ref pendingOperations, 0, remaining);
        }
        Dispatcher.BeginInvoke(UpdateLoadingBar);
    }

    private void UpdateLoadingBar()
    {
        DebugLog.Write("loading bar: update, pending=" + pendingOperations);
        if (pendingOperations > 0)
        {
            if (loadingBarDelayTimer is null)
            {
                loadingBarDelayTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(120) };
                loadingBarDelayTimer.Tick += (_, _) =>
                {
                    loadingBarDelayTimer.Stop();
                    SetLoadingBarVisible(true);
                };
            }
            if (!loadingBarDelayTimer.IsEnabled)
            {
                loadingBarDelayTimer.Start();
            }
        }
        else
        {
            loadingBarDelayTimer?.Stop();
            SetLoadingBarVisible(false);
        }
    }

    private void SetLoadingBarVisible(bool visible)
    {
        if (LoadingBarHost.Visibility == (visible ? Visibility.Visible : Visibility.Collapsed))
        {
            return;
        }
        LoadingBarHost.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        DebugLog.Write("loading bar: visible=" + visible);
        if (visible)
        {
            loadingBarAnimation = new System.Windows.Media.Animation.DoubleAnimation
            {
                From = -180,
                To = Math.Max(400, ActualWidth),
                Duration = new Duration(TimeSpan.FromMilliseconds(1100)),
                RepeatBehavior = System.Windows.Media.Animation.RepeatBehavior.Forever,
            };
            LoadingBarTranslate.BeginAnimation(TranslateTransform.XProperty, loadingBarAnimation);
        }
        else
        {
            LoadingBarTranslate.BeginAnimation(TranslateTransform.XProperty, null);
            LoadingBarTranslate.X = -180;
        }
    }

    public MainWindow()
    {
        InitializeComponent();
        new WindowInteropHelper(this).EnsureHandle();
        foregroundEventCallback = OnForegroundWindowChanged;
        foregroundEventHook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero,
            foregroundEventCallback,
            0,
            0,
            WINEVENT_OUTOFCONTEXT);
        DebugLog.Write("foreground hook installed: " + foregroundEventHook);
        foregroundPollTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        foregroundPollTimer.Tick += (_, _) => CheckForeignForeground();
        foregroundPollTimer.Start();
        searchDebounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(SearchDebounceMs) };
        searchDebounce.Tick += (_, _) =>
        {
            searchDebounce.Stop();
            SendSearch(SearchBox.Text);
        };
        appLauncher = new AppLauncherService();
        appLauncher.SetRebuildDispatcher(Dispatcher);
        appLauncher.CacheUpdated += () => Dispatcher.BeginInvoke(() =>
        {
            if (searchState.Depth == 1 && SearchBox.Text.Length == 0)
            {
                SendSearch("");
            }
        });
        nativeMethods.Register("apps.list", p => ExecuteAppsList(p));
        nativeMethods.Register("apps.launch", p => ExecuteAppsLaunch(p));
        nativeMethods.Register("http.fetch", _ => NativeCallOutcome.Failure("notImplemented", "handled asynchronously"));
        nativeMethods.Register("clipboard.read", p => ExecuteClipboardRead());
        nativeMethods.Register("clipboard.clear", _ => ExecuteClipboardClear());
        nativeMethods.Register("apps.frontmost", _ => ExecuteAppsFrontmost());
        nativeMethods.Register("apps.default", p => ExecuteAppsDefault(p));
        nativeMethods.Register("system.selectedText", p => ExecuteSystemSelectedText(p));
        nativeMethods.Register("shell.open", p => ExecuteShellOpen(p));
        nativeMethods.Register("windows.list", _ => ExecuteWindowsList());
        nativeMethods.Register("windows.focus", p => ExecuteWindowsFocus(p));
        nativeMethods.Register("windows.close", p => ExecuteWindowsClose(p));
        nativeMethods.Register("system.control", p => ExecuteSystemControl(p));
        nativeMethods.Register("clipboard.history", p => ExecuteClipboardHistory(p));
        nativeMethods.Register("clipboard.clearHistory", _ =>
        {
            clipboardHistory.Clear();
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        });
        nativeMethods.Register("clipboard.deleteEntry", p => ExecuteClipboardDelete(p));
        nativeMethods.Register("clipboard.copyEntry", p => ExecuteClipboardCopyEntry(p));
        nativeMethods.Register("clipboard.pasteEntry", p => ExecuteClipboardPasteEntry(p));
        nativeMethods.Register("clipboard.paste", ExecuteClipboardPaste);
        nativeMethods.Register("clipboard.editEntry", p => ExecuteClipboardEditEntry(p));
        nativeMethods.Register("hud.show", p => ExecuteHudShow(p));
        nativeMethods.Register("toast.show", p => ExecuteToastShow(p));
        nativeMethods.Register("alert.confirm", p => ExecuteAlertConfirm(p));
        nativeMethods.Register("media.current", _ => mediaSessions.CurrentOutcome());
        nativeMethods.Register("media.control", ExecuteMediaControl);
        _ = mediaSessions.InitializeAsync();
        updateService = new UpdateService(AppLauncherService.DataDirectory);
        updateService.StatusChanged += status => Dispatcher.BeginInvoke(() => ApplyUpdateStatus(status));
        updateService.StartAutomaticChecks(Dispatcher);
        oauthService = new OAuthService(tokenVault, OAuthProviderRegistry.Load);

        // Installed third-party extensions always live in the app-data
        // directory (never beside the repo/install tree); FLOWKEY_EXTENSIONS_DIR
        // overrides it for tests and CI.
        extensionsRoot = Environment.GetEnvironmentVariable("FLOWKEY_EXTENSIONS_DIR")
            ?? Path.Combine(AppLauncherService.DataDirectory, "extensions");
        Directory.CreateDirectory(extensionsRoot);
        extensionManager = new ExtensionPackageManager(
            extensionsRoot,
            installedExtensionsStore,
            secretsStore,
            tokenVault,
            extensionStorageStore,
            extensionCacheStore,
            Path.Combine(AppLauncherService.DataDirectory, "icon-cache", "images"));
        extensionPolicy = new ExtensionPolicy(() => readyExtensions, installedExtensionsStore);

        var root = FindRepoRoot();
        repoRoot = root;
        var sidecarScript = root is null ? "sidecar/src/main.ts" : Path.Combine(root, "sidecar", "src", "main.ts");
        DebugLog.Write($"shell start; repoRoot={root ?? "<null>"}; extensionsRoot={extensionsRoot}");
        sidecar = new SidecarHost(sidecarScript, extensionsRoot, message => Dispatcher.BeginInvoke(() => SetStatusBar(message)));
        sidecar.DisabledExtensionIds = installedExtensionsStore.GetAll()
            .Where(record => !record.Enabled)
            .Select(record => record.Id)
            .ToList();

        sidecar.Ready += OnSidecarReady;
        sidecar.Ui += OnSidecarUi;
        sidecar.UiPush += OnSidecarUiPush;
        sidecar.WindowCommand += OnSidecarWindowCommand;
        sidecar.LaunchCommand += OnSidecarLaunchCommand;
        sidecar.WebView += OnSidecarWebView;
        sidecar.WebResult += OnSidecarWebResult;
        sidecar.Ack += OnSidecarAck;
        sidecar.Error += OnSidecarError;
        sidecar.Log += m => Dispatcher.BeginInvoke(() => SetStatusBar(m.Message));
        sidecar.NativeCallRequested += OnNativeCallRequested;
        sidecar.SidecarCrashed += message => Dispatcher.BeginInvoke(() => ShowToast(message));
        sidecar.Fatal += message => Dispatcher.BeginInvoke(() =>
        {
            ShowToast(message);
            SetStatusBar(message);
        });

        if (root is not null)
        {
            sidecar.PreferencesProvider = extensionId =>
            {
                if (extensionId == "*")
                {
                    var all = new Dictionary<string, Dictionary<string, System.Text.Json.JsonElement>>(StringComparer.Ordinal);
                    foreach (var (id, slice) in preferencesStore.AllSlices())
                    {
                        all[id] = slice;
                    }
                    return all;
                }
                var schema = readyExtensions.FirstOrDefault(e => e.Id == extensionId)?.Preferences
                    ?? (IReadOnlyList<Protocol.PreferenceSchema>)Array.Empty<Protocol.PreferenceSchema>();
                var single = new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal);
                foreach (var pair in preferencesStore.Slice(extensionId, schema))
                {
                    single[pair.Key] = pair.Value;
                }
                return new Dictionary<string, Dictionary<string, System.Text.Json.JsonElement>>(StringComparer.Ordinal)
                {
                    [extensionId] = single,
                };
            };
            sidecar.Start();
        }
        else
        {
            Dispatcher.BeginInvoke(() => ShowToast("sidecar folder not found: run from the flowkey-native tree"));
        }
    }

    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "flowkey-native", "contract", "ui-tree.fixture.json")))
            {
                return Path.Combine(dir.FullName, "flowkey-native");
            }
            dir = dir.Parent!;
        }
        return null;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (searchState.CurrentRows.Count == 0)
        {
            UpdateEmptyView("FlowKey", "Type to search, or press Escape to hide");
        }
        if (footerWebViewHost is null)
        {
            _ = InitializeFooterChromeAsync();
        }
    }

    private void OnSourceInitialized(object sender, EventArgs e)
    {
        var source = HwndSource.FromHwnd(Handle);
        source?.AddHook(WndProc);
        Native.DwmChrome.Apply(source!);
        if (!AddClipboardFormatListener(Handle))
        {
            DebugLog.Write("AddClipboardFormatListener failed: " + Marshal.GetLastWin32Error());
        }
        hotkeyManager = new HotkeyManager(DispatchGlobalHotkey, m => DebugLog.Write(m));
        hotkeyManager.Start();
        var hotkeySettingsLoaded = hotkeySettings.Load();
        if (!hotkeyManager.Register(SummonHotkeyId, hotkeySettingsLoaded.Modifier, hotkeySettingsLoaded.VirtualKey))
        {
            ShowToast("Failed to register global hotkey — another app may own it. Open Settings to pick a new one.");
            DebugLog.Write("RegisterHotKey failed");
        }
        else
        {
            DebugLog.Write("RegisterHotKey ok");
        }
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!allowClose)
        {
            e.Cancel = true;
            HideWindow();
            return;
        }
        base.OnClosing(e);
    }

    protected override void OnClosed(EventArgs e)
    {
        hotkeyManager?.Unregister(SummonHotkeyId);
        UnregisterCommandHotkeys();
        hotkeyManager?.Dispose();
        sidecar.Dispose();
        base.OnClosed(e);
    }

    private bool ApplySummonHotkey(uint modifier, uint virtualKey)
    {
        if (hotkeyManager is null)
        {
            return false;
        }
        const int trialId = SummonHotkeyId + 1000;
        if (!hotkeyManager.Register(trialId, modifier, virtualKey))
        {
            hotkeyManager.Unregister(trialId);
            return false;
        }
        hotkeyManager.Unregister(trialId);
        hotkeyManager.Unregister(SummonHotkeyId);
        var ok = hotkeyManager.Register(SummonHotkeyId, modifier, virtualKey);
        DebugLog.Write("hotkey swap ok=" + ok);
        return ok;
    }

    private void OnUpdateBannerClick(object sender, MouseButtonEventArgs e)
    {
        if (updateService.Status.Phase == UpdatePhase.Available)
        {
            _ = updateService.DownloadAndApplyAsync();
        }
    }

    private void ApplyUpdateStatus(UpdateStatus status)
    {
        UpdateBannerHost.Visibility = status.ShowBanner ? Visibility.Visible : Visibility.Collapsed;
        switch (status.Phase)
        {
            case UpdatePhase.Available:
                UpdateBannerTitle.Text = "New Update Available";
                UpdateBannerDetail.Text = status.NewVersion is null ? null : $"Version {status.NewVersion} is ready to install";
                UpdateBannerAction.Text = "Install Update";
                break;
            case UpdatePhase.Downloading:
                UpdateBannerTitle.Text = "Downloading Update…";
                UpdateBannerDetail.Text = status.NewVersion is null ? null : $"Version {status.NewVersion}";
                UpdateBannerAction.Text = status.ProgressPercent is { } percent ? $"{percent}%" : "…";
                break;
            case UpdatePhase.Ready:
                UpdateBannerTitle.Text = "Update Ready";
                UpdateBannerDetail.Text = "FlowKey will restart to install the update";
                UpdateBannerAction.Text = "Restart";
                break;
            case UpdatePhase.Error:
                ShowToast("Update failed: " + status.Message);
                break;
        }
    }

    public void OpenSettings()
    {        try
        {
            OpenSettingsCore();
        }
        catch (Exception ex)
        {
            DebugLog.Write("OpenSettings failed: " + ex);
            ShowToast("Settings failed to open: " + ex.Message);
        }
    }

    private void OpenSettingsCore()
    {
        DebugLog.Write("OpenSettingsCore entered, hotkeyManager=" + (hotkeyManager is not null));
        if (hotkeyManager is null)
        {
            return;
        }
        // one settings window at a time: re-opening focuses the existing one
        if (settingsWindow is { IsLoaded: true })
        {
            if (settingsWindow.WindowState == WindowState.Minimized)
            {
                settingsWindow.WindowState = WindowState.Normal;
            }
            settingsWindow.Activate();
            return;
        }
        settingsWindow = new SettingsWebViewWindow(
            hotkeyManager,
            hotkeySettings,
            preferencesStore,
            readyExtensions,
            extensionManager,
            readyFailures,
            RequestExtensionsRefresh,
            RestartApplication,
            AssetsDirResolver,
            oauthService,
            updateService,
            () => clipboardHistory.Clear(),
            ShowToast,
            ApplySummonHotkey);
        settingsWindow.PreferencesChanged += (extensionId, values) => sidecar.SendPreferences(extensionId, values);
        settingsWindow.CommandShortcutChanged += (commandKey, combo) =>
        {
            var settings = hotkeySettings.Load();
            if (combo is null)
            {
                settings.CommandShortcuts.Remove(commandKey);
            }
            else
            {
                settings.CommandShortcuts[commandKey] = combo;
            }
            hotkeySettings.Save(settings);
            RegisterCommandHotkeys();
        };
        settingsWindow.CommandToggled += (_, _, _) => RegisterCommandHotkeys();
        settingsWindow.ShortcutConflict = combo =>
        {
            var settings = hotkeySettings.Load();
            return TryParseCombo(combo, out var modifier, out var virtualKey)
                && settings.Modifier == modifier && settings.VirtualKey == virtualKey;
        };
        settingsWindow.SuspendGlobalHotkeys = () =>
        {
            hotkeyManager?.Unregister(SummonHotkeyId);
            UnregisterCommandHotkeys();
            DebugLog.Write("global hotkeys suspended");
        };
        settingsWindow.RestoreGlobalHotkeys = () =>
        {
            var settings = hotkeySettings.Load();
            hotkeyManager?.Register(SummonHotkeyId, settings.Modifier, settings.VirtualKey);
            RegisterCommandHotkeys();
            DebugLog.Write("global hotkeys restored");
        };
        settingsWindow.Closed += (_, _) =>
        {
            DebugLog.Write("settings window closed");
            settingsWindow = null;
        };
        settingsWindow.Show();
        DebugLog.Write("settings shown, visibility=" + settingsWindow.Visibility + " loaded=" + settingsWindow.IsLoaded);
        settingsWindow.Activate();
        DebugLog.Write("settings activated");
    }

    /// <summary>
    /// Applies an extensions-store change: restarts the sidecar so the new
    /// set of extensions loads, then reopens settings so the lists refresh.
    /// </summary>
    /// <summary>
    /// Full-process restart, used after an extension install: the sidecar, the
    /// extension registry and every mounted web view rebuild from a clean boot
    /// instead of restarting the sidecar under a live session.
    /// </summary>
    private void RestartApplication()
    {
        var exePath = Environment.ProcessPath;
        Dispatcher.BeginInvoke(() =>
        {
            (System.Windows.Application.Current as App)?.ReleaseSingleInstanceMutex();
            if (!string.IsNullOrWhiteSpace(exePath))
            {
                try
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = exePath,
                        Arguments = "--settings",
                        UseShellExecute = true,
                    });
                }
                catch (Exception ex)
                {
                    DebugLog.Write("app restart: failed to spawn a new instance: " + ex.Message);
                }
            }
            Quit();
            // ShutdownMode is OnExplicitShutdown: closing the main window alone
            // leaves the settings window (and the process) running, so end the
            // app explicitly — the same path the tray Quit uses.
            Dispatcher.BeginInvoke(
                new Action(() => System.Windows.Application.Current.Shutdown()),
                System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        });
    }

    private void RequestExtensionsRefresh()
    {
        sidecar.DisabledExtensionIds = installedExtensionsStore.GetAll()
            .Where(record => !record.Enabled)
            .Select(record => record.Id)
            .ToList();
        // The sidecar restart reloads installed extensions; the open settings
        // window is refreshed by OnSidecarReady once the new registry arrives.
        Dispatcher.BeginInvoke(sidecar.Restart);
    }

    protected override void OnDeactivated(EventArgs e)
    {
        if (settingsWindow is { IsLoaded: true })
        {
            return;
        }
        if (actionPanel is { IsVisible: true })
        {
            return;
        }
        HideWindow();
    }

    public void Quit()
    {
        allowClose = true;
        Close();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_APP_OPEN_SETTINGS)
        {
            OpenSettings();
            handled = true;
            return IntPtr.Zero;
        }
        if (msg == WM_CLIPBOARDUPDATE)
        {
            var capture = ClipboardReader.TryCapture();
            DebugLog.Write($"clipboard update text={capture?.Text is not null} image={capture?.HasImage} source={capture?.SourceApp}");
            // Test runners write fixture strings to the real clipboard during
            // test runs; recording them would pollute the history with data
            // the user never copied.
            if (capture is null || !ClipboardCapturePolicy.ShouldRecord(capture.SourceApp))
            {
                handled = true;
                return IntPtr.Zero;
            }
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var recorded = false;
            if (capture is not null && capture.Text is not null)
            {
                clipboardHistory.Record(capture.Text, timestamp, capture.SourceApp, capture.SourceIconUri);
                recorded = true;
            }
            else if (capture is { HasFiles: true })
            {
                try
                {
                    var files = System.Windows.Forms.Clipboard.GetFileDropList();
                    var paths = files.Cast<string>().ToList();
                    if (paths.Count > 0)
                    {
                        clipboardHistory.RecordFiles(paths, timestamp, capture.SourceApp, capture.SourceIconUri);
                        recorded = true;
                    }
                }
                catch (Exception ex)
                {
                    DebugLog.Write("clipboard file capture failed: " + ex.Message);
                }
            }
            else if (capture is { HasImage: true })
            {
                try
                {
                    using var image = System.Windows.Forms.Clipboard.GetImage();
                    if (image is not null)
                    {
                        clipboardHistory.RecordImage(image, timestamp, capture.SourceApp, capture.SourceIconUri);
                        recorded = true;
                    }
                }
                catch (Exception ex)
                {
                    DebugLog.Write("clipboard image capture failed: " + ex.Message);
                }
            }
            // a mounted clipboard page re-queries when the history changes, so
            // new copies show up without reopening the command
            if (recorded && webViewVisible)
            {
                webViewHost?.PostPageAction("clipboardChanged");
            }
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void ToggleVisibility()
    {
        DebugLog.Write($"toggle visibility: IsVisible={IsVisible}");
        if (IsVisible)
        {
            HideWindow();
        }
        else
        {
            Summon();
        }
    }

    public void Summon()
    {
        previousForegroundWindow = GetForegroundWindow();
        suppressAutoHideUntil = Environment.TickCount64 + 400;
        CancelWebviewTeardown();
        PlaceLauncherOnMonitor(previousForegroundWindow);
        if (footerWebViewHost is null && WebViewHost.RuntimeAvailable())
        {
            // re-create the footer chrome after an idle teardown; the native
            // pills cover the gap until the page reports ready
            _ = InitializeFooterChromeAsync();
        }
        Show();
        Activate();
        ForceForeground();
        if (GetForegroundWindow() != Handle)
        {
            // Activation can lose a race right after the show (foreground
            // locks, freshly-restored focus); one bounded retry keeps a
            // single hotkey press reliable instead of needing a second one.
            ForceForeground();
        }
        if ((object)SearchBox as System.Windows.Controls.TextBox is { } searchTextBox)
        {
            searchTextBox.Focus();
            searchTextBox.SelectAll();
        }
        InvalidateVisual();
        // Pre-warm the last web command once everything has settled, so
        // re-entering it is instant (the idle discard releases it if unused).
        Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, new Action(PreWarmLastWebCommand));
        DebugLog.Write("summoned");
    }


    /// <summary>
    /// Raycast behavior: the launcher always appears centered on the monitor
    /// the user is working on. DWM/DIP conversion via <see cref="MonitorInfo"/>.
    /// </summary>
    private void PlaceLauncherOnMonitor(IntPtr otherWindow)
    {
        var monitor = Native.MonitorInfo.FromWindow(otherWindow != IntPtr.Zero ? otherWindow : Handle)
            ?? Native.MonitorInfo.FromWindow(Handle);
        if (monitor is null)
        {
            return;
        }
        var width = ActualWidth > 0 ? ActualWidth : Width;
        var height = ActualHeight > 0 ? ActualHeight : Height;
        var size = new System.Windows.Size(width, height);
        var (left, top) = WindowPlacement.CenterInWorkArea(monitor.WorkArea, size);
        (Left, Top) = WindowPlacement.ClampToWorkArea(monitor.WorkArea, left, top, size);
    }

    private void ForceForeground()
    {
        var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var currentThread = GetCurrentThreadId();
        if (foregroundThread != 0 && foregroundThread != currentThread)
        {
            AttachThreadInput(currentThread, foregroundThread, true);
            SetForegroundWindow(Handle);
            BringWindowToTop(Handle);
            AttachThreadInput(currentThread, foregroundThread, false);
        }
        else
        {
            SetForegroundWindow(Handle);
            BringWindowToTop(Handle);
        }
    }

    public void HideWindow()
    {
        try
        {
            actionPanel?.Close();
            var previous = previousForegroundWindow;
            var foreground = GetForegroundWindow();
            Hide();
            // Nothing is on screen once hidden — after a grace period the
            // whole WebView2 tree is disposed and its memory returns to the
            // system (see ScheduleWebviewTeardown).
            ScheduleWebviewTeardown();
            // Only restore the pre-summon app when this window still owns the
            // foreground (escape / hotkey toggle). If the user already clicked
            // into another app, that app owns the foreground — yanking the
            // stale one back steals focus and breaks the next summon's
            // activation.
            if (foreground == Handle && previous != IntPtr.Zero && previous != Handle && IsWindow(previous))
            {
                SetForegroundWindow(previous);
            }
        }
        catch (InvalidOperationException ex)
        {
            DebugLog.Write("HideWindow lost a race with window close: " + ex.Message);
        }
    }

    /// <summary>
    /// While the launcher sits hidden, both WebView2 surfaces are disposed so
    /// the whole Chromium tree exits and its memory returns to the system.
    /// The native footer pills (visually identical) cover the gap; both hosts
    /// are recreated on the next summon or web mount.
    /// </summary>
    private void ScheduleWebviewTeardown()
    {
        var runtime = WebViewHost.RuntimeAvailable();
        DebugLog.Write(
            $"ScheduleWebviewTeardown enter: runtime={runtime} "
            + $"shellHost={webViewHost is not null} footerHost={footerWebViewHost is not null}");
        if (!WebViewHost.RuntimeAvailable() || (webViewHost is null && footerWebViewHost is null))
        {
            return;
        }
        webviewTeardownTimer ??= new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(WebviewTeardownAfterHiddenSeconds),
        };
        webviewTeardownTimer.Tick -= TeardownWebviews;
        webviewTeardownTimer.Tick += TeardownWebviews;
        webviewTeardownTimer.Stop();
        webviewTeardownTimer.Start();
        DebugLog.Write("webview teardown scheduled");
    }

    private void CancelWebviewTeardown() => webviewTeardownTimer?.Stop();

    private void TeardownWebviews(object? sender, EventArgs e)
    {
        webviewTeardownTimer?.Stop();
        if (IsVisible)
        {
            return; // the launcher came back while the timer was pending
        }
        webViewVisible = false;
        webViewState = null;
        // a fresh-mount loading bar that never ended (page crashed before its
        // first report) must not leak a pending operation
        if (webviewLoadPending)
        {
            webviewLoadPending = false;
            EndOperation();
        }
        webViewHost?.Dispose();
        webViewHost = null;
        WebViewContainer.Children.Clear();
        WebViewSurface.Visibility = Visibility.Collapsed;
        footerWebViewHost?.Dispose();
        footerWebViewHost = null;
        footerWebViewReady = false;
        FooterWebViewContainer.Children.Clear();
        FooterWebViewContainer.Visibility = Visibility.Collapsed;
        FooterNativeContent.Visibility = Visibility.Visible;
        UpdateFilterDropdown(null);
        // The disposed page belonged to the restored command level — that view
        // is gone, so return the shell to the root. Without this, the next
        // summon renders neither the page nor the root rows: an empty screen.
        while (searchState.Depth > 1 && searchState.Pop())
        {
        }
        var display = BuildDisplayRows();
        LoadRowIcons(display);
        ApplyRows(display, null);
        UpdateChrome();
        // The WebView2 browser process stays connected until the environment
        // objects are finalized — collect explicitly so the memory actually
        // returns while the launcher sits hidden.
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        DebugLog.Write("webviews disposed after idle hide");
    }

    private IntPtr Handle => new WindowInteropHelper(this).Handle;

    private void OnForegroundWindowChanged(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => OnForegroundWindowChanged(hook, evt, hwnd, idObject, idChild, thread, time));
            return;
        }
        CheckForeignForeground();
    }

    private void CheckForeignForeground()
    {
        if (!IsVisible || Environment.TickCount64 < suppressAutoHideUntil)
        {
            return;
        }
        var hwnd = GetForegroundWindow();
        if (hwnd == Handle)
        {
            return;
        }
        GetWindowThreadProcessId(hwnd, out var foregroundPid);
        if (foregroundPid != 0 && foregroundPid == (uint)Environment.ProcessId)
        {
            return;
        }
        DebugLog.Write("foreground moved to another process — hiding");
        HideWindow();
    }

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        if (suppressSearchDebounce)
        {
            return;
        }
        searchDebounce.Stop();
        searchDebounce.Start();
    }

    private void SetSearchBoxSilently(string text)
    {
        suppressSearchDebounce = true;
        try
        {
            SearchBox.Text = text;
        }
        finally
        {
            suppressSearchDebounce = false;
        }
    }

    private void DispatchGlobalHotkey(int id)
    {
        DebugLog.Write("WM_HOTKEY id=0x" + id.ToString("X"));
        if (id == SummonHotkeyId)
        {
            Dispatcher.BeginInvoke(() => ToggleVisibility());
            return;
        }
        if (id >= CommandHotkeyBase && commandHotkeyIds.TryGetValue(id, out var commandRef))
        {
            Dispatcher.BeginInvoke(() => RunCommandFromShortcut(commandRef.ExtensionId, commandRef.CommandId));
        }
    }

    private void OnWindowPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (!IsVisible)
        {
            return;
        }
        if (webViewVisible)
        {
            if (webViewHost is not null && webViewHost.ContainsKeyboardFocus)
            {
                // The web page owns keyboard interactions (list navigation,
                // enter, ctrl+k palette, escape back-stack) while it has focus.
                return;
            }
            // Focus sits in the launcher search box: forward chrome-level
            // interactions into the page, mirroring the tree-view shortcuts.
            // Home/End stay with the text box (caret movement); the page owns
            // its own Home/End while it holds focus.
            switch (e.Key)
            {
                case Key.Down:
                    PostWebViewPageAction("moveDown");
                    e.Handled = true;
                    break;
                case Key.Up:
                    PostWebViewPageAction("moveUp");
                    e.Handled = true;
                    break;
                case Key.PageDown:
                    PostWebViewPageAction("pageDown");
                    e.Handled = true;
                    break;
                case Key.PageUp:
                    PostWebViewPageAction("pageUp");
                    e.Handled = true;
                    break;
                case Key.Enter:
                    PostWebViewPageAction("primary");
                    e.Handled = true;
                    break;
                case Key.K when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                    OpenWebViewActionPanel();
                    e.Handled = true;
                    break;
                case Key.Escape:
                    if (webViewState?.CanGoBack == true)
                    {
                        PostWebViewPageAction("goBack");
                    }
                    else
                    {
                        PerformEscape();
                    }
                    e.Handled = true;
                    break;
            }
            return;
        }
        if (GridHostPanel.Visibility == Visibility.Visible)
        {
            if (HandleGridKeys(e))
            {
                e.Handled = true;
            }
            return;
        }
        if (DetailHost.Visibility == Visibility.Visible)
        {
            if (HandleDetailKeys(e))
            {
                e.Handled = true;
            }
            return;
        }
        HandleListKeys(e);
    }

    private void HandleListKeys(KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Down:
                MoveSelection(1);
                e.Handled = true;
                break;
            case Key.Up:
                MoveSelection(-1);
                e.Handled = true;
                break;
            case Key.PageDown:
                MoveSelectionPage(1);
                e.Handled = true;
                break;
            case Key.PageUp:
                MoveSelectionPage(-1);
                e.Handled = true;
                break;
            case Key.Home when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                MoveSelectionEdge(-1);
                e.Handled = true;
                break;
            case Key.End when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                MoveSelectionEdge(1);
                e.Handled = true;
                break;
            case Key.Enter:
                RunPrimaryAction();
                e.Handled = true;
                break;
            case Key.D1 or Key.D2 or Key.D3 or Key.D4 or Key.D5 or Key.D6 or Key.D7 or Key.D8 or Key.D9
                when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                RunNthResult((int)e.Key - (int)Key.D1);
                e.Handled = true;
                break;
            case Key.NumPad1 or Key.NumPad2 or Key.NumPad3 or Key.NumPad4 or Key.NumPad5
                or Key.NumPad6 or Key.NumPad7 or Key.NumPad8 or Key.NumPad9
                when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                RunNthResult((int)e.Key - (int)Key.NumPad1);
                e.Handled = true;
                break;
            case Key.K when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenActionPanelForSelection();
                e.Handled = true;
                break;
            case Key.OemComma when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenSettings();
                e.Handled = true;
                break;
            case Key.Escape:
                PerformEscape();
                e.Handled = true;
                break;
            default:
                // Extension-declared action shortcuts run from the focused
                // view; plain text keys never reach here (chrome keys win).
                if (TryRunActionShortcut(e))
                {
                    e.Handled = true;
                }
                break;
        }
    }

    private void MoveSelection(int delta)
    {
        var list = ResultsList;
        if (list.Items.Count == 0)
        {
            return;
        }
        var index = list.SelectedIndex;
        do
        {
            index += delta;
            if (index < 0 || index >= list.Items.Count)
            {
                return;
            }
        }
        while (list.Items[index] is not ItemRow);
        list.SelectedIndex = index;
        list.ScrollIntoView(list.Items[index]);
    }

    /// <summary>Page-sized selection jumps for PageUp/PageDown.</summary>
    private void MoveSelectionPage(int direction)
    {
        var rowHeight = (double)FindResource("RowMinHeight");
        var viewport = ResultsList.ActualHeight > 0 ? ResultsList.ActualHeight : ActualHeight - (double)FindResource("SearchBarHeight") - (double)FindResource("FooterHeight");
        var pageSize = Math.Max(1, (int)(viewport / rowHeight) - 1);
        MoveSelection(direction * pageSize);
    }

    /// <summary>Ctrl+Home / Ctrl+End — jump to the first / last result.</summary>
    private void MoveSelectionEdge(int direction)
    {
        if (direction < 0)
        {
            for (var i = 0; i < ResultsList.Items.Count; i++)
            {
                if (ResultsList.Items[i] is ItemRow)
                {
                    ResultsList.SelectedIndex = i;
                    ResultsList.ScrollIntoView(ResultsList.Items[i]);
                    return;
                }
            }
            return;
        }
        for (var i = ResultsList.Items.Count - 1; i >= 0; i--)
        {
            if (ResultsList.Items[i] is ItemRow)
            {
                ResultsList.SelectedIndex = i;
                ResultsList.ScrollIntoView(ResultsList.Items[i]);
                return;
            }
        }
    }

    /// <summary>Ctrl+1..9 — run the nth visible result, Raycast-style.</summary>
    private void RunNthResult(int zeroBased)
    {
        var count = 0;
        foreach (var item in ResultsList.Items)
        {
            if (item is not ItemRow)
            {
                continue;
            }
            if (count == zeroBased)
            {
                ResultsList.SelectedIndex = ResultsList.Items.IndexOf(item);
                ResultsList.ScrollIntoView(item);
                RunPrimaryAction();
                return;
            }
            count++;
        }
    }

    private void OnFooterDragMove(object sender, MouseButtonEventArgs e)
    {
        // Only drags that start on the footer background itself; clicks landing on
        // interactive children (settings button, keycaps) must reach their handlers.
        if (!ReferenceEquals(e.OriginalSource, sender))
        {
            return;
        }
        if (e.ButtonState == MouseButtonState.Pressed && WindowState == WindowState.Normal)
        {
            try
            {
                DragMove();
            }
            catch (InvalidOperationException)
            {
                /* drag can race with a pending click; harmless */
            }
        }
    }

    private void OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ResultsList.SelectedItem is HeaderRow)
        {
            // Section headers are not actionable: a mouse click lands on the next
            // item row instead (keyboard navigation already skips headers).
            var index = ResultsList.Items.IndexOf(ResultsList.SelectedItem);
            for (var i = index + 1; i < ResultsList.Items.Count; i++)
            {
                if (ResultsList.Items[i] is ItemRow)
                {
                    ResultsList.SelectedIndex = i;
                    return;
                }
            }
            for (var i = index - 1; i >= 0; i--)
            {
                if (ResultsList.Items[i] is ItemRow)
                {
                    ResultsList.SelectedIndex = i;
                    return;
                }
            }
            ResultsList.SelectedIndex = -1;
            return;
        }
        UpdateChrome();
        UpdatePane();
    }

    private void UpdateChrome()
    {
        var insideCommand = searchState.Depth > 1;
        BackButton.Visibility = insideCommand ? Visibility.Visible : Visibility.Collapsed;
        // The FlowKey logo identifies the root input only; inside a command
        // the back button takes the leading slot instead.
        SearchBrandIcon.Visibility = insideCommand ? Visibility.Collapsed : Visibility.Visible;
        UpdateFooter();
    }

    private void UpdateFooter()
    {
        var state = BuildFooterState();
        if (footerWebViewReady && footerWebViewHost is not null)
        {
            footerWebViewHost.PostState(FooterProtocol.SerializeState(state));
            return;
        }
        ApplyFooterStateToNative(state);
    }

    private FooterState BuildFooterState()
    {
        var top = searchState.Top;
        ReadyExtension? readyExtension = null;
        FooterExtensionInfo? topExtension = null;
        string? commandIcon = null;
        string? commandColor = null;
        if (top?.ExtensionId is not null)
        {
            readyExtension = readyExtensions.FirstOrDefault(e => e.Id == top.ExtensionId);
            if (readyExtension is not null)
            {
                topExtension = new FooterExtensionInfo(
                    readyExtension.Id,
                    readyExtension.Name,
                    readyExtension.Commands.ToDictionary(c => c.Id, c => c.Title));
                if (top?.CommandId is not null)
                {
                    var command = readyExtension.Commands.FirstOrDefault(c => c.Id == top.CommandId);
                    commandIcon = command?.Icon;
                    commandColor = command?.IconColor;
                }
            }
        }
        return FooterStateBuilder.Build(new FooterInput(
            webViewVisible,
            webViewState,
            searchState.Depth,
            top?.ExtensionId,
            topExtension,
            top?.CommandId,
            FooterIconFor(readyExtension, commandIcon, commandColor),
            SelectedPrimaryActionTitle(),
            SelectedItemTitleForFooter(),
            footerToast));
    }

    /// <summary>Rasterizes (and caches) the extension icon into a payload the footer surface can render.</summary>
    private FooterIconState? FooterIconFor(ReadyExtension? extension, string? commandIcon, string? commandColor)
    {
        if (extension is null)
        {
            return null;
        }
        var key = string.Join('|', extension.Id, extension.Icon ?? "", commandIcon ?? "", commandColor ?? "");
        if (footerIconCache.TryGetValue(key, out var cached))
        {
            return cached;
        }
        var icon = Rendering.FooterIconRenderer.FromElement(CreateFooterIconElement(extension, commandIcon, commandColor));
        if (icon is not null)
        {
            footerIconCache[key] = icon;
        }
        return icon;
    }

    /// <summary>
    /// The footer icon skips tiled images: brand logos render as-is (they are
    /// logos, not tiles), then the command's Lucide glyph straight and tinted
    /// with its declared color, and only then the shipped image as fallback.
    /// </summary>
    private FrameworkElement? CreateFooterIconElement(ReadyExtension? extension, string? commandIcon, string? commandColor)
    {
        if (extension is null)
        {
            return null;
        }
        FrameworkElement BrandImage(System.Windows.Media.ImageSource source)
        {
            var image = new System.Windows.Controls.Image
            {
                Source = source,
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        if (Rendering.BrandIcons.TryGetDrawing(extension.Id, out var brandDrawing))
        {
            return BrandImage(brandDrawing);
        }
        if (Rendering.BrandIcons.TryGet(extension.Id, out var brandGeometry, out var brandBrush))
        {
            return BrandImage(new System.Windows.Media.DrawingImage(
                new System.Windows.Media.GeometryDrawing { Geometry = brandGeometry, Brush = brandBrush }));
        }
        if (Rendering.BrandIcons.TryGetBitmap(extension.Id, out var brandBitmap))
        {
            return BrandImage(brandBitmap);
        }
        var iconName = string.IsNullOrWhiteSpace(commandIcon) ? extension.Icon : commandIcon;
        if (!string.IsNullOrWhiteSpace(iconName) && Rendering.LucideIcon.Load(iconName) is { } glyph)
        {
            var tint = Rendering.LucideIcon.ColorFromHex(
                string.IsNullOrWhiteSpace(commandColor) ? null : commandColor,
                (System.Windows.Media.Brush)FindResource("TextSecondaryBrush"));
            return BrandImage(new System.Windows.Media.DrawingImage(
                new System.Windows.Media.GeometryDrawing { Geometry = glyph, Brush = tint }));
        }
        if (LoadExtensionImageIcon(extension.Id, extension.Icon, extension.Icon) is { } image)
        {
            return BrandImage(image);
        }
        return CreateEmojiIcon(extension.Icon);
    }

    /// <summary>
    /// Native fallback renderer for the footer state — used until the WebView
    /// footer page reports ready, and permanently when WebView2 is unavailable.
    /// </summary>
    private void ApplyFooterStateToNative(FooterState state)
    {
        FooterLeft.Content = state.Left.Kind == "command"
            ? BuildNativeCommandIdentity(state.Left)
            : BuildNativeSettingsButton();
        // The gear-only pill gets symmetric padding so the button sits centered.
        FooterLeftPill.Padding = state.Left.Kind == "command"
            ? (System.Windows.Thickness)FindResource("FooterPillPadding")
            : (System.Windows.Thickness)FindResource("FooterPillIconPadding");
        // The right pill only exists while it has something to say.
        FooterRightPill.Visibility =
            state.PrimaryTitle is not null || state.ShowActionsHint ? Visibility.Visible : Visibility.Collapsed;
        FooterPrimaryAction.Text = state.PrimaryTitle ?? "";
        FooterPrimaryAction.Visibility =
            state.PrimaryTitle is null ? Visibility.Collapsed : Visibility.Visible;
        FooterEnterKeycap.Visibility =
            state.PrimaryTitle is null ? Visibility.Collapsed : Visibility.Visible;
        FooterActionsHint.Visibility = state.ShowActionsHint ? Visibility.Visible : Visibility.Collapsed;
        ApplyFooterToastToNative(state.Toast);
    }

    private FrameworkElement BuildNativeCommandIdentity(FooterLeftState left)
    {
        var panel = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal };
        if (Rendering.FooterIconRenderer.ToNativeElement(left.Icon, key => TryFindResource(key)) is { } icon)
        {
            icon.Margin = new Thickness(
                0,
                0,
                (double)FindResource("FooterIconGap"),
                0);
            panel.Children.Add(icon);
        }
        var name = new TextBlock
        {
            Text = left.Title ?? "",
            VerticalAlignment = VerticalAlignment.Center,
            FontWeight = FontWeights.SemiBold,
        };
        name.SetResourceReference(TextBlock.FontSizeProperty, "FooterFontSize");
        name.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
        name.SetResourceReference(FrameworkElement.MarginProperty, "IconMargin");
        panel.Children.Add(name);
        return panel;
    }

    private FrameworkElement BuildNativeSettingsButton()
    {
        var settingsButton = new System.Windows.Controls.Border
        {
            Background = System.Windows.Media.Brushes.Transparent,
            Padding = new Thickness(2, 2, 2, 2),
            Cursor = System.Windows.Input.Cursors.Hand,
            ToolTip = "Settings",
            VerticalAlignment = VerticalAlignment.Center,
        };
        var glyph = new TextBlock { Text = "\uE700", VerticalAlignment = VerticalAlignment.Center };
        glyph.SetResourceReference(TextBlock.FontFamilyProperty, "GlyphFontFamily");
        glyph.SetResourceReference(TextBlock.FontSizeProperty, "GlyphFontSize");
        glyph.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
        settingsButton.Child = glyph;
        settingsButton.MouseLeftButtonUp += (_, _) => OpenSettings();
        return settingsButton;
    }

    private void ApplyFooterToastToNative(FooterToastState? toast)
    {
        if (toast is null)
        {
            FooterToastHost.Visibility = Visibility.Collapsed;
            FooterLeft.Visibility = Visibility.Visible;
            return;
        }
        FooterToastTitle.Text = toast.Title;
        FooterToastDetail.Text = toast.Detail ?? "";
        FooterToastDetail.Visibility = string.IsNullOrEmpty(toast.Detail) ? Visibility.Collapsed : Visibility.Visible;
        FooterToastDot.Visibility = toast.IsError ? Visibility.Visible : Visibility.Collapsed;
        FooterToastHost.Background = toast.IsError
            ? (System.Windows.Media.Brush)FindResource("FooterToastErrorBrush")
            : (System.Windows.Media.Brush)FindResource("ActionPanelBackgroundBrush");
        FooterToastHost.Visibility = Visibility.Visible;
        FooterLeft.Visibility = Visibility.Collapsed;
    }

    /// <summary>
    /// Mounts the WebView-rendered footer chrome (same pipeline as web
    /// extensions: host page on app.flowkey.local, theme CSS, postMessage
    /// state). Until the page reports ready — and permanently when the
    /// WebView2 runtime is missing — the native XAML footer keeps rendering.
    /// </summary>
    private async Task InitializeFooterChromeAsync()
    {
        if (!WebViewHost.RuntimeAvailable())
        {
            DebugLog.Write("footer: WebView2 runtime missing, keeping native footer");
            return;
        }
        try
        {
            footerWebViewHost = new FooterWebViewHost(FooterWebViewContainer);
            footerWebViewHost.Ready += OnFooterWebViewReady;
            footerWebViewHost.Failed += OnFooterWebViewFailed;
            footerWebViewHost.ActionRequested += OnFooterWebViewAction;
            footerWebViewHost.LogEmitted += message => DebugLog.Write("footer page: " + message);
            footerWebViewHost.SetThemeCss(FooterTheme.BuildCss(key => TryFindResource(key)));
            await footerWebViewHost.InitializeAsync();
        }
        catch (Exception ex)
        {
            DebugLog.Write("footer chrome init failed: " + ex);
        }
    }

    private void OnFooterWebViewReady()
    {
        footerWebViewReady = true;
        FooterWebViewContainer.Visibility = Visibility.Visible;
        FooterNativeContent.Visibility = Visibility.Collapsed;
        UpdateFooter();
    }

    private void OnFooterWebViewFailed(string message)
    {
        DebugLog.Write("footer webview failed: " + message);
        if (!footerWebViewReady)
        {
            return;
        }
        footerWebViewReady = false;
        FooterWebViewContainer.Visibility = Visibility.Collapsed;
        FooterNativeContent.Visibility = Visibility.Visible;
        UpdateFooter();
    }

    private void OnFooterWebViewAction(string action)
    {
        if (action == "settings")
        {
            OpenSettings();
        }
    }

    private string? SelectedPrimaryActionTitle()
    {
        if (DetailHost.Visibility == Visibility.Visible && currentDetail is not null)
        {
            var detailAction = currentDetail.Actions?.FirstOrDefault(a => a.Primary == true)
                ?? currentDetail.Actions?.FirstOrDefault();
            return detailAction?.Title;
        }
        if (GridHostPanel.Visibility == Visibility.Visible)
        {
            if (gridIndex >= 0 && gridIndex < gridItems.Count)
            {
                return gridItems[gridIndex].Actions?.FirstOrDefault(a => a.Primary == true)?.Title;
            }
            return null;
        }
        if (ResultsList.SelectedItem is ItemRow row)
        {
            if (row.IsCommand)
            {
                return "Run";
            }
            return row.Item.Actions?.FirstOrDefault(a => a.Primary == true)?.Title;
        }
        return null;
    }

    private string? SelectedItemTitleForFooter()
    {
        if (webViewVisible)
        {
            // the mounted page names its own selection (the focused emoji, say)
            return webViewState?.SelectionTitle;
        }
        if (GridHostPanel.Visibility == Visibility.Visible)
        {
            return gridIndex >= 0 && gridIndex < gridItems.Count ? gridItems[gridIndex].Title : null;
        }
        if (ResultsList.SelectedItem is ItemRow row && !row.IsCommand)
        {
            return row.Item.Title;
        }
        return null;
    }

    private void ShowForm(FormTree form, string? extensionId)
    {
        currentPagination = null;
        currentForm = form;
        currentFormExtensionId = extensionId;
        currentFormEditors.Clear();

        var fieldsPanel = new StackPanel { Margin = new Thickness(16) };
        var heading = new TextBlock
        {
            Text = form.Title,
            FontSize = 18,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 12),
        };
        heading.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        fieldsPanel.Children.Add(heading);

        foreach (var field in form.Fields)
        {
            fieldsPanel.Children.Add(BuildFormField(field));
        }

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Margin = new Thickness(0, 10, 0, 8),
        };
        foreach (var action in form.Actions)
        {
            var button = new Button { Content = action.Title, MinWidth = 96, Margin = new Thickness(8, 0, 0, 0) };
            if (action.Primary == true)
            {
                button.SetResourceReference(Button.BackgroundProperty, "AccentBrush");
            }
            var capturedAction = action;
            button.Click += (_, _) => SubmitFormAction(capturedAction);
            buttons.Children.Add(button);
        }
        fieldsPanel.Children.Add(buttons);

        var scroller = new ScrollViewer
        {
            Content = fieldsPanel,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
        SmoothScroll.SetEnabled(scroller, true);

        currentDetail = null;
        DetailHost.Content = scroller;
        DetailHost.Visibility = Visibility.Visible;
        ResultsList.Visibility = Visibility.Collapsed;
        EmptyView.Visibility = Visibility.Collapsed;
        GridHostPanel.Visibility = Visibility.Collapsed;
        UpdateFooter();
        SearchBox.Focus();
    }

    private FrameworkElement BuildFormField(FormField field)
    {
        if (field.Kind == "separator")
        {
            return new System.Windows.Controls.Border
            {
                Height = 1,
                Margin = new Thickness(0, 8, 0, 8),
                Background = FindResource("DividerBrush") as Brush,
            };
        }

        var row = new StackPanel { Margin = new Thickness(0, 4, 0, 4) };
        var hasLabel = !string.IsNullOrEmpty(field.Label);
        if (hasLabel)
        {
            var label = new TextBlock
            {
                Text = field.Label,
                FontSize = 12,
                Margin = new Thickness(0, 2, 0, 4),
            };
            label.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
            row.Children.Add(label);
        }

        FrameworkElement editor = field.Kind switch
        {
            "textfield" => BuildFormTextBox(field, isPassword: false, isMultiline: false),
            "password" => BuildFormTextBox(field, isPassword: true, isMultiline: false),
            "textarea" => BuildFormTextBox(field, isPassword: false, isMultiline: true),
            "checkbox" => BuildFormCheckbox(field),
            "dropdown" => BuildFormDropdown(field),
            "datepicker" => new System.Windows.Controls.DatePicker(),
            "tagpicker" => BuildFormTagPicker(field),
            "filepicker" => BuildFormFilePicker(field),
            "description" => BuildFormDescription(field),
            _ => new FrameworkElement(),
        };
        if (!string.IsNullOrEmpty(field.Id))
        {
            currentFormEditors[field.Id] = editor;
        }
        row.Children.Add(editor);
        return row;
    }

    private FrameworkElement BuildFormTextBox(FormField field, bool isPassword, bool isMultiline)
    {
        var defaultValue = field.Default?.ValueKind == JsonValueKind.String ? field.Default.Value.GetString() : null;
        if (isPassword)
        {
            var passwordBox = new PasswordBox
            {
                Padding = new Thickness(8, 5, 8, 5),
            };
            if (!string.IsNullOrEmpty(defaultValue))
            {
                passwordBox.Password = defaultValue;
            }
            return passwordBox;
        }
        var textBox = new TextBox
        {
            Padding = new Thickness(8, 5, 8, 5),
            AcceptsReturn = isMultiline,
            TextWrapping = isMultiline ? TextWrapping.Wrap : TextWrapping.NoWrap,
            Height = isMultiline ? 96 : double.NaN,
        };
        if (!string.IsNullOrEmpty(defaultValue))
        {
            textBox.Text = defaultValue;
        }
        if (!string.IsNullOrEmpty(field.Placeholder))
        {
            textBox.Tag = field.Placeholder;
        }
        return textBox;
    }

    private FrameworkElement BuildFormCheckbox(FormField field)
    {
        var checkBox = new CheckBox { Content = field.Label };
        checkBox.IsChecked = field.Default?.ValueKind == JsonValueKind.True;
        return checkBox;
    }

    private FrameworkElement BuildFormDropdown(FormField field)
    {
        var combo = new ComboBox { Style = FindResource("SlimComboBox") as Style };
        combo.Items.Add(new ComboBoxItem { Content = "(none)", Tag = "" });
        var defaultValue = field.Default?.ValueKind == JsonValueKind.String ? field.Default.Value.GetString() : null;
        foreach (var option in field.Options ?? new List<Protocol.PreferenceOption>())
        {
            combo.Items.Add(new ComboBoxItem { Content = option.Title, Tag = option.Value });
        }
        foreach (ComboBoxItem item in combo.Items)
        {
            if ((string)item.Tag == defaultValue)
            {
                combo.SelectedItem = item;
                break;
            }
        }
        return combo;
    }

    private FrameworkElement BuildFormTagPicker(FormField field)
    {
        var list = new System.Windows.Controls.ListBox
        {
            SelectionMode = SelectionMode.Multiple,
            Height = 96,
        };
        var defaults = field.Defaults ?? new List<string>();
        foreach (var option in field.Options ?? new List<Protocol.PreferenceOption>())
        {
            var item = new ListBoxItem { Content = option.Title, Tag = option.Value, IsSelected = defaults.Contains(option.Value) };
            list.Items.Add(item);
        }
        return list;
    }

    private FrameworkElement BuildFormFilePicker(FormField field)
    {
        var pathBox = new TextBox { Visibility = Visibility.Collapsed, Padding = new Thickness(8, 5, 8, 5) };
        var allowMultiple = field.AllowMultipleSelection == true;
        var button = new Button
        {
            Content = field.CanChooseDirectories == true ? "Choose folder…" : "Choose file…",
        };
        button.Click += (_, _) =>
        {
            if (field.CanChooseDirectories == true)
            {
                var folderDialog = new Microsoft.Win32.OpenFolderDialog();
                if (folderDialog.ShowDialog(this) == true)
                {
                    pathBox.Text = folderDialog.FolderName;
                }
                return;
            }
            var dialog = new Microsoft.Win32.OpenFileDialog { Multiselect = allowMultiple };
            if (dialog.ShowDialog(this) == true)
            {
                pathBox.Text = string.Join('|', dialog.FileNames);
            }
        };
        var stack = new StackPanel { Orientation = Orientation.Horizontal };
        stack.Children.Add(button);
        stack.Children.Add(pathBox);
        if (pathBox.Text.Length > 0)
        {
            pathBox.Text = "";
        }
        return stack;
    }

    private FrameworkElement BuildFormDescription(FormField field)
    {
        var description = new TextBlock
        {
            Text = field.Label ?? "",
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 2, 0, 2),
        };
        description.SetResourceReference(TextBlock.ForegroundProperty, "TextTertiaryBrush");
        return description;
    }

    private Dictionary<string, JsonElement> CollectFormValues(FormTree form)
    {
        var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var field in form.Fields)
        {
            if (string.IsNullOrEmpty(field.Id) || !currentFormEditors.TryGetValue(field.Id, out var editor))
            {
                continue;
            }
            switch (field.Kind)
            {
                case "textfield":
                case "textarea":
                    if (editor is TextBox textBox && textBox.Text.Length > 0)
                    {
                        values[field.Id] = JsonSerializer.SerializeToElement(textBox.Text);
                    }
                    break;
                case "password":
                    if (editor is PasswordBox passwordBox && passwordBox.Password.Length > 0)
                    {
                        values[field.Id] = JsonSerializer.SerializeToElement(passwordBox.Password);
                    }
                    break;
                case "checkbox":
                    if (editor is CheckBox checkBox)
                    {
                        values[field.Id] = JsonSerializer.SerializeToElement(checkBox.IsChecked == true);
                    }
                    break;
                case "dropdown":
                    if (editor is ComboBox combo && combo.SelectedItem is ComboBoxItem selected)
                    {
                        values[field.Id] = JsonSerializer.SerializeToElement((string)selected.Tag);
                    }
                    break;
                case "datepicker":
                    if (editor is System.Windows.Controls.DatePicker picker && picker.SelectedDate is var date && date is not null)
                    {
                        values[field.Id] = JsonSerializer.SerializeToElement(date.Value.ToString("O"));
                    }
                    break;
                case "tagpicker":
                    if (editor is System.Windows.Controls.ListBox list)
                    {
                        var tags = list.Items.OfType<ListBoxItem>()
                            .Where(i => i.IsSelected)
                            .Select(i => (string)i.Tag)
                            .Where(tag => !string.IsNullOrEmpty(tag))
                            .ToList();
                        values[field.Id] = JsonSerializer.SerializeToElement(tags);
                    }
                    break;
                case "filepicker":
                    if (editor is StackPanel stack)
                    {
                        var hidden = stack.Children.OfType<TextBox>().FirstOrDefault();
                        if (hidden is not null && hidden.Text.Length > 0)
                        {
                            var paths = hidden.Text.Split('|');
                            values[field.Id] = JsonSerializer.SerializeToElement(
                                paths.Length == 1 ? (object)paths[0] : paths);
                        }
                    }
                    break;
            }
        }
        return values;
    }

    private void SubmitFormAction(UiAction action)
    {
        if (currentForm is null || currentFormExtensionId is null)
        {
            return;
        }
        var values = CollectFormValues(currentForm);
        var missingRequired = currentForm.Fields
            .Where(f => f.Required == true && !values.ContainsKey(f.Id))
            .Select(f => f.Label ?? f.Id)
            .ToList();
        if (missingRequired.Count > 0)
        {
            ShowToast("Please fill in: " + string.Join(", ", missingRequired));
            return;
        }
        DebugLog.Write($"FormAction ext={currentFormExtensionId} action={action.Id}");
        var requestId = sidecar.SendFormAction(currentFormExtensionId, action.Id, new UiItem { Id = currentForm.Title }, values);
        searchState.TrackAction(requestId, currentFormExtensionId);
        BeginOperation();
        if (action.Primary == true)
        {
            HideWindow();
        }
    }

    private bool PopView()
    {
        var popStart = System.Diagnostics.Stopwatch.GetTimestamp();
        DebugLog.Write("pop begin: hiding web surface");
        HideWebViewSurface();
        currentPagination = null;
        currentForm = null;
        DebugLog.Write("pop: web surface hidden, rows restored");
        if (searchState.Depth > 1 && searchState.Pop())
        {
            SetSearchBoxSilently(searchState.CurrentQuery);
            // Compose the display the same way the level did when it was
            // rendered (lean Favorites/Suggestions at the root, extension rows
            // deeper) — applying the stored raw rows would resurface the whole
            // merged command+apps list that the root no longer shows.
            var display = BuildDisplayRows();
            LoadRowIcons(display);
            ApplyRows(display, null);
            // No re-search here: the composed display is already correct, and
            // re-querying every extension saturates the UI thread right when
            // the surface swaps back (the blank window after leaving a
            // command). Freshness returns with the next keystroke or summon.
            UpdateChrome();
            DebugLog.Write(
                "pop done in " + System.Diagnostics.Stopwatch.GetElapsedTime(popStart).TotalMilliseconds + "ms");
            return true;
        }
        return false;
    }

    private void PerformEscape()
    {
        if (pendingArgumentCommand is not null)
        {
            CancelArgumentCapture();
            return;
        }
        if (GridHostPanel.Visibility == Visibility.Visible)
        {
            if (searchState.Depth > 1 && searchState.Pop())
            {
                GridHostPanel.Visibility = Visibility.Collapsed;
                SetSearchBoxSilently(searchState.CurrentQuery);
                SendSearch(searchState.CurrentQuery);
                UpdateChrome();
            }
            else
            {
                HideWindow();
            }
            return;
        }
        if (!PopView())
        {
            HideWindow();
        }
    }

    private void OnBackButtonClick(object sender, MouseButtonEventArgs e)
    {
        if (webViewVisible && webViewState?.CanGoBack == true)
        {
            PostWebViewPageAction("goBack");
            return;
        }
        PerformEscape();
    }

    private void OnListDoubleClick(object sender, MouseButtonEventArgs e) => RunPrimaryAction();

    private bool HandleDetailKeys(KeyEventArgs e)
    {
        if (currentDetail?.MediaKeys == true)
        {
            switch (e.Key)
            {
                case Key.Up:
                    ScrollDetail(-170);
                    e.Handled = true;
                    return true;
                case Key.Down:
                    ScrollDetail(170);
                    e.Handled = true;
                    return true;
            }
        }
        switch (e.Key)
        {
            case Key.Enter:
                RunDetailPrimary();
                return true;
            case Key.K when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenDetailActionPanel();
                return true;
            case Key.OemComma when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenSettings();
                return true;
            case Key.Escape:
                PerformEscape();
                return true;
            default:
                return TryRunActionShortcut(e);
        }
    }

    private void RunDetailPrimary()
    {
        if (currentDetail is null || currentDetailExtensionId is null)
        {
            return;
        }
        var action = currentDetail.Actions?.FirstOrDefault(a => a.Primary == true)
            ?? currentDetail.Actions?.FirstOrDefault();
        if (action is null)
        {
            return;
        }
        if (RunPushAction(currentDetailExtensionId, action))
        {
            return;
        }
        var requestId = sidecar.SendAction(
            currentDetailExtensionId, action.Id, new UiItem { Id = currentDetail.Title });
        searchState.TrackAction(requestId, currentDetailExtensionId);
        BeginOperation();
    }

    private void OpenDetailActionPanel()
    {
        if (currentDetail is null || currentDetailExtensionId is null)
        {
            return;
        }
        var actions = (currentDetail.Actions ?? new List<UiAction>()).ToList();
        if (actions.Count < 2)
        {
            RunDetailPrimary();
            return;
        }
        OpenActionPanel(
            currentDetailExtensionId,
            new UiItem { Id = currentDetail.Title, Title = currentDetail.Title },
            actions);
    }

    private void BeginArgumentCapture(string extensionId, CommandInfo command)
    {
        pendingArgumentCommand = command;
        pendingArgumentExtensionId = extensionId;
        SetSearchBoxSilently("");
        SearchPlaceholder.Text = string.Join(' ', command.Arguments!.Select(a => "{" + a.Placeholder + "}"));
        SearchBox.Focus();
    }

    private void CancelArgumentCapture()
    {
        pendingArgumentCommand = null;
        pendingArgumentExtensionId = null;
        SearchPlaceholder.Text = "Search for apps and commands…";
    }

    /// <summary>
    /// Splits the capture query positionally across the declared arguments,
    /// honouring double quotes; dropdown values must match declared data.
    /// </summary>
    internal static Dictionary<string, string>? ParseCommandArguments(
        CommandInfo command, string query, out string? error)
    {
        error = null;
        var pieces = new List<string>();
        var current = new System.Text.StringBuilder();
        var inQuotes = false;
        foreach (var ch in query.Trim())
        {
            switch (ch)
            {
                case '"':
                    inQuotes = !inQuotes;
                    break;
                case ' ' when !inQuotes:
                    if (current.Length > 0)
                    {
                        pieces.Add(current.ToString());
                        current.Clear();
                    }
                    break;
                default:
                    current.Append(ch);
                    break;
            }
        }
        if (current.Length > 0)
        {
            pieces.Add(current.ToString());
        }

        var declared = command.Arguments ?? new List<CommandArgument>();
        if (pieces.Count > declared.Count)
        {
            error = $"This command takes at most {declared.Count} argument(s).";
            return null;
        }
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 0; i < declared.Count; i++)
        {
            var argument = declared[i];
            var value = i < pieces.Count ? pieces[i] : "";
            var missing = value.Length == 0;
            if (missing && argument.Required == true)
            {
                error = $"Missing value for '{argument.Placeholder}'.";
                return null;
            }
            if (!missing && argument.Type == "dropdown")
            {
                var allowed = (argument.Data ?? new List<PreferenceOption>())
                    .Any(o => string.Equals(o.Value, value, StringComparison.Ordinal));
                if (!allowed)
                {
                    error = $"'{value}' is not a valid {argument.Placeholder} (use one of: " +
                            string.Join(", ", (argument.Data ?? new List<PreferenceOption>()).Select(o => o.Value)) + ").";
                    return null;
                }
            }
            if (!missing)
            {
                result[argument.Name] = value;
            }
        }
        return result;
    }

    private void SubmitArguments(string query)
    {
        var command = pendingArgumentCommand!;
        var extensionId = pendingArgumentExtensionId!;
        var arguments = ParseCommandArguments(command, query, out var error);
        if (arguments is null)
        {
            ShowToast(error ?? "Invalid arguments.");
            return;
        }
        CancelArgumentCapture();
        SetSearchBoxSilently("");
        HideWindow();
        var requestId = sidecar.SendAction(
            extensionId, CommandCatalog.OpenActionId,
            new UiItem { Id = command.Id, Title = command.Title },
            arguments);
        searchState.TrackAction(requestId, extensionId);
    }

    /// <summary>
    /// Runs a shell-owned root command locally — built-ins never reach the
    /// sidecar.
    /// </summary>
    private void RunBuiltIn(string id)
    {
        switch (id)
        {
            case BuiltInCommands.SettingsId:
                HideWindow();
                OpenSettings();
                break;
            case BuiltInCommands.ReloadExtensionsId:
                HideWindow();
                sidecar.Restart();
                break;
            case BuiltInCommands.CheckUpdatesId:
                // The Velopack banner lives inside the launcher window, so it
                // stays open for the user to see the result.
                ShowToast("Checking for updates…");
                _ = updateService.CheckNowAsync();
                break;
            case BuiltInCommands.QuitId:
                Quit();
                break;
        }
    }

    /// <summary>
    /// Handles the root's web-search fallback row locally; returns false for
    /// any other action so the caller keeps its normal dispatch path.
    /// </summary>
    private bool TryRunWebSearchFallback(UiItem item, string actionId)
    {
        if (!actionId.StartsWith(WebSearchFallback.ActionIdPrefix, StringComparison.Ordinal))
        {
            return false;
        }
        var query = item.Id.StartsWith(WebSearchFallback.ItemIdPrefix, StringComparison.Ordinal)
            ? item.Id[WebSearchFallback.ItemIdPrefix.Length..]
            : SearchBox.Text.Trim();
        if (WebSearchFallback.UrlFor(actionId, query) is not { } url)
        {
            return false;
        }
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
        HideWindow();
        return true;
    }

    private void RunPrimaryAction()
    {
        if (webViewVisible)
        {
            // The web view owns interactions; the search box still drives it
            // via searches, so a stale row selection must not re-open commands.
            return;
        }
        DebugLog.Write("RunPrimaryAction");
        if (pendingArgumentCommand is not null && pendingArgumentExtensionId is not null)
        {
            SubmitArguments(SearchBox.Text);
            return;
        }
        if (ResultsList.SelectedItem is LoadMoreRow
            && currentPagination is not null
            && currentPaginationExtensionId is not null)
        {
            DebugLog.Write("LoadMore ext=" + currentPaginationExtensionId);
            var loadMoreRequestId = sidecar.SendAction(
                currentPaginationExtensionId,
                currentPagination.MoreActionId,
                new UiItem { Id = "load-more" });
            searchState.TrackAction(loadMoreRequestId, currentPaginationExtensionId);
            BeginOperation();
            return;
        }
        if (ResultsList.SelectedItem is not ItemRow row || row.ExtensionId is null)
        {
            return;
        }
        if (row.IsCommand)
        {
            DebugLog.Write("OpenCommand ext=" + row.ExtensionId + " cmd=" + row.CommandId);
            OpenCommand(row);
            return;
        }
        var action = row.Item.Actions?.FirstOrDefault(a => a.Primary == true) ?? row.Item.Actions?.FirstOrDefault();
        if (action is null)
        {
            return;
        }
        if (TryRunWebSearchFallback(row.Item, action.Id))
        {
            return;
        }
        if (RunPushAction(row.ExtensionId!, action))
        {
            return;
        }
        DebugLog.Write("SendAction ext=" + row.ExtensionId + " action=" + action.Id);
        var requestId = sidecar.SendAction(row.ExtensionId, action.Id, row.Item);
        searchState.TrackAction(requestId, row.ExtensionId);
        BeginOperation();
        if (action.Primary == true)
        {
            HideWindow();
        }
    }

    private bool RunPushAction(string extensionId, UiAction action)
    {
        if (string.IsNullOrEmpty(action.Push))
        {
            return false;
        }
        DebugLog.Write("PushAction ext=" + extensionId + " to=" + action.Push);
        searchState.PushRequest("push-" + Guid.NewGuid().ToString("N"), extensionId, action.Push, actionPushed: true);
        SendSearch("");
        return true;
    }

    private void OpenActionPanelForSelection()
    {
        if (ResultsList.SelectedItem is not ItemRow row || row.ExtensionId is null)
        {
            return;
        }
        var actions = (row.Item.Actions ?? new List<UiAction>()).ToList();
        if (actions.Count < 2)
        {
            ShowToast("This item has a single action — press Enter to run it.");
            return;
        }
        OpenActionPanel(row.ExtensionId, row.Item, actions);
    }

    private void OpenGridActionPanel()
    {
        if (gridIndex < 0 || gridIndex >= gridItems.Count)
        {
            return;
        }
        var extensionId = searchState.Top?.ExtensionId;
        if (extensionId is null)
        {
            return;
        }
        var item = gridItems[gridIndex];
        var actions = (item.Actions ?? new List<UiAction>()).ToList();
        if (actions.Count == 0)
        {
            return;
        }
        if (actions.Count < 2)
        {
            ShowToast("This item has a single action — press Enter to run it.");
            return;
        }
        OpenActionPanel(extensionId, item, actions);
    }

    private void OpenActionPanel(string extensionId, UiItem item, List<UiAction> actions)
    {
        actionPanel?.Close();
        actionPanel = new ActionPanel();
        // Frequently used actions float to the top; the primary stays first.
        var ordered = actionUsage.OrderForPanel(extensionId, actions);
        actionPanel.Committed += action =>
        {
            CommitItemAction(
                extensionId,
                item,
                new UiAction
                {
                    Id = action.Id,
                    Title = action.Title,
                    Push = action.Push,
                    Primary = action.Primary,
                });
        };
        actionPanel.FocusLostToOtherApp += () =>
        {
            if (GetForegroundWindow() != Handle)
            {
                HideWindow();
            }
        };
        actionPanel.Open(
            ordered.Select(a => new ActionPanel.PanelAction(
                a.Id, a.Title, null, a.Style, a.Primary == true, a.Push, a.Group, a.Shortcut)).ToList(),
            item.Title,
            Left + Width,
            Top + Height,
            FooterHeightValue);
    }

    /// <summary>
    /// Runs the selected item's (or detail view's) extension-declared shortcut
    /// action for the pressed key. Only shortcuts declaring a real command
    /// modifier (Ctrl/Alt/Win) match, so plain typing in the search box is
    /// never stolen.
    /// </summary>
    private bool TryRunActionShortcut(KeyEventArgs e)
    {
        var mods = Keyboard.Modifiers;
        if ((mods & (ModifierKeys.Control | ModifierKeys.Alt | ModifierKeys.Windows)) == 0)
        {
            return false;
        }
        var (extensionId, item, actions) = CurrentShortcutContext();
        if (extensionId is null || actions is not { Count: > 0 })
        {
            return false;
        }
        foreach (var action in actions)
        {
            if (ActionShortcutMatcher.Matches(action.Shortcut, mods, e.Key))
            {
                CommitItemAction(extensionId, item, action);
                return true;
            }
        }
        return false;
    }

    private (string? ExtensionId, UiItem Item, IReadOnlyList<UiAction>? Actions) CurrentShortcutContext()
    {
        if (DetailHost.Visibility == Visibility.Visible && currentDetail is not null)
        {
            return (
                currentDetailExtensionId,
                new UiItem { Id = currentDetail.Title, Title = currentDetail.Title },
                currentDetail.Actions ?? new List<UiAction>());
        }
        if (GridHostPanel.Visibility == Visibility.Visible && gridIndex >= 0 && gridIndex < gridItems.Count)
        {
            var item = gridItems[gridIndex];
            return (searchState.Top?.ExtensionId, item, item.Actions ?? new List<UiAction>());
        }
        if (ResultsList.SelectedItem is ItemRow row)
        {
            return (row.ExtensionId, row.Item, row.Item.Actions ?? new List<UiAction>());
        }
        return (null, new UiItem(), null);
    }

    /// <summary>
    /// The single dispatch point for a non-chrome item action: favorites
    /// toggle locally, the web-search fallback opens the browser, pushes move
    /// the stack, everything else goes to the extension.
    /// </summary>
    private void CommitItemAction(string extensionId, UiItem item, UiAction action)
    {
        actionUsage.Bump(extensionId, action.Id);
        if (action.Id == RootSectionsBuilder.FavoriteActionId)
        {
            var kind = extensionId == "apps" ? "app" : "cmd";
            favoritesStore.Toggle(new FavoriteEntry(
                kind,
                item.Id,
                item.Title,
                item.Subtitle ?? "",
                null,
                item.IconColor,
                item.IconUri));
            SendSearch(SearchBox.Text);
            return;
        }
        if (TryRunWebSearchFallback(item, action.Id))
        {
            return;
        }
        DebugLog.Write("SendAction ext=" + extensionId + " action=" + action.Id);
        if (RunPushAction(extensionId, action))
        {
            return;
        }
        var requestId = sidecar.SendAction(extensionId, action.Id, item);
        searchState.TrackAction(requestId, extensionId);
        BeginOperation();
        if (action.Primary == true)
        {
            HideWindow();
        }
    }

    /// <summary>
    /// Opens the native action panel over a mounted web command: the page
    /// reports its actions in viewState; committing one is forwarded back into
    /// the page, which runs it.
    /// </summary>
    private void OpenWebViewActionPanel()
    {
        var actions = webViewState?.Actions;
        if (actions is not { Count: > 0 })
        {
            return;
        }
        var top = searchState.Top;
        var extension = top?.ExtensionId is null
            ? null
            : readyExtensions.FirstOrDefault(e => e.Id == top.ExtensionId);
        var commandTitle = top?.CommandId is null || extension is null
            ? null
            : extension.Commands.FirstOrDefault(c => c.Id == top.CommandId)?.Title;
        actionPanel?.Close();
        actionPanel = new ActionPanel();
        actionPanel.Committed += action =>
        {
            DebugLog.Write("paletteAction ext=" + top?.ExtensionId + " action=" + action.Id);
            webViewHost?.PostPaletteAction(action.Id);
        };
        actionPanel.FocusLostToOtherApp += () =>
        {
            if (GetForegroundWindow() != Handle)
            {
                HideWindow();
            }
        };
        actionPanel.Open(
            actions.Select(a => new ActionPanel.PanelAction(a.Id, a.Title, a.Icon)).ToList(),
            commandTitle ?? extension?.Name ?? "",
            Left + Width,
            Top + Height,
            FooterHeightValue);
    }

    private void OpenCommand(ItemRow row)
    {
        usageTracker.Increment(row.Item.Id);
        if (row.ExtensionId == BuiltInCommands.ExtensionId)
        {
            RunBuiltIn(row.CommandId!);
            return;
        }
        var extension = readyExtensions.FirstOrDefault(e => e.Id == row.ExtensionId);
        var schema = extension?.Preferences ?? (IReadOnlyList<Protocol.PreferenceSchema>)Array.Empty<Protocol.PreferenceSchema>();
        var missing = preferencesStore.MissingRequired(row.ExtensionId!, schema);
        if (missing.Count > 0)
        {
            ShowToast($"'{extension?.Name}' needs settings before it can run: missing " + string.Join(", ", missing) + ". Open Settings to configure.");
            return;
        }
        var openedCommand = extension?.Commands.FirstOrDefault(c => c.Id == row.CommandId);
        if (openedCommand?.Mode == "background")
        {
            if (openedCommand.Arguments is { Count: > 0 })
            {
                BeginArgumentCapture(row.ExtensionId!, openedCommand);
                return;
            }
            sidecar.SendAction(row.ExtensionId!, CommandCatalog.OpenActionId,
                new UiItem { Id = row.CommandId, Title = row.Item.Title });
            HideWindow();
            return;
        }
        BeginOperation();
        var requestId = sidecar.SendAction(row.ExtensionId!, CommandCatalog.OpenActionId,
            new UiItem { Id = row.CommandId, Title = row.Item.Title });
        searchState.PushRequest(requestId, row.ExtensionId!, row.CommandId!);
        SetSearchBoxSilently("");
        SearchBox.Focus();
        UpdateChrome();
    }

    private void RegisterCommandHotkeys()
    {
        if (hotkeyManager is null || readyExtensions.Count == 0)
        {
            return;
        }
        UnregisterCommandHotkeys();
        var settings = hotkeySettings.Load();
        var index = 0;
        foreach (var extension in readyExtensions)
        {
            foreach (var command in extension.Commands)
            {
                var commandKey = extension.Id + ":" + command.Id;
                if (!CommandToggles.IsEnabled(extension.Id, command.Id))
                {
                    continue;
                }
                if (!settings.CommandShortcuts.TryGetValue(commandKey, out var combo))
                {
                    continue;
                }
                if (!TryParseCombo(combo, out var modifier, out var virtualKey))
                {
                    continue;
                }
                var id = CommandHotkeyBase + index;
                index++;
                if (hotkeyManager.Register(id, modifier, virtualKey))
                {
                    commandHotkeyIds[id] = (extension.Id, command.Id);
                    DebugLog.Write($"registered command hotkey id=0x{CommandHotkeyBase + index:X} {commandKey}={combo}");
                }
                else
                {
                    index--;
                    ShowToast($"Shortcut for '{command.Title}' could not be registered (conflict or invalid).");
                }
            }
        }
        commandHotkeysRegistered = true;
    }

    private void UnregisterCommandHotkeys()
    {
        if (hotkeyManager is null)
        {
            return;
        }
        foreach (var id in commandHotkeyIds.Keys)
        {
            hotkeyManager.Unregister(id);
        }
        commandHotkeyIds.Clear();
    }

    private void RunCommandFromShortcut(string extensionId, string commandId)
    {
        var extension = readyExtensions.FirstOrDefault(e => e.Id == extensionId);
        var command = extension?.Commands.FirstOrDefault(c => c.Id == commandId);
        if (extension is null || command is null)
        {
            return;
        }
        var schema = extension.Preferences ?? (IReadOnlyList<Protocol.PreferenceSchema>)Array.Empty<Protocol.PreferenceSchema>();
        var missing = preferencesStore.MissingRequired(extensionId, schema);
        if (missing.Count > 0)
        {
            ShowToast($"'{extension.Name}' needs settings before it can run: missing " + string.Join(", ", missing) + ". Open Settings to configure.");
            return;
        }
        if (command.Mode == "background")
        {
            sidecar.SendAction(extensionId, CommandCatalog.OpenActionId, new UiItem { Id = commandId, Title = command.Title });
            return;
        }
        Dispatcher.BeginInvoke(() =>
        {
            searchState.ResetToRoot();
            SetSearchBoxSilently("");
            Summon();
            var requestId = sidecar.SendAction(extensionId, CommandCatalog.OpenActionId,
                new UiItem { Id = commandId, Title = command.Title });
            searchState.PushRequest(requestId, extensionId, commandId);
            UpdateChrome();
        });
    }

    public static bool TryParseCombo(string combo, out uint modifier, out uint virtualKey)
    {
        modifier = 0;
        virtualKey = 0;
        var parts = combo.Split('+');
        if (parts.Length < 2)
        {
            return false;
        }
        foreach (var rawPart in parts[..^1])
        {
            modifier |= rawPart.Trim().ToLowerInvariant() switch
            {
                "ctrl" => HotkeyManager.MOD_CONTROL,
                "alt" => HotkeyManager.MOD_ALT,
                "win" => HotkeyManager.MOD_WIN,
                "shift" => HotkeyManager.MOD_SHIFT,
                _ => 0,
            };
        }
        var keyPart = parts[^1].Trim();
        virtualKey = keyPart switch
        {
            "Space" => 0x20,
            "Left" => 0x25,
            "Up" => 0x26,
            "Right" => 0x27,
            "Down" => 0x28,
            "." => 0xBE,
            "," => 0xBC,
            "-" => 0xBD,
            "=" => 0xBB,
            "/" => 0xBF,
            ";" => 0xBA,
            "'" => 0xDE,
            "[" => 0xDB,
            "]" => 0xDD,
            _ when keyPart.Length == 1 && char.IsLetterOrDigit(keyPart[0]) => (uint)char.ToUpperInvariant(keyPart[0]),
            _ when keyPart.StartsWith("F") && int.TryParse(keyPart[1..], out var f) && f is >= 1 and <= 24 => (uint)(0x70 + f - 1),
            _ => 0,
        };
        return modifier != 0 && virtualKey != 0;
    }

    private void OnSidecarAck(AckMessage ack)
    {
        EndOperation();
        Dispatcher.BeginInvoke(() =>
        {
            if (searchState.Depth > 1)
            {
                searchState.ResetToRoot();
                SendSearch("");
            }
            ShowToast("Command completed");
        });
    }

    private void SendSearch(string query)
    {
        if (readyExtensions.Count == 0)
        {
            UpdateEmptyView("Starting extensions…", "waiting for the sidecar");
            return;
        }
        DebugLog.Write("SendSearch query='" + query + "'");
        var top = searchState.Top;
        if (top is null)
        {
            searchState.BeginLevelQuery(Array.Empty<(string, string)>());
            top = searchState.Top;
        }
        top.Query = query;
        if (top is { CommandId: not null, ExtensionId: not null })
        {
            var requestId = sidecar.SendSearch(top.ExtensionId, query, top.CommandId, top.FilterValue);
            searchState.BeginLevelQuery(new[] { (ExtensionId: top.ExtensionId, RequestId: requestId) });
        }
        else
        {
            var requests = readyExtensions
                .Select(ext => (ext.Id, sidecar.SendSearch(ext.Id, query)))
                .ToList();
            searchState.BeginLevelQuery(requests);
        }
        top.Query = query;
        BeginOperation();
    }

    private IReadOnlyList<UiRow> BuildDisplayRows()
    {
        var extensionRows = AppendLoadMore(searchState.CurrentRows);
        if (searchState.Depth > 1)
        {
            return extensionRows;
        }
        var query = SearchBox.Text.Trim();
        var commandRows = CommandCatalog
            .Search(query, readyExtensions)
            .Where(cmd => CommandToggles.IsEnabled(cmd.ExtensionId, cmd.Command.Id, cmd.Command.DisabledByDefault != true))
            .Select(BuildCommandRow)
            .ToList();
        foreach (var (builtIn, score) in BuiltInCommands.Search(query))
        {
            commandRows.Add(BuildBuiltInRow(builtIn, score));
        }
        var extensionRowList = extensionRows.ToList();
        // Every root-level row can be favorited, with or without an active query
        // (only the Favorites/Suggestions sections hide while searching).
        foreach (var row in extensionRowList.OfType<ItemRow>())
        {
            if (row.ExtensionId == "apps")
            {
                var actions = (row.Item.Actions ?? new List<UiAction>()).ToList();
                if (actions.All(a => a.Id != RootSectionsBuilder.FavoriteActionId))
                {
                    actions.Add(RootSectionsBuilder.FavoriteAction(favoritesStore, "app", row.Item.Id));
                    row.Item.Actions = actions;
                }
            }
        }
        var merged = new List<UiRow>(commandRows);
        merged.AddRange(extensionRowList);
        DebugLog.Write("display rows: commands=" + commandRows.Count + " ext=" + extensionRowList.Count + " depth=" + searchState.Depth);
        if (searchState.Depth == 1)
        {
            if (query.Length == 0)
            {
                var pixelSize = (int)Math.Round(VisualTreeHelper.GetDpi(this).PixelsPerDip * 32);
                // The root stays lean: Favorites and Suggestions only. The
                // command/app rows below (43 commands, the whole app list and
                // their icon extractions) made every root render heavy — they
                // are all reachable through search, which re-adds them here.
                // Apps render at the root again — measured ~70ms for a full
                // pop including all app rows and icons — but capped so the
                // root window stays compact, Raycast-home style; the full
                // list is one query away.
                return RootSectionsBuilder.Build(
                    favoritesStore, usageTracker, readyExtensions, appLauncher.List("", pixelSize), BuildCommandRow,
                    appsCap: RootAppsCap);
            }
            // Decorate every row with the query's fuzzy match: indices drive
            // title highlighting, scores drive cross-source ranking (command
            // rows already carry their catalog score, which includes keywords).
            foreach (var row in merged.OfType<ItemRow>())
            {
                var match = FuzzyMatcher.Match(query, row.Item.Title);
                row.MatchIndices = match?.Indices;
                row.MatchScore ??= match?.Score;
            }
            var ranked = RootRanker.Rank(merged, ExtensionDisplayName);
            if (!merged.OfType<ItemRow>().Any())
            {
                return ranked.Concat(BuildFallbackRows(query)).ToList();
            }
            return ranked;
        }
        return merged;
    }

    private string ExtensionDisplayName(string extensionId) =>
        readyExtensions.FirstOrDefault(e => e.Id == extensionId)?.Name ?? "";

    private IReadOnlyList<UiRow> BuildFallbackRows(string query)
    {
        var rows = new List<UiRow>();
        foreach (var row in WebSearchFallback.Build(query))
        {
            if (row is ItemRow itemRow)
            {
                itemRow.ExtensionId = WebSearchFallback.ExtensionId;
                itemRow.VectorIcon = Rendering.LucideIcon.Load("search");
                itemRow.VectorIconBrush = Rendering.LucideIcon.ColorFromHex(
                    null, (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"));
            }
            rows.Add(row);
        }
        return rows;
    }

    private ItemRow BuildBuiltInRow(BuiltInCommand command, int score)
    {
        var row = UiRow.Item(new UiItem
        {
            Id = BuiltInCommands.ItemId(command),
            Title = command.Title,
            Subtitle = command.Subtitle,
            Kind = "Command",
            Actions = new List<UiAction> { new UiAction { Id = CommandCatalog.OpenActionId, Title = "Run", Primary = true } },
        });
        row.ExtensionId = BuiltInCommands.ExtensionId;
        row.IsCommand = true;
        row.CommandId = command.Id;
        row.MatchScore = score;
        row.VectorIcon = Rendering.LucideIcon.Load(command.IconName);
        row.VectorIconBrush = Rendering.LucideIcon.ColorFromHex(
            command.IconColor, (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"));
        return row;
    }

    private ItemRow BuildCommandRow(CommandRow cmd)
    {
        var row = UiRow.Item(new UiItem
        {
            Id = "cmd:" + cmd.ExtensionId + ":" + cmd.Command.Id,
            Title = cmd.Command.Title,
            Subtitle = cmd.Command.Subtitle ?? cmd.ExtensionName,
            Kind = "Command",
            Icon = cmd.Command.Icon is null ? cmd.Extension.Icon : "",
            IconColor = cmd.Command.IconColor,
            Actions = new List<UiAction> { new UiAction { Id = CommandCatalog.OpenActionId, Title = "Run", Primary = true } },
        });
        row.ExtensionId = cmd.ExtensionId;
        row.IsCommand = true;
        row.CommandId = cmd.Command.Id;
        if (Rendering.BrandIcons.TryGetDrawing(cmd.ExtensionId, out var brandDrawing))
        {
            row.Bitmap = brandDrawing;
        }
        else if (Rendering.BrandIcons.TryGet(cmd.ExtensionId, out var brandGeometry, out var brandBrush))
        {
            row.VectorIcon = brandGeometry;
            row.VectorIconBrush = brandBrush;
            row.VectorIconFilled = true;
        }
        else if (Rendering.BrandIcons.TryGetBitmap(cmd.ExtensionId, out var brandBitmap))
        {
            row.Bitmap = brandBitmap;
        }
        else if (LoadExtensionImageIcon(cmd.ExtensionId, cmd.Command.Icon, cmd.Extension.Icon) is { } extensionImage)
        {
            row.Bitmap = extensionImage;
        }
        else if (cmd.Command.Icon is not null)
        {
            row.VectorIcon = Rendering.LucideIcon.Load(cmd.Command.Icon);
            row.VectorIconBrush = Rendering.LucideIcon.ColorFromHex(
                cmd.Command.IconColor,
                (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"));
        }
        row.Item.Actions.Add(RootSectionsBuilder.FavoriteAction(
            favoritesStore, "cmd", row.Item.Id));
        row.MatchScore = cmd.Score;
        return row;
    }

    private void OnSidecarReady(ReadyMessage ready)
    {
        readyExtensions = ready.Extensions;
        readyFailures = ready.Failures ?? [];
        var restarted = searchState.Depth > 1;
        if (restarted)
        {
            searchState.ResetToRoot();
        }
        Dispatcher.BeginInvoke(() =>
        {
            if (restarted)
            {
                ShowToast("Extensions restarted — returned to root");
            }
            RegisterCommandHotkeys();
            UpdateChrome();
            var first = ready.Extensions.FirstOrDefault();
            SetStatusBar(first is null ? "no extensions" : $"{first.Name} v{first.Version} ready");
            SendSearch(SearchBox.Text);
            // A settings window open across a sidecar restart refreshes in
            // place — closing and reopening it reads as window flicker.
            settingsWindow?.UpdateExtensions(ready.Extensions, readyFailures);
        });
    }

    public void SavePreferences(string extensionId, IReadOnlyList<Protocol.PreferenceSchema> schema, Dictionary<string, System.Text.Json.JsonElement> values)
    {
        preferencesStore.SetSlice(extensionId, schema, values);
        sidecar.SendPreferences(extensionId, preferencesStore.Slice(extensionId, schema)
            .ToDictionary(p => p.Key, p => p.Value));
    }

    private bool viewHoldsLoadingBar;
    private bool webviewLoadPending;
    private WebViewHost? webViewHost;
    private bool webViewVisible;
    private WebViewProtocol.WebViewState? webViewState;
    private WebViewMessage? lastWebMount;
    private FooterWebViewHost? footerWebViewHost;
    private const int WebviewTeardownAfterHiddenSeconds = 60;
    private System.Windows.Threading.DispatcherTimer? webviewTeardownTimer;
    private bool footerWebViewReady;
    private FooterToastState? footerToast;
    private readonly Dictionary<string, FooterIconState> footerIconCache = new(StringComparer.Ordinal);
    private Protocol.UiPagination? currentPagination;
    private string? currentPaginationExtensionId;
    private CommandInfo? pendingArgumentCommand;
    private string? pendingArgumentExtensionId;
    private FormTree? currentForm;
    private string? currentFormExtensionId;
    private readonly Dictionary<string, FrameworkElement> currentFormEditors = new(StringComparer.Ordinal);

    private void ApplyViewChrome(UiTree tree)
    {
        var placeholder = tree switch
        {
            ListTree listTree => listTree.SearchBarPlaceholder,
            GridTree gridTree => gridTree.SearchBarPlaceholder,
            _ => null,
        };
        SearchPlaceholder.Text = string.IsNullOrWhiteSpace(placeholder)
            ? "Search for apps and commands…"
            : placeholder;
        var holds = tree is ListTree l ? l.IsLoading == true : tree is GridTree g && g.IsLoading == true;
        if (holds && !viewHoldsLoadingBar)
        {
            viewHoldsLoadingBar = true;
            BeginOperation();
        }
        else if (!holds && viewHoldsLoadingBar)
        {
            viewHoldsLoadingBar = false;
            EndOperation();
        }
    }

    /// <summary>
    /// Chrome state reported by the mounted web page: drives the footer hints,
    /// the search-bar filter dropdown and what the back button does.
    /// </summary>
    private void OnWebViewViewState(string extensionId, string json)
    {
        Dispatcher.BeginInvoke(() =>
        {
            webViewState = WebViewProtocol.ParseViewState(json);
            if (webViewState is null)
            {
                DebugLog.Write("webview viewState parse failed");
                return;
            }
            if (webviewLoadPending)
            {
                // the page's first report after a fresh mount — the boot is done
                webviewLoadPending = false;
                EndOperation();
            }
            DebugLog.Write(
                "webview viewState primary=" + (webViewState.PrimaryTitle ?? "")
                + " canGoBack=" + webViewState.CanGoBack
                + " hasActions=" + webViewState.HasActions
                + " actions=" + (webViewState.Actions?.Count ?? 0)
                + " filters=" + (webViewState.Filters?.Count ?? 0));
            var filter = webViewState.Filters is { Count: > 0 }
                ? new Protocol.UiFilter { Options = webViewState.Filters }
                : null;
            // The page keeps running while its surface is hidden (timer-driven
            // screens re-report); a native view must not grow a filter dropdown.
            UpdateFilterDropdown(webViewVisible ? filter : null);
            // a web page names its own search box ("Search Emoji & Symbols...")
            if (webViewVisible && !string.IsNullOrWhiteSpace(webViewState.SearchPlaceholder))
            {
                SearchPlaceholder.Text = webViewState.SearchPlaceholder;
            }
            UpdateFooter();
        });
    }

    /// <summary>Forwards a chrome interaction (enter/ctrl+k/back) into the page.</summary>
    private void PostWebViewPageAction(string action)
    {
        DebugLog.Write("webview pageAction=" + action);
        webViewHost?.PostPageAction(action);
    }

    private void OnSidecarWebView(WebViewMessage message)
    {
        Dispatcher.BeginInvoke(async () =>
        {
            try
            {
                EndOperation();
                webViewVisible = true;
                lastWebMount = message;
                // Props-only updates re-render the same mounted page; pages
                // dedup their viewState posts, so resetting the chrome state
                // here would leave the footer hints dark until the page's next
                // real chrome change. Reset only when a different page loads.
                var freshPage = webViewHost is null || !webViewHost.IsShowing(message.ExtensionId, message.Entry);
                if (freshPage)
                {
                    webViewState = null;
                    // a freshly navigated page boots and queries before it has
                    // anything to show — hold the loading bar until its first
                    // viewState report lands
                    webviewLoadPending = true;
                    BeginOperation();
                }
                ResultsList.Visibility = Visibility.Collapsed;
                GridHostPanel.Visibility = Visibility.Collapsed;
                DetailHost.Visibility = Visibility.Collapsed;
                EmptyView.Visibility = Visibility.Collapsed;
                PaneHost.Visibility = Visibility.Collapsed;
                PaneDivider.Visibility = Visibility.Collapsed;
                WebViewSurface.Visibility = Visibility.Visible;
                EnsureWebViewHost();
                DebugLog.Write($"WebView mount ext={message.ExtensionId} cmd={message.CommandId} entry={message.Entry}");
                var firstPartyExtensionsRoot = repoRoot is null
                    ? null
                    : System.IO.Path.Combine(repoRoot, "extensions");
                await webViewHost.ShowAsync(message, extensionsRoot, firstPartyExtensionsRoot);
                webViewHost.SetMemoryTargetNormal();
                // a page re-shown after an idle discard may hold stale state —
                // let it re-query (pages that don't use it ignore the action)
                webViewHost.PostPageAction("refresh");
                UpdateFooter();
            }
            catch (Exception ex)
            {
                DebugLog.Write("webview mount failed: " + ex);
                ShowToast("Web view failed: " + ex.Message);
            }
        });
    }

    /// <summary>
    /// Creates the shared command WebView on first use and (re)wires its
    /// events; idempotent, used by the mount path and the idle pre-warm.
    /// </summary>
    private void EnsureWebViewHost()
    {
        webViewHost ??= new WebViewHost(WebViewContainer);
        webViewHost.SetThemeCss(WebViewHost.BuildThemeCssFromResources(key => TryFindResource(key)));
        webViewHost.CallRequested -= OnWebViewCallRequested;
        webViewHost.CallRequested += OnWebViewCallRequested;
        webViewHost.AbortRequested -= OnWebViewAbortRequested;
        webViewHost.AbortRequested += OnWebViewAbortRequested;
        webViewHost.LoadFailed -= OnWebViewLoadFailed;
        webViewHost.LoadFailed += OnWebViewLoadFailed;
        webViewHost.LogEmitted -= OnWebViewLogEmitted;
        webViewHost.LogEmitted += OnWebViewLogEmitted;
        webViewHost.ViewStateEmitted -= OnWebViewViewState;
        webViewHost.ViewStateEmitted += OnWebViewViewState;
        webViewHost.PaletteRequested -= OpenWebViewActionPanel;
        webViewHost.PaletteRequested += OpenWebViewActionPanel;
    }

    /// <summary>
    /// Pre-warms the last web command after summon: the page boots hidden so
    /// re-entering the command re-shows it with a props update instead of a
    /// full mount. The idle discard still releases it if it is never opened.
    /// </summary>
    private void PreWarmLastWebCommand()
    {
        if (webViewVisible || lastWebMount is null)
        {
            return;
        }
        var top = searchState.Top;
        var restoredIsLastWebCommand =
            top is { ExtensionId: not null, CommandId: not null }
            && top.ExtensionId == lastWebMount.ExtensionId
            && top.CommandId == lastWebMount.CommandId;
        var firstPartyExtensionsRoot = repoRoot is null
            ? null
            : System.IO.Path.Combine(repoRoot, "extensions");
        try
        {
            EnsureWebViewHost();
            if (restoredIsLastWebCommand)
            {
                // The command level survived the teardown — run the full mount
                // so the user lands back on the page (with the boot loading
                // bar) instead of an empty native stub.
                BeginOperation();
                OnSidecarWebView(lastWebMount);
                return;
            }
            if (searchState.Depth > 1)
            {
                // a different native view is restored — don't boot a page over it
                return;
            }
            var freshMount = !webViewHost.IsShowing(lastWebMount.ExtensionId, lastWebMount.Entry);
            if (freshMount)
            {
                // the discarded page re-mounts here — hold the loading bar
                // until the page reports its first viewState
                webviewLoadPending = true;
                BeginOperation();
            }
            DebugLog.Write($"prewarm web command ext={lastWebMount.ExtensionId} entry={lastWebMount.Entry}");
            _ = PreWarmCoreAsync(firstPartyExtensionsRoot);
        }
        catch (Exception ex)
        {
            DebugLog.Write("prewarm failed: " + ex.Message);
        }

        async Task PreWarmCoreAsync(string? firstPartyRoot)
        {
            await webViewHost!.ShowAsync(lastWebMount, extensionsRoot, firstPartyRoot);
            webViewHost.ScheduleDiscard();
            webViewHost.PostPageAction("refresh");
            DebugLog.Write("prewarmed web command ext=" + lastWebMount.ExtensionId);
        }
    }

    private void OnWebViewCallRequested(string bridgeId, string extensionId, string method, string? paramsJson, int? timeoutMs)
    {
        var parameters = paramsJson is null
            ? null
            : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(paramsJson);
        sidecar.SendWebCall(bridgeId, extensionId, method, parameters, timeoutMs);
    }

    private void OnWebViewAbortRequested(string bridgeId, string extensionId)
    {
        sidecar.SendWebAbort(bridgeId, extensionId);
    }

    private void OnWebViewLoadFailed(string message)
    {
        ShowToast("Web view error: " + message);
    }

    private void OnWebViewLogEmitted(string message)
    {
        DebugLog.Write("webview: " + message);
        SetStatusBar(message);
    }

    private void OnSidecarWebResult(WebResultMessage message)
    {
        DebugLog.Write($"webResult relay bridgeId={message.BridgeId} ok={message.Ok}");
        Dispatcher.BeginInvoke(() => webViewHost?.PostWebResult(message));
    }

    private void HideWebViewSurface()
    {
        webViewVisible = false;
        // The page stays mounted while hidden and keeps its chrome; the last
        // reported state is restored as soon as the same page is shown again.
        WebViewSurface.Visibility = Visibility.Collapsed;
        // The renderer frees its page after the idle-discard window; ShowAsync
        // re-mounts it fresh before the surface is shown again. The memory
        // target drops immediately (caches trimmed) and Normal is restored on
        // the next ShowAsync.
        if (webviewLoadPending)
        {
            webviewLoadPending = false;
            EndOperation();
        }
        webViewHost?.SetMemoryTargetLow();
        webViewHost?.ScheduleDiscard();
        UpdateFilterDropdown(null);
        // a placeholder the page supplied belongs to that page, not to the root
        if (webViewState?.SearchPlaceholder is { } placeholder)
        {
            SearchPlaceholder.Text = "Search for apps and commands…";
            DebugLog.Write("webview placeholder reset after hide: " + placeholder);
        }
        UpdateFooter();
    }

    private void OnSidecarWindowCommand(WindowCommandMessage message)
    {
        Dispatcher.BeginInvoke(() =>
        {
            switch (message.Command)
            {
                case "closeMainWindow":
                    HideWindow();
                    break;
                case "popToRoot":
                    searchState.ResetToRoot();
                    SetSearchBoxSilently("");
                    UpdateChrome();
                    break;
                case "clearSearchBar":
                    SetSearchBoxSilently("");
                    break;
                default:
                    DebugLog.Write($"unknown window command '{message.Command}' from {message.ExtensionId}");
                    break;
            }
        });
    }

    private void OnSidecarLaunchCommand(LaunchCommandMessage message)
    {
        Dispatcher.BeginInvoke(() => RunCommandFromShortcut(message.ExtensionId, message.CommandId));
    }

    private void OnSidecarUi(UiMessage message)
    {
        Dispatcher.BeginInvoke(DispatcherPriority.ContextIdle, (Action)EndOperation);
        Dispatcher.BeginInvoke(() =>
        {
            currentDetail = null;
            if (message.Tree is null)
            {
                return;
            }
            ApplyViewChrome(message.Tree);
            if (message.Tree is FormTree form)
            {
                HideWebViewSurface();
                ShowForm(form, searchState.ExtensionFor(message.RequestId) ?? searchState.Top?.ExtensionId);
                return;
            }
            HideWebViewSurface();
            currentForm = null;
            if (message.Tree is GridTree grid)
            {
                currentPagination = null;
                ShowGrid(grid);
                return;
            }
            if (message.Tree is DetailTree detail)
            {
                var extensionId = searchState.ExtensionFor(message.RequestId) ?? searchState.Top?.ExtensionId;
                currentPagination = null;
                currentDetail = detail;
                currentDetailExtensionId = extensionId;
                DetailHost.Content = DetailRenderer.Render(detail, action =>
                    sidecar.SendAction(extensionId ?? "", action.Id,
                        new UiItem { Id = detail.Title }));
                DetailHost.Visibility = Visibility.Visible;
                ResultsList.Visibility = Visibility.Collapsed;
                EmptyView.Visibility = Visibility.Collapsed;
                UpdateFooter();
                return;
            }
            DetailHost.Visibility = Visibility.Collapsed;
            if (message.Tree is not ListTree list)
            {
                ShowToast("received a non-list tree (not rendered in this phase)");
                return;
            }
            currentPagination = list.Pagination;
            currentPaginationExtensionId =
                list.Pagination is not null
                    ? searchState.ExtensionFor(message.RequestId) ?? searchState.Top?.ExtensionId
                    : null;
            DebugLog.Write($"UiReceived req={message.RequestId}");
            var rows = searchState.ApplyResult(message.RequestId, list, out var stale);
            if (stale)
            {
                return;
            }
            DetailHost.Visibility = Visibility.Collapsed;
            GridHostPanel.Visibility = Visibility.Collapsed;
            ApplyListLayout(list, searchState.Depth > 1);
            var display = BuildDisplayRows();
            LoadRowIcons(display);
            ApplyRows(display, list.EmptyView);
        });
    }

    private void OnSidecarUiPush(UiPushMessage message)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (message.Tree is null)
            {
                return;
            }
            currentDetail = null;
            if (!searchState.ShouldApplyPush(message, SearchBox.Text))
            {
                DebugLog.Write(
                    $"UiPushDiscarded ext={message.ExtensionId} cmd={message.CommandId} q='{message.Query}'");
                return;
            }
            if (message.Tree is FormTree form)
            {
                HideWebViewSurface();
                ShowForm(form, message.ExtensionId);
                return;
            }
            HideWebViewSurface();
            currentForm = null;
            if (message.Tree is GridTree grid)
            {
                currentPagination = null;
                ShowGrid(grid);
                return;
            }
            if (message.Tree is DetailTree detail)
            {
                currentPagination = null;
                currentDetail = detail;
                currentDetailExtensionId = message.ExtensionId;
                DetailHost.Content = DetailRenderer.Render(detail, action =>
                    sidecar.SendAction(message.ExtensionId, action.Id,
                        new UiItem { Id = detail.Title }));
                DetailHost.Visibility = Visibility.Visible;
                ResultsList.Visibility = Visibility.Collapsed;
                EmptyView.Visibility = Visibility.Collapsed;
                UpdateFooter();
                return;
            }
            if (message.Tree is ListTree list)
            {
                currentPagination = list.Pagination;
                currentPaginationExtensionId =
                    list.Pagination is not null ? message.ExtensionId : null;
                DebugLog.Write($"UiPushApplied ext={message.ExtensionId} cmd={message.CommandId}");
                DetailHost.Visibility = Visibility.Collapsed;
                GridHostPanel.Visibility = Visibility.Collapsed;
                ApplyListLayout(list, allowSidePane: true);
                searchState.PushResult(message.ExtensionId, list);
                var display = BuildDisplayRows();
                LoadRowIcons(display);
                ApplyRows(display, list.EmptyView);
            }
        });
    }

    /// <summary>
    /// The search-bar dropdown belongs to an extension command's view (list or
    /// grid), not to the root aggregate view (extensions each ship their own
    /// filter; the last root result would otherwise decide the dropdown): show
    /// it only past the root depth.
    /// </summary>
    private void UpdateFilterDropdown(UiFilter? filter)
    {
        if (filter is null || searchState.Depth <= 1)
        {
            FilterDropdown.Visibility = Visibility.Collapsed;
            FilterPopup.IsOpen = false;
            return;
        }
        FilterDropdown.Visibility = Visibility.Visible;
        FilterList.ItemsSource = filter.Options.ToList();
        var current = filter.Options.FirstOrDefault(o => o.Value == (searchState.Top?.FilterValue ?? "all"))
            ?? filter.Options.FirstOrDefault();
        FilterLabel.Text = current?.Label ?? "";
        currentFilterValue = current?.Value;
        if (searchState.Top is { } top)
        {
            top.FilterValue = current?.Value;
            top.Query = SearchBox.Text;
        }
    }

    private void ApplyListLayout(ListTree list, bool allowSidePane)
    {
        DebugLog.Write($"ListLayout layout={list.Layout} allow={allowSidePane} depth={searchState.Depth}");
        var sidePane = allowSidePane && list.Layout == "side-pane";        if (sidePane)
        {
            ListColumn.Width = new GridLength(SidePaneListWidth);
            PaneColumn.Width = new GridLength(1, GridUnitType.Star);
            PaneDivider.Visibility = Visibility.Visible;
            PaneHost.Visibility = Visibility.Visible;
        }
        else
        {
            ListColumn.Width = new GridLength(1, GridUnitType.Star);
            PaneColumn.Width = new GridLength(0);
            PaneDivider.Visibility = Visibility.Collapsed;
            PaneHost.Visibility = Visibility.Collapsed;
        }

        UpdateFilterDropdown(list.Filter);
    }

    private const double SidePaneListWidth = 300;

    private void OnFilterButtonClick(object sender, MouseButtonEventArgs e)
    {
        FilterPopup.IsOpen = !FilterPopup.IsOpen;
        if (!FilterPopup.IsOpen || currentFilterValue is null)
        {
            return;
        }
        // a long option list (an extension's language picker, say) opens on the
        // active option instead of at the top
        FilterList.ScrollIntoView(
            FilterList.Items
                .Cast<Protocol.UiFilterOption>()
                .FirstOrDefault(option => option.Value == currentFilterValue));
    }

    private void OnFilterListClick(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource is System.Windows.DependencyObject element)
        {
            while (element is not null && element is not ListBoxItem)
            {
                element = System.Windows.Media.VisualTreeHelper.GetParent(element);
            }
            if (element is ListBoxItem item)
            {
                FilterList.SelectedItem = item.Content;
                e.Handled = true;
            }
        }
    }

    private void OnFilterListSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FilterList.SelectedItem is Protocol.UiFilterOption option)
        {
            FilterLabel.Text = option.Label;
            FilterPopup.IsOpen = false;
            if (searchState.Top is { } top && top.FilterValue != option.Value)
            {
                top.FilterValue = option.Value;
                SendSearch(SearchBox.Text);
            }
        }
    }

    private void UpdatePane()
    {
        PanePreview.Children.Clear();
        PaneInfo.Children.Clear();
        if (PaneHost.Visibility != Visibility.Visible || ResultsList.SelectedItem is not ItemRow row)
        {
            return;
        }
        var pane = row.Item.Pane;
        if (pane is null)
        {
            return;
        }
        if (!string.IsNullOrEmpty(pane.PreviewImageUri) && IconUriPolicy.TryGetLocalPath(pane.PreviewImageUri, out var imagePath) && File.Exists(imagePath))
        {
            try
            {
                var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                bitmap.DecodePixelWidth = 320;
                bitmap.UriSource = new Uri(imagePath);
                bitmap.EndInit();
                bitmap.Freeze();
                PanePreview.Children.Add(new System.Windows.Controls.Image
                {
                    Source = bitmap,
                    MaxHeight = 200,
                    HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                    Margin = new Thickness(0, 0, 0, 12),
                });
            }
            catch
            {
                /* preview image is best-effort */
            }
        }
        else if (!string.IsNullOrEmpty(pane.Preview))
        {
            var preview = new System.Windows.Controls.TextBlock
            {
                Text = pane.Preview,
                TextWrapping = TextWrapping.Wrap,
                FontFamily = new System.Windows.Media.FontFamily("Consolas"),
                FontSize = 13,
            };
            preview.SetResourceReference(System.Windows.Controls.TextBlock.ForegroundProperty, "TextPrimaryBrush");
            preview.Margin = new Thickness(0, 0, 0, 12);
            PanePreview.Children.Add(preview);
        }
        if (pane.Fields is { Count: > 0 } fields)
        {
            var divider = new System.Windows.Controls.Border();
            divider.SetResourceReference(System.Windows.Controls.Border.BorderBrushProperty, "DividerBrush");
            divider.BorderThickness = new Thickness(0, 1, 0, 0);
            divider.Margin = new Thickness(0, 4, 0, 4);
            PaneInfo.Children.Add(divider);
            foreach (var field in fields)
            {
                var line = new System.Windows.Controls.Grid { Margin = new Thickness(0, 6, 0, 6) };
                line.ColumnDefinitions.Add(new System.Windows.Controls.ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                line.ColumnDefinitions.Add(new System.Windows.Controls.ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var label = new System.Windows.Controls.TextBlock { Text = field.Label, VerticalAlignment = VerticalAlignment.Center };
                label.SetResourceReference(System.Windows.Controls.TextBlock.ForegroundProperty, "PaneLabelBrush");
                label.SetResourceReference(System.Windows.Controls.TextBlock.FontSizeProperty, "SecondaryFontSize");
                var valueHost = new System.Windows.Controls.StackPanel
                {
                    Orientation = System.Windows.Controls.Orientation.Horizontal,
                    VerticalAlignment = VerticalAlignment.Center,
                    HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
                };
                if (!string.IsNullOrEmpty(field.ValueIconUri) && IconUriPolicy.TryGetLocalPath(field.ValueIconUri, out var valueIconPath) && File.Exists(valueIconPath))
                {
                    try
                    {
                        var iconBitmap = new System.Windows.Media.Imaging.BitmapImage();
                        iconBitmap.BeginInit();
                        iconBitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                        iconBitmap.DecodePixelWidth = 28;
                        iconBitmap.UriSource = new Uri(valueIconPath);
                        iconBitmap.EndInit();
                        iconBitmap.Freeze();
                        valueHost.Children.Add(new System.Windows.Controls.Image
                        {
                            Source = iconBitmap,
                            Width = 14,
                            Height = 14,
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(0, 0, 6, 0),
                        });
                    }
                    catch
                    {
                        /* value icons are best-effort */
                    }
                }
                var value = new System.Windows.Controls.TextBlock { Text = field.Value, VerticalAlignment = VerticalAlignment.Center };
                value.SetResourceReference(System.Windows.Controls.TextBlock.ForegroundProperty, "TextPrimaryBrush");
                value.SetResourceReference(System.Windows.Controls.TextBlock.FontSizeProperty, "SecondaryFontSize");
                valueHost.Children.Add(value);
                System.Windows.Controls.Grid.SetColumn(label, 0);
                System.Windows.Controls.Grid.SetColumn(valueHost, 1);
                line.Children.Add(label);
                line.Children.Add(valueHost);
                PaneInfo.Children.Add(line);
            }
        }
    }

    private void ShowGrid(GridTree tree)
    {
        gridItems = (tree.Sections is { Count: > 0 }
            ? tree.Sections.SelectMany(s => s.Items)
            : tree.Items).ToList();
        gridColumns = Math.Max(1, tree.Columns);
        gridIndex = gridItems.Count > 0 ? 0 : -1;
        var cellSize = Math.Clamp(
            Math.Floor((ContentWidth - (gridColumns - 1) * CellGap) / gridColumns),
            MinCellSize, MaxCellSize);
        var rows = new List<object>();
        gridCells = new List<GridCellVm>();
        var groups = tree.Sections is { Count: > 0 }
            ? tree.Sections.Select(s => (Header: s.Title ?? "", Subtitle: s.Subtitle ?? "", Items: (IReadOnlyList<UiItem>)s.Items))
                .ToList()
            : new List<(string, string, IReadOnlyList<UiItem>)> { ("", "", gridItems) };
        foreach (var (header, headerSubtitle, items) in groups)
        {
            if (items.Count == 0)
            {
                continue;
            }
            if (header.Length > 0 || headerSubtitle.Length > 0)
            {
                rows.Add(new GridHeaderRowVm { Title = header, Subtitle = headerSubtitle });
            }
            GridRowVm? currentRow = null;
            foreach (var item in items)
            {
                var cell = new GridCellVm
                {
                    Item = item,
                    FlatIndex = gridCells.Count,
                    CellSize = cellSize,
                    GlyphSize = Math.Floor(cellSize * 0.42),
                    IconSize = Math.Floor(cellSize * 0.45),
                    CellBackground = (System.Windows.Media.Brush)FindResource("CellBackgroundBrush"),
                    Title = item.Title,
                    Subtitle = item.Subtitle ?? "",
                    ImageDisplaySize = string.IsNullOrEmpty(item.IconUri)
                        ? Math.Floor(cellSize * 0.55)
                        : cellSize,
                    VectorIconFilled = false,
                };
                ApplyVectorIcon(cell, item);
                gridCells.Add(cell);
                if (currentRow is null || currentRow.Cells.Count >= gridColumns)
                {
                    currentRow = new GridRowVm();
                    rows.Add(currentRow);
                }
                currentRow.Cells.Add(cell);
            }
        }
        if (gridCells.Count > 0)
        {
            gridCells[0].Selected = true;
        }
        GridHost.ItemsSource = rows;
        UpdateFilterDropdown(tree.Filter);
        GridTitleText.Text = tree.Title ?? "";
        GridTitleText.Visibility = string.IsNullOrEmpty(tree.Title) ? Visibility.Collapsed : Visibility.Visible;
        LoadGridBitmaps();
        var missing = gridItems.Select(i => i.Icon).Where(icon => !string.IsNullOrEmpty(icon) && !EmojiSpriteRenderer.IsCached(icon)).Distinct().ToList();
        if (missing.Count > 0)
        {
            var thread = new Thread(() =>
            {
                var ok = EmojiSpriteRenderer.EnsureSprites(
                    missing,
                    () => Dispatcher.BeginInvoke(LoadGridBitmaps));
                Dispatcher.BeginInvoke(() =>
                {
                    if (!ok)
                    {
                        ShowToast("color emoji rendering unavailable (Edge not found) — using monochrome");
                    }
                });
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
        }
        GridHostPanel.Visibility = Visibility.Visible;
        ResultsList.Visibility = Visibility.Collapsed;
        DetailHost.Visibility = Visibility.Collapsed;
        if (gridItems.Count == 0)
        {
            GridHost.Visibility = Visibility.Collapsed;
            EmptyView.Visibility = Visibility.Visible;
            EmptyTitle.Text = tree.EmptyView?.Title ?? "No results";
            EmptyDescription.Text = tree.EmptyView?.Description ?? "";
        }
        else
        {
            GridHost.Visibility = Visibility.Visible;
            EmptyView.Visibility = Visibility.Collapsed;
        }
        UpdateFooter();
    }

    private double ContentWidth => ActualWidth > 0 ? ActualWidth - 16 : 718;
    private const double CellGap = 2;
    private const double MinCellSize = 48;
    private const double MaxCellSize = 160;

    /// <summary>
    /// The directory an extension's manifest-referenced files live in — the
    /// installed package directory, or the first-party extensions folder.
    /// </summary>
    private string? AssetsDirFor(string extensionId) =>
        ExtensionAssets.AssetsDirFor(extensionId, repoRoot, id => installedExtensionsStore.Get(id)?.InstallPath);

    /// <summary>
    /// Loads an extension-shipped image icon (manifest `icon: "command-icon.png"`),
    /// falling back to the extension icon when the command declares none.
    /// </summary>
    private System.Windows.Media.Imaging.BitmapImage? LoadExtensionImageIcon(string extensionId, string? commandIcon, string? extensionIcon)
    {
        var assetsDir = AssetsDirFor(extensionId);
        if (assetsDir is null)
        {
            return null;
        }
        return ExtensionAssets.LoadIcon(assetsDir, commandIcon)
            ?? ExtensionAssets.LoadIcon(assetsDir, extensionIcon);
    }

    /// <summary>
    /// The directory an extension's manifest-referenced files live in — the
    /// installed package directory, or the first-party extensions folder.
    /// Exposed for settings, which renders the same brand marks.
    /// </summary>
    public Func<string, string?> AssetsDirResolver => AssetsDirFor;

    /// <summary>
    /// Resolves a grid cell's vector icon from the generic icon fields:
    /// IconSvg (arbitrary SVG content, tinted) or IconName (the built-in
    /// Lucide set), falling back to the primary text color.
    /// </summary>
    private void ApplyVectorIcon(GridCellVm cell, UiItem item)
    {
        if (item.IconSvg is not null)
        {
            cell.VectorIcon = Rendering.SvgIcon.FromContent(item.IconSvg);
            cell.VectorIconBrush = Rendering.LucideIcon.ColorFromHex(
                item.IconColor,
                (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"));
            return;
        }
        if (item.IconName is not null)
        {
            cell.VectorIcon = Rendering.LucideIcon.Load(item.IconName);
            cell.VectorIconBrush = Rendering.LucideIcon.ColorFromHex(
                item.IconColor,
                (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"));
        }
    }

    private void LoadGridBitmaps()
    {
        LoadGridBitmapsChunk(0);
    }

    private void LoadGridBitmapsChunk(int start)
    {
        if (start >= gridCells.Count)
        {
            return;
        }
        var end = Math.Min(start + 64, gridCells.Count);
        for (var i = start; i < end; i++)
        {
            gridCells[i].Bitmap = LoadCellBitmap(gridCells[i].Item);
        }
        if (end < gridCells.Count)
        {
            Dispatcher.BeginInvoke(DispatcherPriority.Background, () => LoadGridBitmapsChunk(end));
        }
    }

    private System.Windows.Media.Imaging.BitmapImage? LoadCellBitmap(UiItem item)
    {
        if (!string.IsNullOrEmpty(item.IconUri))
        {
            if (IconUriPolicy.TryGetLocalPath(item.IconUri, out var uriPath) && File.Exists(uriPath))
            {
                return LoadBitmapFromPath(uriPath, 320);
            }
            if (IconUriPolicy.DecodeDataUri(item.IconUri) is { } bytes)
            {
                try
                {
                    return LoadBitmapFromBytes(bytes);
                }
                catch
                {
                    return null;
                }
            }
            return null;
        }
        if (string.IsNullOrEmpty(item.Icon))
        {
            return null;
        }
        var path = EmojiSpriteRenderer.CachePathFor(item.Icon);
        if (!File.Exists(path))
        {
            return null;
        }
        return LoadBitmapFromPath(path, 96);
    }

    private System.Windows.Media.Imaging.BitmapImage LoadBitmapFromPath(string path)
    {
        return LoadBitmapFromPath(path, 32);
    }

    private System.Windows.Media.Imaging.BitmapImage LoadBitmapFromPath(string path, int decodePixelWidth)
    {
        var image = new System.Windows.Media.Imaging.BitmapImage();
        image.BeginInit();
        image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        image.DecodePixelWidth = decodePixelWidth;
        image.UriSource = new Uri(path);
        image.EndInit();
        image.Freeze();
        return image;
    }

    private System.Windows.Media.Imaging.BitmapImage LoadBitmapFromBytes(byte[] bytes)
    {
        var image = new System.Windows.Media.Imaging.BitmapImage();
        image.BeginInit();
        image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        image.DecodePixelWidth = 32;
        image.StreamSource = new MemoryStream(bytes);
        image.EndInit();
        image.Freeze();
        return image;
    }

    private bool HandleGridKeys(KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Left:
                MoveGrid(-1, 0);
                return true;
            case Key.Right:
                MoveGrid(1, 0);
                return true;
            case Key.Up:
                MoveGrid(0, -1);
                return true;
            case Key.Down:
                MoveGrid(0, 1);
                return true;
            case Key.PageDown:
                MoveGrid(0, 3);
                return true;
            case Key.PageUp:
                MoveGrid(0, -3);
                return true;
            case Key.Home when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                MoveGridEdge(-1);
                return true;
            case Key.End when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                MoveGridEdge(1);
                return true;
            case Key.Enter:
                RunGridPrimary();
                return true;
            case Key.K when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenGridActionPanel();
                return true;
            case Key.OemComma when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                OpenSettings();
                return true;
            case Key.Escape:
                PerformEscape();
                return true;
            default:
                return TryRunActionShortcut(e);
        }
    }

    private void MoveGridEdge(int direction)
    {
        if (gridCells.Count == 0)
        {
            return;
        }
        var target = direction < 0 ? 0 : gridCells.Count - 1;
        if (target == gridIndex)
        {
            return;
        }
        gridCells[gridIndex].Selected = false;
        gridIndex = target;
        gridCells[gridIndex].Selected = true;
        var row = GridMath.RowOf(gridIndex, gridColumns);
        if (row >= 0 && row < GridHost.Items.Count)
        {
            GridHost.ScrollIntoView(GridHost.Items[row]);
        }
        UpdateFooter();
    }

    private void OnGridCellClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is Border { Tag: int flat } && flat < gridCells.Count)
        {
            gridCells[gridIndex >= 0 && gridIndex < gridCells.Count ? gridIndex : 0].Selected = false;
            gridIndex = flat;
            gridCells[gridIndex].Selected = true;
            UpdateFooter();
            RunGridPrimary();
        }
    }

    private void MoveGrid(int dx, int dy)
    {
        if (gridIndex < 0 || gridIndex >= gridCells.Count)
        {
            return;
        }
        var target = GridMath.Move(gridIndex, gridItems.Count, gridColumns, dx, dy);
        if (target < 0)
        {
            return;
        }
        gridCells[gridIndex].Selected = false;
        gridIndex = target;
        gridCells[gridIndex].Selected = true;
        var row = GridMath.RowOf(gridIndex, gridColumns);
        if (row >= 0 && row < GridHost.Items.Count)
        {
            GridHost.ScrollIntoView(GridHost.Items[row]);
        }
        UpdateFooter();
    }

    private void RunGridPrimary()
    {
        if (gridIndex < 0 || gridIndex >= gridItems.Count)
        {
            return;
        }
        var item = gridItems[gridIndex];
        var extensionId = searchState.Top?.ExtensionId;
        if (extensionId is null)
        {
            return;
        }
        var action = item.Actions?.FirstOrDefault(a => a.Primary == true) ?? item.Actions?.FirstOrDefault();
        if (action is null)
        {
            return;
        }
        sidecar.SendAction(extensionId, action.Id, item);
        HideWindow();
    }

    private FrameworkElement CreateExtensionIcon(ReadyExtension? extension)
    {
        if (extension is not null && Rendering.BrandIcons.TryGetDrawing(extension.Id, out var brandDrawing))
        {
            var image = new System.Windows.Controls.Image
            {
                Source = brandDrawing,
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        if (extension is not null && Rendering.BrandIcons.TryGet(extension.Id, out var geometry, out var brush))
        {
            var drawing = new System.Windows.Media.GeometryDrawing
            {
                Geometry = geometry,
                Brush = brush,
            };
            var imageSource = new System.Windows.Media.DrawingImage { Drawing = drawing };
            var image = new System.Windows.Controls.Image
            {
                Source = imageSource,
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        if (extension is not null && Rendering.BrandIcons.TryGetBitmap(extension.Id, out var brandBitmap))
        {
            var image = new System.Windows.Controls.Image
            {
                Source = brandBitmap,
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        if (extension is not null
            && LoadExtensionImageIcon(extension.Id, extension.Icon, extension.Icon) is { } extensionImage)
        {
            var image = new System.Windows.Controls.Image
            {
                Source = extensionImage,
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        if (extension is not null && extension.Icon is not null
            && Rendering.LucideIcon.Load(extension.Icon) is { } lucideGeometry)
        {
            var drawing = new System.Windows.Media.GeometryDrawing
            {
                Geometry = lucideGeometry,
                Brush = FindResource("TextSecondaryBrush") as System.Windows.Media.Brush,
            };
            var image = new System.Windows.Controls.Image
            {
                Source = new System.Windows.Media.DrawingImage { Drawing = drawing },
                VerticalAlignment = VerticalAlignment.Center,
            };
            image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
            return image;
        }
        return CreateEmojiIcon(extension?.Icon);
    }

    private FrameworkElement CreateEmojiIcon(string? emoji)
    {
        if (!string.IsNullOrEmpty(emoji) && EmojiSpriteRenderer.IsCached(emoji))
        {
            try
            {
                var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                bitmap.DecodePixelWidth = 32;
                bitmap.UriSource = new Uri(EmojiSpriteRenderer.CachePathFor(emoji));
                bitmap.EndInit();
                bitmap.Freeze();
                var image = new System.Windows.Controls.Image { Source = bitmap, VerticalAlignment = VerticalAlignment.Center };
                image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
                return image;
            }
            catch
            {
                /* fall through to the text glyph */
            }
        }
        var text = new TextBlock { Text = emoji ?? "", VerticalAlignment = VerticalAlignment.Center };
        text.SetResourceReference(TextBlock.FontSizeProperty, "FooterIconSize");
        return text;
    }

    private static bool IsEmojiRune(System.Text.Rune rune) =>
        rune.Value >= 0x1F000
        || (rune.Value >= 0x2600 && rune.Value <= 0x27BF)
        || rune.Value == 0xFE0F
        || rune.Value == 0x2B50
        || rune.Value == 0x2B55;

    private void LoadRowIcons(IReadOnlyList<UiRow> rows)
    {
        LoadRowIconsChunk(rows, 0);
    }

    private void LoadRowIconsChunk(IReadOnlyList<UiRow> rows, int start)
    {
        if (start >= rows.Count)
        {
            return;
        }
        var end = Math.Min(start + 16, rows.Count);
        for (var i = start; i < end; i++)
        {
            if (rows[i] is not ItemRow row || row.Item.IconUri is null)
            {
                continue;
            }
            var uri = row.Item.IconUri;
            try
            {
                if (IconUriPolicy.TryGetLocalPath(uri, out var path) && File.Exists(path))
                {
                    var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                    bitmap.BeginInit();
                    bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                    bitmap.DecodePixelWidth = 32;
                    bitmap.UriSource = new Uri(path);
                    bitmap.EndInit();
                    bitmap.Freeze();
                    row.Bitmap = bitmap;
                }
                else if (IconUriPolicy.DecodeDataUri(uri) is { } bytes)
                {
                    var image = new System.Windows.Media.Imaging.BitmapImage();
                    image.BeginInit();
                    image.DecodePixelWidth = 32;
                    image.StreamSource = new MemoryStream(bytes);
                    image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                    image.EndInit();
                    image.Freeze();
                    row.Bitmap = image;
                }
            }
            catch
            {
                row.Bitmap = null;
            }
        }
        if (end < rows.Count)
        {
            Dispatcher.BeginInvoke(DispatcherPriority.Background, () => LoadRowIconsChunk(rows, end));
        }
    }

    private IReadOnlyList<UiRow> AppendLoadMore(IReadOnlyList<UiRow> rows)
    {
        if (currentPagination is null)
        {
            return rows;
        }
        var list = rows.ToList();
        list.Add(LoadMoreRow.Instance);
        return list;
    }

    private void ApplyRows(IReadOnlyList<UiRow> rows, UiEmptyView? emptyView)
    {
        ResultsList.ItemsSource = rows;
        if (rows.Count == 0)
        {
            ResultsList.Visibility = Visibility.Collapsed;
            EmptyView.Visibility = Visibility.Visible;
            EmptyTitle.Text = emptyView?.Title ?? "No results";
            EmptyDescription.Text = emptyView?.Description ?? "";
        }
        else
        {
            ResultsList.Visibility = Visibility.Visible;
            EmptyView.Visibility = Visibility.Collapsed;
            var first = RowBuilder.FirstItemIndex(rows);
            if (first >= 0)
            {
                ResultsList.SelectedIndex = first;
                ResultsList.ScrollIntoView(rows[first]);
            }
        }
    }

    private void UpdateEmptyView(string title, string description)
    {
        ResultsList.Visibility = Visibility.Collapsed;
        EmptyView.Visibility = Visibility.Visible;
        EmptyTitle.Text = title;
        EmptyDescription.Text = description;
    }

    private void OnSidecarError(ErrorMessage message)
    {
        EndOperation();
        Dispatcher.BeginInvoke(() =>
        {
            ShowToast(message.Error.Message, message.Error.Code, true);
            SetStatusBar($"error: {message.Error.Code}");
        });
    }

    private NativeCallOutcome ExecuteAppsList(Dictionary<string, JsonElement>? parameters)
    {
        var query = parameters is not null && parameters.TryGetValue("query", out var q) && q.ValueKind == JsonValueKind.String
            ? q.GetString() ?? ""
            : "";
        var pixelSize = (int)Math.Round(VisualTreeHelper.GetDpi(this).PixelsPerDip * 32);
        var apps = appLauncher.List(query, pixelSize);
        var payload = apps.Select(a =>
        {
            var item = new Dictionary<string, object?>
            {
                ["id"] = a.Entry.Id,
                ["name"] = a.Entry.Name,
                ["launchCount"] = appLauncher.GetLaunchCount(a.Entry.Id),
            };
            if (a.Item2 is not null)
            {
                item["iconUri"] = new Uri(a.Item2).AbsoluteUri;
            }
            return item;
        }).ToList();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { apps = payload }));
    }

    private NativeCallOutcome ExecuteClipboardRead()
    {
        try
        {
            var content = ClipboardService.ReadContent();
            var text = content.Text ?? clipboardHistory.Latest();
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
            {
                text,
                html = content.Html,
                paths = content.Paths,
            }));
        }
        catch (InvalidOperationException ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
    }

    private NativeCallOutcome ExecuteClipboardClear()
    {
        try
        {
            ClipboardService.Clear();
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (InvalidOperationException ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
    }

    private NativeCallOutcome ExecuteAppsFrontmost()
    {
        var app = DesktopAppsService.GetFrontmost();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { app = app is null ? null : new
        {
            id = app.Id,
            name = app.Name,
            path = app.Path,
        } }));
    }

    private NativeCallOutcome ExecuteAppsDefault(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("path", out var pathElement) || pathElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "apps.default requires a string 'path' parameter");
        }
        var executable = DesktopAppsService.DefaultExecutableFor(pathElement.GetString() ?? "");
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { path = executable }));
    }

    private NativeCallOutcome ExecuteSystemSelectedText(Dictionary<string, JsonElement>? parameters)
    {
        var allowFallback = parameters is not null
            && parameters.TryGetValue("allowFallback", out var fallbackElement)
            && fallbackElement.ValueKind == JsonValueKind.True;
        var text = SelectedTextService.GetSelectedText(allowFallback);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { text }));
    }

    private NativeCallOutcome ExecuteClipboardHistory(Dictionary<string, JsonElement>? parameters)
    {
        var query = parameters is not null && parameters.TryGetValue("query", out var q) && q.ValueKind == JsonValueKind.String
            ? q.GetString() ?? ""
            : "";
        var limit = parameters is not null && parameters.TryGetValue("limit", out var l) && l.ValueKind == JsonValueKind.Number
            ? l.GetInt32()
            : 50;
        var items = clipboardHistory.Query(query, limit)
            .Select(e => new Dictionary<string, object?>
            {
                ["id"] = ClipboardHistoryStore.ComputeEntryId(e),
                ["text"] = e.Kind == "image" ? "" : e.Text,
                ["timestamp"] = e.TimestampUnixMs,
                ["kind"] = e.Kind,
                ["iconUri"] = clipboardHistory.ThumbnailUriFor(e),
                ["previewImageUri"] = clipboardHistory.PreviewUriFor(e),
                ["source"] = e.SourceApp,
                ["sourceIconUri"] = e.SourceIconUri,
                ["width"] = e.ImageWidth,
                ["height"] = e.ImageHeight,
                ["sizeBytes"] = e.SizeBytes,
            })
            .ToList();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { items }));
    }

    private const double FooterHeightValue = 40;

    private NativeCallOutcome ExecuteClipboardPasteEntry(Dictionary<string, JsonElement>? parameters)
    {
        var outcome = ExecuteClipboardCopyEntry(parameters);
        if (outcome.Ok)
        {
            Dispatcher.BeginInvoke(() =>
            {
                HideWindow();
                var thread = new Thread(PasteKeystrokeToForeground);
                thread.IsBackground = true;
                thread.Start();
            });
        }
        return outcome;
    }

    private void PasteKeystrokeToForeground()
    {
        Thread.Sleep(150);
        keybd_event(0x11, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    private const uint KEYEVENTF_KEYUP = 0x0002;

    private NativeCallOutcome ExecuteClipboardEditEntry(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("id", out var id) || id.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "clipboard.editEntry requires a string 'id' parameter");
        }
        var entry = clipboardHistory.GetById(id.GetString()!);
        if (entry is null)
        {
            return NativeCallOutcome.Failure("entryNotFound", "no clipboard history entry matches the given id");
        }
        try
        {
            string path;
            if (entry.Kind == "image" && entry.ImagePath is not null)
            {
                path = entry.ImagePath;
            }
            else
            {
                var tempDir = Path.Combine(AppLauncherService.DataDirectory, "temp");
                Directory.CreateDirectory(tempDir);
                path = Path.Combine(tempDir, "clipboard-" + id.GetString()! + ".txt");
                File.WriteAllText(path, entry.Text);
            }
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
            Dispatcher.BeginInvoke(HideWindow);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
    }

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    private NativeCallOutcome ExecuteClipboardCopyEntry(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("id", out var id) || id.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "clipboard.copyEntry requires a string 'id' parameter");
        }
        var entry = clipboardHistory.GetById(id.GetString()!);
        if (entry is null)
        {
            return NativeCallOutcome.Failure("entryNotFound", "no clipboard history entry matches the given id");
        }
        try
        {
            if (entry.Kind == "image" && entry.ImagePath is not null)
            {
                using var image = System.Drawing.Image.FromFile(entry.ImagePath);
                System.Windows.Forms.Clipboard.SetImage(image);
            }
            else if (entry.Kind == "file")
            {
                var list = new System.Collections.Specialized.StringCollection();
                list.AddRange(entry.Text.Split('\n'));
                System.Windows.Forms.Clipboard.SetFileDropList(list);
            }
            else
            {
                ClipboardService.WriteText(entry.Text);
            }
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
    }

    private NativeCallOutcome ExecuteClipboardDelete(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("id", out var id) || id.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "clipboard.deleteEntry requires a string 'id' parameter");
        }
        return clipboardHistory.Delete(id.GetString()!)
            ? NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }))
            : NativeCallOutcome.Failure("entryNotFound", "no clipboard history entry matches the given id");
    }

    /// <summary>
    /// Writes arbitrary text to the clipboard and pastes it into the
    /// foreground application (the generic form of clipboard.pasteEntry).
    /// </summary>
    private NativeCallOutcome ExecuteClipboardPaste(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("text", out var text) || text.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "clipboard.paste requires a string 'text' parameter");
        }
        try
        {
            ClipboardService.WriteText(text.GetString()!);
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
        Dispatcher.BeginInvoke(() =>
        {
            HideWindow();
            var thread = new Thread(PasteKeystrokeToForeground);
            thread.IsBackground = true;
            thread.Start();
        });
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome ExecuteAppsLaunch(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("id", out var id) || id.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "apps.launch requires a string 'id' parameter");
        }
        try
        {
            appLauncher.Launch(id.GetString()!);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (KeyNotFoundException)
        {
            return NativeCallOutcome.Failure("appNotFound", $"no app with id '{id.GetString()}' is cached");
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("launchFailed", ex.Message);
        }
    }

    private void OnNativeCallRequested(string requestId, string extensionId, string method, Dictionary<string, JsonElement>? parameters)
    {
        DebugLog.Write($"NativeCall req={requestId} ext={extensionId} method={method}");
        BeginOperation();
        // Effective declarations: ready-reported for first-party extensions,
        // on-disk manifest ∩ user consent for installed ones.
        var declarations = extensionPolicy.DeclarationsFor(extensionId);
        var declared = declarations?.NativeMethods ?? (IReadOnlyList<string>)Array.Empty<string>();
        if (!NativeMethodPolicy.IsDeclared(declared, method))
        {
            CompleteNativeCall(requestId, method, NativeCallOutcome.Failure(
                "methodNotDeclared",
                $"extension did not declare native method '{method}' in its manifest"));
            return;
        }

        if (method == "http.fetch")
        {
            var hosts = declarations?.HttpHosts ?? (IReadOnlyList<string>)Array.Empty<string>();
            string? authProvider = parameters is not null
                && parameters.TryGetValue("auth", out var authElement)
                && authElement.ValueKind == JsonValueKind.String
                    ? authElement.GetString()
                    : null;
            if (authProvider is not null)
            {
                var declaredOauth = declarations?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
                if (!declaredOauth.Contains(authProvider, StringComparer.Ordinal))
                {
                    CompleteNativeCall(requestId, method, NativeCallOutcome.Failure(
                        "providerNotDeclared",
                        $"extension did not declare oauth provider '{authProvider}' in its manifest"));
                    return;
                }
            }
            _ = Task.Run(async () =>
            {
                var outcome = await httpFetch.FetchAsync(parameters, hosts, CancellationToken.None, ResolveAuth);
                CompleteNativeCall(requestId, method, outcome);
            });
            return;
        }

        if (method == "http.upload")
        {
            var hosts = declarations?.HttpHosts ?? (IReadOnlyList<string>)Array.Empty<string>();
            _ = Task.Run(async () =>
            {
                var outcome = await httpFetch.UploadAsync(parameters, hosts, CancellationToken.None);
                CompleteNativeCall(requestId, method, outcome);
            });
            return;
        }

        if (method is "oauth.authorize" or "oauth.status" or "image.fetch")
        {
            var hosts = declarations?.HttpHosts ?? (IReadOnlyList<string>)Array.Empty<string>();
            var declaredOauth = declarations?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
            _ = Task.Run(async () =>
            {
                var outcome = method switch
                {
                    "oauth.authorize" => await oauthService.AuthorizeAsync(extensionId, parameters, declaredOauth, CancellationToken.None),
                    "oauth.status" => await oauthService.StatusAsync(extensionId, parameters, declaredOauth, CancellationToken.None),
                    _ => await imageFetch.FetchAsync(extensionId, parameters, hosts, CancellationToken.None),
                };
                CompleteNativeCall(requestId, method, outcome);
            });
            return;
        }

        if (method.StartsWith("secrets.", StringComparison.Ordinal) || method == "oauth.disconnect")
        {
            var declaredOauth = declarations?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
            var outcome = method == "oauth.disconnect"
                ? oauthService.Disconnect(extensionId, parameters, declaredOauth)
                : secretsStore.Handle(extensionId, method, parameters);
            CompleteNativeCall(requestId, method, outcome);
            return;
        }

        if (method.StartsWith("storage.", StringComparison.Ordinal))
        {
            var outcome = extensionStorageStore.Handle(extensionId, method, parameters);
            CompleteNativeCall(requestId, method, outcome);
            return;
        }

        if (method.StartsWith("cache.", StringComparison.Ordinal))
        {
            var outcome = extensionCacheStore.Handle(extensionId, method, parameters);
            CompleteNativeCall(requestId, method, outcome);
            return;
        }

        if (method.StartsWith("fs.", StringComparison.Ordinal) || method is "shell.openPath" or "shell.revealPath")
        {
            var scopes = FsPolicy.InterpolateAll(
                declarations?.FsPaths ?? (IReadOnlyList<string>)Array.Empty<string>(),
                PreferenceStringsFor(extensionId));
            if (method.StartsWith("fs.", StringComparison.Ordinal))
            {
                var outcome = extensionFsService.Handle(extensionId, method, parameters, scopes);
                CompleteNativeCall(requestId, method, outcome);
                return;
            }
            if (method == "shell.openPath")
            {
                CompleteNativeCall(requestId, method, ExecuteShellPath(parameters, scopes, reveal: false));
                return;
            }
            CompleteNativeCall(requestId, method, ExecuteShellPath(parameters, scopes, reveal: true));
            return;
        }

        if (method == "shell.openUrl")
        {
            CompleteNativeCall(requestId, method, ExecuteShellOpenUrl(parameters, declarations?.UriSchemes));
            return;
        }

        _ = Dispatcher.InvokeAsync(() =>
        {
            var outcome = nativeMethods.Execute(method, declared, parameters);
            CompleteNativeCall(requestId, method, outcome);
        });

        AuthedFetchContext? ResolveAuth(string provider)
        {
            var definition = OAuthProviderRegistry.Load().GetValueOrDefault(provider);
            if (definition is null)
            {
                return null;
            }
            return new AuthedFetchContext(
                definition.PinnedHost,
                ct => oauthService.GetAccessTokenAsync(extensionId, provider, ct),
                ct => oauthService.ForceRefreshAsync(extensionId, provider, ct));
        }
    }

    private void CompleteNativeCall(string requestId, string method, NativeCallOutcome outcome)
    {
        DebugLog.Write($"NativeCall outcome ok={outcome.Ok} code={outcome.Error?.Code ?? "none"}");
        EndOperation();
        if (!outcome.Ok)
        {
            Dispatcher.BeginInvoke(() => ShowToast($"Native method '{method}' failed", outcome.Error?.Message, true));
        }
        sidecar.SendNativeResult(requestId, outcome);
    }

    private void ScrollDetail(double delta)
    {
        if (DetailHost.Content is ScrollViewer scroller)
        {
            scroller.ScrollToVerticalOffset(scroller.VerticalOffset + delta);
        }
    }

    private NativeCallOutcome ExecuteMediaControl(Dictionary<string, JsonElement>? parameters)
    {
        var command = parameters is not null
            && parameters.TryGetValue("command", out var commandElement)
            && commandElement.ValueKind == JsonValueKind.String
                ? commandElement.GetString()
                : null;
        switch (command)
        {
            case "playPause":
                mediaSessions.TogglePlayPause();
                break;
            case "next":
                mediaSessions.Next();
                break;
            case "previous":
                mediaSessions.Previous();
                break;
            default:
                return NativeCallOutcome.Failure("invalidCommand", $"unknown media control command '{command ?? "<missing>"}'");
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome ExecuteToastShow(Dictionary<string, JsonElement>? parameters)
    {
        if (!ToastService.TryParseRequest(parameters, out var toastRequest, out var toastError))
        {
            return NativeCallOutcome.Failure("invalidParams", toastError ?? "invalid toast.show parameters");
        }
        toastWindow ??= new ToastWindow();
        toastWindow.ShowToast(toastRequest!);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome ExecuteAlertConfirm(Dictionary<string, JsonElement>? parameters)
    {
        if (!AlertService.TryParseRequest(parameters, out var alertRequest, out var alertError))
        {
            return NativeCallOutcome.Failure("invalidParams", alertError ?? "invalid alert.confirm parameters");
        }
        var dialog = new ExtensionAlertDialog(alertRequest!);
        var confirmed = dialog.ShowDialog() == true;
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { confirmed }));
    }

    private NativeCallOutcome ExecuteHudShow(Dictionary<string, JsonElement>? parameters)
    {
        if (!HudService.TryParseRequest(parameters, out var request, out var error))
        {
            return NativeCallOutcome.Failure("invalidParams", error ?? "invalid hud.show parameters");
        }
        if (IsVisible)
        {
            HideWindow();
        }
        hudWindow ??= new HudWindow();
        hudWindow.ShowHud(request!);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome ExecuteShellOpenUrl(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> uriSchemes)
    {
        if (parameters is null || !parameters.TryGetValue("url", out var urlElement) || urlElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "shell.openUrl requires a string 'url' parameter");
        }
        var url = urlElement.GetString() ?? "";
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.HostNameType == UriHostNameType.Basic)
        {
            return NativeCallOutcome.Failure("invalidParams", "shell.openUrl requires an absolute URI");
        }
        var schemeAllowed = uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps
            || uriSchemes.Contains(uri.Scheme, StringComparer.OrdinalIgnoreCase);
        if (!schemeAllowed)
        {
            return NativeCallOutcome.Failure(
                "schemeNotDeclared",
                $"extension did not declare the URI scheme '{uri.Scheme}' in its manifest");
        }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("openFailed", ex.Message);
        }
    }

    /// <summary>
    /// Opens a user-created target (quicklink style): http/https URLs go to
    /// the browser, anything else must be an existing file or folder. The
    /// `shell.open` capability itself is the consent surface.
    /// </summary>
    private NativeCallOutcome ExecuteShellOpen(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("target", out var targetElement) || targetElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "shell.open requires a string 'target' parameter");
        }
        var target = targetElement.GetString() ?? "";
        if (!ShellOpenService.IsHttpUrl(target) && !File.Exists(target) && !Directory.Exists(target))
        {
            return NativeCallOutcome.Failure("pathNotFound", $"target '{target}' is neither an http(s) URL nor an existing file or folder");
        }
        return ShellOpenService.Open(target) is { } error
            ? NativeCallOutcome.Failure(error, "the system refused to open the target")
            : NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome ExecuteWindowsList()
    {
        var windows = WindowEnumerationService.List();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
        {
            windows = windows.Select(w => new
            {
                id = w.Id,
                title = w.Title,
                processName = w.ProcessName,
                iconUri = w.IconPath is null ? null : new Uri(w.IconPath).AbsoluteUri,
            }),
        }));
    }

    private NativeCallOutcome ExecuteWindowsFocus(Dictionary<string, JsonElement>? parameters)
    {
        if (!TryGetWindowId(parameters, out var hwnd))
        {
            return NativeCallOutcome.Failure("invalidParams", "windows.focus requires a 'id' window handle parameter");
        }
        try
        {
            WindowEnumerationService.Focus(hwnd);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (KeyNotFoundException)
        {
            return NativeCallOutcome.Failure("windowNotFound", "the window no longer exists");
        }
    }

    private NativeCallOutcome ExecuteWindowsClose(Dictionary<string, JsonElement>? parameters)
    {
        if (!TryGetWindowId(parameters, out var hwnd))
        {
            return NativeCallOutcome.Failure("invalidParams", "windows.close requires a 'id' window handle parameter");
        }
        try
        {
            WindowEnumerationService.Close(hwnd);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (KeyNotFoundException)
        {
            return NativeCallOutcome.Failure("windowNotFound", "the window no longer exists");
        }
    }

    private static bool TryGetWindowId(Dictionary<string, JsonElement>? parameters, out IntPtr hwnd)
    {
        hwnd = IntPtr.Zero;
        return parameters is not null
            && parameters.TryGetValue("id", out var idElement)
            && idElement.ValueKind == JsonValueKind.String
            && WindowEnumerationService.TryParseWindowId(idElement.GetString(), out hwnd);
    }

    private NativeCallOutcome ExecuteSystemControl(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("op", out var opElement) || opElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "system.control requires a string 'op' parameter");
        }
        var op = opElement.GetString() ?? "";
        if (!SystemControlService.IsAllowedOp(op))
        {
            return NativeCallOutcome.Failure("opNotSupported", $"system op '{op}' is not on the shell's allowlist");
        }
        try
        {
            SystemControlService.Execute(op);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("systemControlFailed", ex.Message);
        }
    }

    /// <summary>Opens or reveals a file/folder — the path must match the extension's fs scopes.</summary>
    private static NativeCallOutcome ExecuteShellPath(
        Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes, bool reveal)
    {
        if (parameters is null || !parameters.TryGetValue("path", out var pathElement) || pathElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "shell path methods require a string 'path' parameter");
        }
        var path = pathElement.GetString() ?? "";
        if (!FsPolicy.IsAllowed(path, scopes))
        {
            return NativeCallOutcome.Failure(
                "pathNotInScope",
                $"path '{path}' is outside the filesystem scopes declared by this extension");
        }
        if (!File.Exists(path) && !Directory.Exists(path))
        {
            return NativeCallOutcome.Failure("pathNotFound", $"path '{path}' does not exist");
        }
        try
        {
            if (reveal)
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"/select, \"{path}\"") { UseShellExecute = true });
            }
            else
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
            }
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("openFailed", ex.Message);
        }
    }

    /// <summary>The extension's preference values as strings, for fs scope interpolation.</summary>
    private IReadOnlyDictionary<string, string> PreferenceStringsFor(string extensionId)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!preferencesStore.AllSlices().TryGetValue(extensionId, out var slice))
        {
            return result;
        }
        foreach (var (key, value) in slice)
        {
            result[key] = value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.GetRawText();
        }
        return result;
    }

    public void ShowToast(string message) => ShowToast(message, null, false);

    public void ShowToast(string message, string? detail, bool isError)
    {
        // Some callers (update service, sidecar events) may fire off the UI
        // thread; the toast state and its timer belong to the dispatcher.
        Dispatcher.BeginInvoke(() =>
        {
            footerToast = new FooterToastState(message, detail, isError);
            if (footerToastTimer is null)
            {
                footerToastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
                footerToastTimer.Tick += (_, _) =>
                {
                    footerToastTimer.Stop();
                    footerToast = null;
                    UpdateFooter();
                };
            }
            footerToastTimer.Stop();
            footerToastTimer.Start();
            UpdateFooter();
        });
    }

    private DispatcherTimer? footerToastTimer;
    private DispatcherTimer? foregroundPollTimer;

    private void SetStatusBar(string message) => DebugLog.Write("status: " + message);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool AddClipboardFormatListener(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(
        uint eventMin,
        uint eventMax,
        IntPtr hmodWinEventProc,
        WinEventDelegate pfnWinEventProc,
        uint idProcess,
        uint idThread,
        uint dwFlags);

    private delegate void WinEventDelegate(IntPtr hHook, uint msg, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint WINEVENT_OUTOFCONTEXT = 0;
    private IntPtr foregroundEventHook;
    private WinEventDelegate? foregroundEventCallback;
}
