using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace FlowKey.Shell.Windows;

public partial class MainWindow : Window
{
    public const uint HotkeyModifier = MOD_CONTROL;
    public const uint HotkeyVirtualKey = VK_SPACE;
    public const string HotkeyDisplayName = "Ctrl+Space";

    private const int HOTKEY_ID = 0x464B;
    private const int WM_HOTKEY = 0x0312;
    private const uint MOD_CONTROL = 0x0002;
    private const uint VK_SPACE = 0x20;

    private const int SearchDebounceMs = 120;

    private readonly SidecarHost sidecar;
    private readonly NativeMethodTable nativeMethods = new();
    private readonly SearchState searchState = new();
    private readonly DispatcherTimer searchDebounce;
    private readonly Queue<(string Message, DateTime At)> toastLog = new();
    private IntPtr previousForegroundWindow;
    private bool allowClose;

    private string? currentExtensionId;
    private IReadOnlyList<string> declaredNativeMethods = Array.Empty<string>();

    public MainWindow()
    {
        InitializeComponent();
        new WindowInteropHelper(this).EnsureHandle();
        searchDebounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(SearchDebounceMs) };
        searchDebounce.Tick += (_, _) =>
        {
            searchDebounce.Stop();
            SendSearch(SearchBox.Text);
        };

        var root = FindRepoRoot();
        var sidecarScript = root is null ? "sidecar/src/main.ts" : Path.Combine(root, "sidecar", "src", "main.ts");
        var extensionsDir = root is null ? "extensions" : Path.Combine(root, "extensions");
        DebugLog.Write($"shell start; repoRoot={root ?? "<null>"}");
        sidecar = new SidecarHost(sidecarScript, extensionsDir, message => Dispatcher.BeginInvoke(() => SetStatusBar(message)));

        sidecar.Ready += OnSidecarReady;
        sidecar.Ui += OnSidecarUi;
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

    private void OnLoaded(object sender, RoutedEventArgs e) => UpdateEmptyView("FlowKey", "Type to search, or press Escape to hide");

    private void OnSourceInitialized(object sender, EventArgs e)
    {
        var source = HwndSource.FromHwnd(Handle);
        source?.AddHook(WndProc);
        if (!RegisterHotKey(Handle, HOTKEY_ID, HotkeyModifier, HotkeyVirtualKey))
        {
            var errorCode = Marshal.GetLastWin32Error();
            DebugLog.Write($"RegisterHotKey failed: {errorCode}");
            ShowToast($"Failed to register global hotkey {HotkeyDisplayName} (error {errorCode}). Another app may own it.");
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
        UnregisterHotKey(Handle, HOTKEY_ID);
        sidecar.Dispose();
        base.OnClosed(e);
    }

    public void Quit()
    {
        allowClose = true;
        Close();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID)
        {
            ToggleVisibility();
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void ToggleVisibility()
    {
        if (Visibility == Visibility.Visible)
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
        Visibility = Visibility.Visible;
        Show();
        ForceForeground();
        Activate();
        SearchBox.Focus();
        SearchBox.SelectAll();
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
        var previous = previousForegroundWindow;
        Hide();
        Visibility = Visibility.Hidden;
        if (previous != IntPtr.Zero && previous != Handle && IsWindow(previous))
        {
            SetForegroundWindow(previous);
        }
    }

    private IntPtr Handle => new WindowInteropHelper(this).Handle;

    private void OnDeactivated(object sender, EventArgs e) => HideWindow();

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        searchDebounce.Stop();
        searchDebounce.Start();
    }

    private void OnSearchKeyDown(object sender, KeyEventArgs e) => HandleListKeys(e);

    private void OnListKeyDown(object sender, KeyEventArgs e) => HandleListKeys(e);

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
            case Key.Escape:
                HideWindow();
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

    private void OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ResultsList.SelectedItem is ItemRow row)
        {
            SetStatusBar(row.Item.Title);
        }
    }

    private void OnListDoubleClick(object sender, MouseButtonEventArgs e) => RunPrimaryAction();

    private void RunPrimaryAction()
    {
        DebugLog.Write("RunPrimaryAction");
        if (ResultsList.SelectedItem is not ItemRow row || currentExtensionId is null)
        {
            return;
        }
        var action = row.Item.Actions?.FirstOrDefault(a => a.Primary == true) ?? row.Item.Actions?.FirstOrDefault();
        if (action is null)
        {
            return;
        }
        sidecar.SendAction(currentExtensionId, action.Id, row.Item);
    }

    private void SendSearch(string query)
    {
        if (currentExtensionId is null)
        {
            UpdateEmptyView("Starting extensions…", "waiting for the sidecar");
            return;
        }
        DebugLog.Write($"SendSearch query='{query}' ext={currentExtensionId}");
        var requestId = sidecar.SendSearch(currentExtensionId, query);
        searchState.SetCurrent(requestId);
    }

    private void OnSidecarReady(ReadyMessage ready)
    {
        var first = ready.Extensions.FirstOrDefault();
        if (first is null)
        {
            Dispatcher.BeginInvoke(() => UpdateEmptyView("No extensions", "the sidecar reported zero extensions"));
            return;
        }
        currentExtensionId = first.Id;
        declaredNativeMethods = first.NativeMethods;
        Dispatcher.BeginInvoke(() =>
        {
            SetStatusBar($"{first.Name} v{first.Version} ready");
            SendSearch(SearchBox.Text);
        });
    }

    private void OnSidecarUi(UiMessage message)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (message.Tree is null)
            {
                return;
            }
            if (message.Tree is not ListTree list)
            {
                ShowToast("received a non-list tree (not rendered in this phase)");
                return;
            }
            DebugLog.Write($"UiReceived req={message.RequestId} current={searchState.CurrentRequestId} rows incoming");
            var rows = searchState.ApplyResult(message.RequestId, list, out var stale);
            if (stale)
            {
                return;
            }
            ApplyRows(rows, list.EmptyView);
        });
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
        Dispatcher.BeginInvoke(() =>
        {
            ShowToast($"{message.Error.Code}: {message.Error.Message}");
            SetStatusBar($"error: {message.Error.Code}");
        });
    }

    private void OnNativeCallRequested(string requestId, string extensionId, string method, Dictionary<string, JsonElement>? parameters)
    {
        DebugLog.Write($"NativeCall req={requestId} ext={extensionId} method={method}");
        var outcome = Dispatcher.Invoke(() => nativeMethods.Execute(method, declaredNativeMethods, parameters));
        DebugLog.Write($"NativeCall outcome ok={outcome.Ok} code={outcome.Error?.Code ?? "none"}");
        if (!outcome.Ok)
        {
            Dispatcher.BeginInvoke(() => ShowToast($"Native method '{method}' failed: {outcome.Error?.Message}"));
        }
        sidecar.SendNativeResult(requestId, outcome);
    }

    public void ShowToast(string message)
    {
        var toast = new Border
        {
            Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x33, 0x33, 0x44)),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            Margin = new Thickness(0, 4, 0, 0),
            Child = new TextBlock
            {
                Text = message,
                Foreground = (System.Windows.Media.Brush)FindResource("TextBrush"),
                TextWrapping = TextWrapping.Wrap,
            },
        };
        ToastHost.Children.Add(toast);
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            ToastHost.Children.Remove(toast);
        };
        timer.Start();
    }

    private void SetStatusBar(string message) => StatusBar.Text = message;

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
}
