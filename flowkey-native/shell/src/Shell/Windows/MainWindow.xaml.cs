using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Point = System.Windows.Point;
using System.Windows.Threading;
using FlowKey.Shell.Native;
using FlowKey.Shell.Rendering;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Search.Calculator;
using FlowKey.Shell.Sidecar;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace FlowKey.Shell.Windows;

public partial class MainWindow : Window
{
    public const uint HotkeyModifier = MOD_CONTROL | MOD_ALT;
    public const uint HotkeyVirtualKey = VK_SPACE;
    public const string HotkeyDisplayName = "Ctrl+Alt+Space";

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

    private readonly SidecarHost sidecar;
    private readonly NativeMethodTable nativeMethods = new();
    private readonly SearchState searchState = new();
    private readonly DispatcherTimer searchDebounce;
    private readonly Queue<(string Message, DateTime At)> toastLog = new();
    private readonly AppLauncherService appLauncher;
    private readonly HttpFetchService httpFetch = new();
    private readonly ClipboardHistoryStore clipboardHistory = new(AppLauncherService.DataDirectory);
    private readonly PreferencesStore preferencesStore = new(AppLauncherService.DataDirectory);
    private readonly TokenVault tokenVault = new(AppLauncherService.DataDirectory);
    private readonly UsageTracker usageTracker = new(AppLauncherService.DataDirectory);
    private readonly FavoritesStore favoritesStore = new(AppLauncherService.DataDirectory);
    private readonly CalculatorEvaluator calculator = new(AppLauncherService.DataDirectory);
    private CalculatorResult? lastCalculator;
    private readonly SecretsStore secretsStore = new(AppLauncherService.DataDirectory);
    private readonly OAuthService oauthService;
    private readonly ImageFetchService imageFetch = new();
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
    private SettingsWindow? settingsWindow;
    private ActionPanel? actionPanel;
    private HudWindow? hudWindow;
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
        calculator.RatesUpdated += () => Dispatcher.BeginInvoke(UpdateCalculatorPreview);

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
        nativeMethods.Register("clipboard.history", p => ExecuteClipboardHistory(p));
        nativeMethods.Register("clipboard.clearHistory", _ =>
        {
            clipboardHistory.Clear();
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        });
        nativeMethods.Register("clipboard.deleteEntry", p => ExecuteClipboardDelete(p));
        nativeMethods.Register("clipboard.copyEntry", p => ExecuteClipboardCopyEntry(p));
        nativeMethods.Register("clipboard.pasteEntry", p => ExecuteClipboardPasteEntry(p));
        nativeMethods.Register("clipboard.editEntry", p => ExecuteClipboardEditEntry(p));
        nativeMethods.Register("hud.show", p => ExecuteHudShow(p));
        oauthService = new OAuthService(tokenVault, OAuthProviderRegistry.Load);

        var root = FindRepoRoot();
        var sidecarScript = root is null ? "sidecar/src/main.ts" : Path.Combine(root, "sidecar", "src", "main.ts");
        var extensionsDir = root is null ? "extensions" : Path.Combine(root, "extensions");
        DebugLog.Write($"shell start; repoRoot={root ?? "<null>"}");
        sidecar = new SidecarHost(sidecarScript, extensionsDir, message => Dispatcher.BeginInvoke(() => SetStatusBar(message)));

        sidecar.Ready += OnSidecarReady;
        sidecar.Ui += OnSidecarUi;
        sidecar.UiPush += OnSidecarUiPush;
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

    public void OpenSettings()
    {
        try
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
        settingsWindow = new SettingsWindow(
            hotkeyManager,
            hotkeySettings,
            preferencesStore,
            readyExtensions,
            oauthService,
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
        settingsWindow.DescribeCommandShortcut = _ => "";
        settingsWindow.ShortcutConflict = combo =>
        {
            var settings = hotkeySettings.Load();
            return TryParseCombo(combo, out var modifier, out var virtualKey)
                && settings.Modifier == modifier && settings.VirtualKey == virtualKey;
        };
        settingsWindow.RefreshCommandShortcuts = () => { };
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
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (capture is not null && capture.Text is not null)
            {
                clipboardHistory.Record(capture.Text, timestamp, capture.SourceApp, capture.SourceIconUri);
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
                    }
                }
                catch (Exception ex)
                {
                    DebugLog.Write("clipboard image capture failed: " + ex.Message);
                }
            }
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void ToggleVisibility()
    {
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
        Show();
        ForceForeground();
        Activate();
        SearchBox.Focus();
        SearchBox.SelectAll();
        InvalidateVisual();
        DebugLog.Write("summoned");
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
            Hide();
            if (previous != IntPtr.Zero && previous != Handle && IsWindow(previous))
            {
                SetForegroundWindow(previous);
            }
        }
        catch (InvalidOperationException ex)
        {
            DebugLog.Write("HideWindow lost a race with window close: " + ex.Message);
        }
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

    private void OnDeactivated(object sender, EventArgs e) => HideWindow();

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        if (suppressSearchDebounce)
        {
            return;
        }
        searchDebounce.Stop();
        searchDebounce.Start();
        UpdateCalculatorPreview();
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
            case Key.Enter:
                RunPrimaryAction();
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
        BackButton.Visibility = searchState.Depth > 1 ? Visibility.Visible : Visibility.Collapsed;
        UpdateFooter();
    }

    private void UpdateFooter()
    {
        var top = searchState.Top;
        if (searchState.Depth > 1 && top?.ExtensionId is not null)
        {
            var extension = readyExtensions.FirstOrDefault(e => e.Id == top.ExtensionId);
            var commandTitle = top.CommandId is null
                ? null
                : extension?.Commands.FirstOrDefault(c => c.Id == top.CommandId)?.Title;
            var label = commandTitle ?? extension?.Name ?? "";
            var selectedTitle = SelectedItemTitleForFooter();
            if (!string.IsNullOrEmpty(selectedTitle))
            {
                label += " – " + selectedTitle;
            }
            var panel = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal };
            panel.Children.Add(CreateExtensionIcon(extension));
            var name = new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
            name.SetResourceReference(TextBlock.FontSizeProperty, "FooterFontSize");
            name.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
            name.SetResourceReference(FrameworkElement.MarginProperty, "IconMargin");
            panel.Children.Add(name);
            FooterLeft.Content = panel;
        }
        else
        {
            var settingsButton = new System.Windows.Controls.Border
            {
                Background = System.Windows.Media.Brushes.Transparent,
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(-6, -2, 0, -2),
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
            FooterLeft.Content = settingsButton;
        }

        var primary = SelectedPrimaryActionTitle();
        FooterPrimaryAction.Text = primary ?? "";
        FooterPrimaryAction.Visibility = primary is null ? Visibility.Collapsed : Visibility.Visible;
        FooterEnterKeycap.Visibility = primary is null ? Visibility.Collapsed : Visibility.Visible;
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

    private bool PopView()
    {
        if (searchState.Depth > 1 && searchState.Pop())
        {
            var restored = searchState.CurrentRows;
            LoadRowIcons(restored);
            ApplyRows(restored, null);
            SetSearchBoxSilently(searchState.CurrentQuery);
            SendSearch(searchState.CurrentQuery);
            UpdateChrome();
            return true;
        }
        return false;
    }

    private void PerformEscape()
    {
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

    private void OnBackButtonClick(object sender, MouseButtonEventArgs e) => PerformEscape();

    private void OnListDoubleClick(object sender, MouseButtonEventArgs e) => RunPrimaryAction();

    private bool HandleDetailKeys(KeyEventArgs e)
    {
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
                return false;
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

    private void RunPrimaryAction()
    {
        DebugLog.Write("RunPrimaryAction");
        if (ResultsList.SelectedItem is CalculatorRow calculatorRow)
        {
            ClipboardService.WriteText(calculatorRow.CopyText);
            ShowToast("Answer copied");
            HideWindow();
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
        if (ResultsList.SelectedItem is CalculatorRow calculatorRow)
        {
            OpenActionPanel(
                "calculator",
                new UiItem { Id = "__calculator__", Title = calculatorRow.Expression, Subtitle = calculatorRow.CopyText },
                new List<UiAction> { new UiAction { Id = CalculatorRow.CopyAnswerActionId, Title = "Copy Answer", Primary = true } });
            return;
        }
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
        actionPanel.Committed += action =>
        {
            if (action.Id == CalculatorRow.CopyAnswerActionId)
            {
                ClipboardService.WriteText(item.Subtitle ?? "");
                ShowToast("Answer copied");
                return;
            }
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
        };
        actionPanel.FocusLostToOtherApp += () =>
        {
            if (GetForegroundWindow() != Handle)
            {
                HideWindow();
            }
        };
        actionPanel.Open(actions, item.Title, Left + Width, Top + Height, FooterHeightValue);
    }

    private void OpenCommand(ItemRow row)
    {
        usageTracker.Increment(row.Item.Id);
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
                }
                else if (false)
                {
                    commandHotkeyIds[id] = (extension.Id, command.Id);
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
        var extensionRows = searchState.CurrentRows;
        if (searchState.Depth > 1)
        {
            return extensionRows;
        }
        var query = SearchBox.Text.Trim();
        var commandRows = CommandCatalog
            .Search(query, readyExtensions)
            .Where(cmd => CommandToggles.IsEnabled(cmd.ExtensionId, cmd.Command.Id))
            .Select(BuildCommandRow)
            .ToList();
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
            var result = new List<UiRow>();
            if (query.Length == 0)
            {
                lastCalculator = null;
                var pixelSize = (int)Math.Round(VisualTreeHelper.GetDpi(this).PixelsPerDip * 32);
                result.AddRange(RootSectionsBuilder.Build(
                    favoritesStore, usageTracker, readyExtensions, appLauncher.List("", pixelSize), BuildCommandRow));
            }
            else
            {
                var calculatorResult = calculator.Evaluate(query);
                lastCalculator = calculatorResult;
                if (calculatorResult is not null)
                {
                    result.Add(UiRow.Header("Calculator"));
                    result.Add(CalculatorRow.From(calculatorResult));
                }
            }
            result.AddRange(WithGroupHeaders(merged));
            return result;
        }
        return merged;
    }

    private void UpdateCalculatorPreview()
    {
        if (searchState.Depth > 1)
        {
            return;
        }
        var query = SearchBox.Text.Trim();
        var result = query.Length == 0 ? null : calculator.Evaluate(query);
        if (result is null && lastCalculator is null)
        {
            return;
        }
        if (result is not null && lastCalculator is not null && result == lastCalculator)
        {
            return;
        }
        lastCalculator = result;
        var display = BuildDisplayRows();
        LoadRowIcons(display);
        ApplyRows(display, null);
        for (var i = 0; i < display.Count; i++)
        {
            if (display[i] is CalculatorRow)
            {
                ResultsList.SelectedIndex = i;
                ResultsList.ScrollIntoView(display[i]);
                return;
            }
        }
    }

    private ItemRow BuildCommandRow(CommandRow cmd)
    {
        var row = UiRow.Item(new UiItem
        {
            Id = "cmd:" + cmd.ExtensionId + ":" + cmd.Command.Id,
            Title = cmd.Command.Title,
            Subtitle = cmd.ExtensionName,
            Kind = "Command",
            Icon = cmd.Command.Icon is null ? cmd.Extension.Icon : "",
            IconColor = cmd.Command.IconColor,
            Actions = new List<UiAction> { new UiAction { Id = CommandCatalog.OpenActionId, Title = "Run", Primary = true } },
        });
        row.ExtensionId = cmd.ExtensionId;
        row.IsCommand = true;
        row.CommandId = cmd.Command.Id;
        if (Rendering.BrandIcons.TryGet(cmd.ExtensionId, out var brandGeometry, out var brandBrush))
        {
            row.VectorIcon = brandGeometry;
            row.VectorIconBrush = brandBrush;
            row.VectorIconFilled = true;
        }
        else if (Rendering.BrandIcons.TryGetBitmap(cmd.ExtensionId, out var brandBitmap))
        {
            row.Bitmap = brandBitmap;
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
        return row;
    }

    private IReadOnlyList<UiRow> WithGroupHeaders(List<UiRow> rows)
    {
        var result = new List<UiRow>();
        string? lastGroup = null;
        foreach (var row in rows)
        {
            var isCommand = row is ItemRow { IsCommand: true };
            var group = isCommand ? "Commands" : row.ExtensionId;
            if (group != lastGroup)
            {
                var title = isCommand
                    ? "Commands"
                    : readyExtensions.FirstOrDefault(e => e.Id == row.ExtensionId)?.Name ?? "";
                if (title.Length > 0)
                {
                    result.Add(UiRow.Header(title));
                }
                lastGroup = group;
            }
            result.Add(row);
        }
        return result;
    }

    private void OnSidecarReady(ReadyMessage ready)
    {
        readyExtensions = ready.Extensions;
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
        });
    }

    public void SavePreferences(string extensionId, IReadOnlyList<Protocol.PreferenceSchema> schema, Dictionary<string, System.Text.Json.JsonElement> values)
    {
        preferencesStore.SetSlice(extensionId, schema, values);
        sidecar.SendPreferences(extensionId, preferencesStore.Slice(extensionId, schema)
            .ToDictionary(p => p.Key, p => p.Value));
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
            if (message.Tree is GridTree grid)
            {
                ShowGrid(grid);
                return;
            }
            if (message.Tree is DetailTree detail)
            {
                var extensionId = searchState.ExtensionFor(message.RequestId) ?? searchState.Top?.ExtensionId;
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
            if (message.Tree is GridTree grid)
            {
                ShowGrid(grid);
                return;
            }
            if (message.Tree is DetailTree detail)
            {
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

        // The language/filter dropdown belongs to an extension command's search bar,
        // not to the root aggregate view (extensions each ship their own filter; the
        // last root result would otherwise decide the dropdown) nor to the side pane
        // rendering: show it only past the root depth.
        if (list.Filter is null || searchState.Depth <= 1)
        {
            FilterDropdown.Visibility = Visibility.Collapsed;
            FilterPopup.IsOpen = false;
        }
        else
        {
            FilterDropdown.Visibility = Visibility.Visible;
            FilterList.ItemsSource = list.Filter.Options.ToList();
            var current = list.Filter.Options.FirstOrDefault(o => o.Value == (searchState.Top?.FilterValue ?? "all"))
                ?? list.Filter.Options.FirstOrDefault();
            FilterLabel.Text = current?.Label ?? "";
            if (searchState.Top is { } top)
            {
                top.FilterValue = current?.Value;
                top.Query = SearchBox.Text;
            }
        }
    }

    private const double SidePaneListWidth = 300;

    private void OnFilterButtonClick(object sender, MouseButtonEventArgs e)
    {
        FilterPopup.IsOpen = !FilterPopup.IsOpen;
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
        gridItems = tree.Items.Select(i => i).ToList();
        gridColumns = Math.Max(1, tree.Columns);
        gridIndex = gridItems.Count > 0 ? 0 : -1;
        var cellSize = Math.Clamp(
            Math.Floor((ContentWidth - (gridColumns - 1) * CellGap) / gridColumns),
            MinCellSize, MaxCellSize);
        var rows = new List<GridRowVm>();
        gridCells = new List<GridCellVm>();
        for (var i = 0; i < gridItems.Count; i++)
        {
            var cell = new GridCellVm
            {
                Item = gridItems[i],
                FlatIndex = i,
                CellSize = cellSize,
                GlyphSize = Math.Floor(cellSize * 0.42),
                IconSize = Math.Floor(cellSize * 0.45),
                CellBackground = (System.Windows.Media.Brush)FindResource("CellBackgroundBrush"),
                Title = gridItems[i].Title,
                Subtitle = gridItems[i].Subtitle ?? "",
                ImageDisplaySize = string.IsNullOrEmpty(gridItems[i].IconUri)
                    ? Math.Floor(cellSize * 0.55)
                    : cellSize,
            };
            gridCells.Add(cell);
            if (i % gridColumns == 0)
            {
                rows.Add(new GridRowVm());
            }
            rows[^1].Cells.Add(cell);
        }
        if (gridCells.Count > 0)
        {
            gridCells[0].Selected = true;
        }
        GridHost.ItemsSource = rows;
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
                return false;
        }
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
            var first = -1;
            for (var i = 0; i < rows.Count; i++)
            {
                if (rows[i] is CalculatorRow)
                {
                    first = i;
                    break;
                }
            }
            if (first < 0)
            {
                first = RowBuilder.FirstItemIndex(rows);
            }
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
                ["launchCount"] = 0,
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
        var text = clipboardHistory.Latest();
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
        var extension = readyExtensions.FirstOrDefault(e => e.Id == extensionId);
        var declared = extension?.NativeMethods ?? (IReadOnlyList<string>)Array.Empty<string>();
        if (!declared.Contains(method, StringComparer.Ordinal))
        {
            CompleteNativeCall(requestId, method, NativeCallOutcome.Failure(
                "methodNotDeclared",
                $"extension did not declare native method '{method}' in its manifest"));
            return;
        }

        if (method == "http.fetch")
        {
            var hosts = extension?.HttpHosts ?? (IReadOnlyList<string>)Array.Empty<string>();
            string? authProvider = parameters is not null
                && parameters.TryGetValue("auth", out var authElement)
                && authElement.ValueKind == JsonValueKind.String
                    ? authElement.GetString()
                    : null;
            if (authProvider is not null)
            {
                var declaredOauth = extension?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
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

        if (method is "oauth.authorize" or "oauth.status" or "image.fetch")
        {
            var hosts = extension?.HttpHosts ?? (IReadOnlyList<string>)Array.Empty<string>();
            var declaredOauth = extension?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
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
            var declaredOauth = extension?.OAuth ?? (IReadOnlyList<string>)Array.Empty<string>();
            var outcome = method == "oauth.disconnect"
                ? oauthService.Disconnect(extensionId, parameters, declaredOauth)
                : secretsStore.Handle(extensionId, method, parameters);
            CompleteNativeCall(requestId, method, outcome);
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

    public void ShowToast(string message) => ShowToast(message, null, false);

    public void ShowToast(string message, string? detail, bool isError)
    {
        FooterToastTitle.Text = message;
        FooterToastDetail.Text = detail ?? "";
        FooterToastDetail.Visibility = string.IsNullOrEmpty(detail) ? Visibility.Collapsed : Visibility.Visible;
        FooterToastDot.Visibility = isError ? Visibility.Visible : Visibility.Collapsed;
        FooterToastHost.Background = isError ? (System.Windows.Media.Brush)FindResource("FooterToastErrorBrush") : null;
        FooterToastHost.Visibility = Visibility.Visible;
        FooterLeft.Visibility = Visibility.Collapsed;
        if (footerToastTimer is null)
        {
            footerToastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
            footerToastTimer.Tick += (_, _) =>
            {
                footerToastTimer.Stop();
                FooterToastHost.Visibility = Visibility.Collapsed;
                FooterLeft.Visibility = Visibility.Visible;
            };
        }
        footerToastTimer.Stop();
        footerToastTimer.Start();
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
