using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using FlowKey.Shell.Native;
using FlowKey.Shell.Rendering;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace FlowKey.Shell.Windows;

public partial class MainWindow : Window
{
    public const uint HotkeyModifier = MOD_CONTROL | MOD_ALT;
    public const uint HotkeyVirtualKey = VK_SPACE;
    public const string HotkeyDisplayName = "Ctrl+Alt+Space";

    private const int HOTKEY_ID = 0x464B;
    private const int WM_HOTKEY = 0x0312;
    private const int WM_CLIPBOARDUPDATE = 0x031D;
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
    private List<UiItem> gridItems = new();
    private int gridColumns;
    private int gridIndex;
    private List<GridCellVm> gridCells = new();
    private IntPtr previousForegroundWindow;
    private bool allowClose;

    private IReadOnlyList<Protocol.ReadyExtension> readyExtensions = Array.Empty<Protocol.ReadyExtension>();
    private readonly HashSet<string> pendingPushRequests = new(StringComparer.Ordinal);

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

        appLauncher = new AppLauncherService();
        appLauncher.SetRebuildDispatcher(Dispatcher);
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

        var root = FindRepoRoot();
        var sidecarScript = root is null ? "sidecar/src/main.ts" : Path.Combine(root, "sidecar", "src", "main.ts");
        var extensionsDir = root is null ? "extensions" : Path.Combine(root, "extensions");
        DebugLog.Write($"shell start; repoRoot={root ?? "<null>"}");
        sidecar = new SidecarHost(sidecarScript, extensionsDir, message => Dispatcher.BeginInvoke(() => SetStatusBar(message)));

        sidecar.Ready += OnSidecarReady;
        sidecar.Ui += OnSidecarUi;
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
        if (!AddClipboardFormatListener(Handle))
        {
            DebugLog.Write("AddClipboardFormatListener failed: " + Marshal.GetLastWin32Error());
        }
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
        else if (msg == WM_CLIPBOARDUPDATE)
        {
            var text = ClipboardReader.TryCaptureText();
            DebugLog.Write($"clipboard update captured=" + (text is not null) + " len=" + (text?.Length ?? 0));
            if (text is not null)
            {
                clipboardHistory.Record(text, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
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
                if (searchState.Depth > 1 && searchState.Pop())
                {
                    var restored = searchState.CurrentRows;
                    LoadRowIcons(restored);
                    ApplyRows(restored, null);
                    SearchBox.Text = searchState.CurrentQuery;
                    SendSearch(searchState.CurrentQuery);
                }
                else
                {
                    HideWindow();
                }
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
        if (ResultsList.SelectedItem is not ItemRow row || row.ExtensionId is null)
        {
            return;
        }
        var action = row.Item.Actions?.FirstOrDefault(a => a.Primary == true) ?? row.Item.Actions?.FirstOrDefault();
        if (action is null)
        {
            return;
        }
        if (row.IsCommand)
        {
            DebugLog.Write("OpenCommand ext=" + row.ExtensionId + " cmd=" + row.CommandId);
            OpenCommand(row);
            return;
        }
        DebugLog.Write("SendAction ext=" + row.ExtensionId + " action=" + action.Id);
        sidecar.SendAction(row.ExtensionId, action.Id, row.Item);
    }

    private void OpenCommand(ItemRow row)
    {
        var requestId = sidecar.SendAction(row.ExtensionId!, CommandCatalog.OpenActionId,
            new UiItem { Id = row.CommandId, Title = row.Item.Title });
        searchState.PushRequest(requestId, row.ExtensionId!, row.CommandId!);
    }

    private void OnSidecarAck(AckMessage ack)
    {
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
            var requestId = sidecar.SendSearch(top.ExtensionId, query, top.CommandId);
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
            .Select(cmd =>
            {
                var row = UiRow.Item(new UiItem
                {
                    Id = "cmd:" + cmd.ExtensionId + ":" + cmd.Command.Id,
                    Title = cmd.Command.Title,
                    Subtitle = cmd.ExtensionName + (cmd.Command.Mode == "background" ? " (background)" : ""),
                    Icon = cmd.Extension.Icon,
                    Actions = new List<UiAction> { new UiAction { Id = CommandCatalog.OpenActionId, Title = "Run", Primary = true } },
                });
                row.ExtensionId = cmd.ExtensionId;
                row.IsCommand = true;
                row.CommandId = cmd.Command.Id;
                return row;
            })
            .ToList();
        DebugLog.Write("display rows: commands=" + commandRows.Count + " ext=" + extensionRows.Count + " depth=" + searchState.Depth);
        var merged = new List<UiRow>(commandRows);
        merged.AddRange(extensionRows);
        return merged;
    }

    private void OnSidecarReady(ReadyMessage ready)
    {
        readyExtensions = ready.Extensions;
        if (searchState.Depth > 1)
        {
            searchState.ResetToRoot();
            ShowToast("Extensions restarted — returned to root");
        }
        var first = ready.Extensions.FirstOrDefault();
        Dispatcher.BeginInvoke(() =>
        {
            SetStatusBar(first is null ? "no extensions" : $"{first.Name} v{first.Version} ready");
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
            if (message.Tree is GridTree grid)
            {
                ShowGrid(grid);
                return;
            }
            if (message.Tree is DetailTree detail)
            {
                var extensionId = searchState.ExtensionFor(message.RequestId) ?? searchState.Top?.ExtensionId;
                DetailHost.Content = DetailRenderer.Render(detail, action =>
                    sidecar.SendAction(extensionId ?? "", action.Id,
                        new UiItem { Id = detail.Title }));
                DetailHost.Visibility = Visibility.Visible;
                ResultsList.Visibility = Visibility.Collapsed;
                EmptyView.Visibility = Visibility.Collapsed;
                return;
            }
            DetailHost.Visibility = Visibility.Collapsed;
            if (message.Tree is not ListTree list)
            {
                ShowToast("received a non-list tree (not rendered in this phase)");
                return;
            }
            DebugLog.Write($"UiReceived req={message.RequestId}");
            if (pendingPushRequests.Remove(message.RequestId))
            {
                DebugLog.Write("pushed view arrived req=" + message.RequestId);
            }
            var rows = searchState.ApplyResult(message.RequestId, list, out var stale);
            if (stale)
            {
                return;
            }
            DetailHost.Visibility = Visibility.Collapsed;
            GridHost.Visibility = Visibility.Collapsed;
            var display = BuildDisplayRows();
            LoadRowIcons(display);
            ApplyRows(display, list.EmptyView);
        });
    }

    private void ShowGrid(GridTree tree)
    {
        gridItems = tree.Items.Select(i => i).ToList();
        gridColumns = Math.Max(1, tree.Columns);
        gridIndex = gridItems.Count > 0 ? 0 : -1;
        var rows = new List<GridRowVm>();
        gridCells = new List<GridCellVm>();
        for (var i = 0; i < gridItems.Count; i++)
        {
            var cell = new GridCellVm { Item = gridItems[i], FlatIndex = i };
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
        LoadGridBitmaps();
        var missing = gridItems.Select(i => i.Icon).Where(icon => !string.IsNullOrEmpty(icon) && !EmojiSpriteRenderer.IsCached(icon)).Distinct().ToList();
        if (missing.Count > 0)
        {
            var thread = new Thread(() =>
            {
                var ok = EmojiSpriteRenderer.EnsureSprites(missing);
                Dispatcher.BeginInvoke(() =>
                {
                    if (ok)
                    {
                        LoadGridBitmaps();
                    }
                    else
                    {
                        ShowToast("color emoji rendering unavailable (Edge not found) — using monochrome");
                    }
                });
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
        }
        GridHost.Visibility = Visibility.Visible;
        ResultsList.Visibility = Visibility.Collapsed;
        DetailHost.Visibility = Visibility.Collapsed;
        EmptyView.Visibility = Visibility.Collapsed;
    }

    private void LoadGridBitmaps()
    {
        foreach (var cell in gridCells)
        {
            var path = EmojiSpriteRenderer.CachePathFor(cell.Item.Icon);
            if (!File.Exists(path))
            {
                cell.Bitmap = null;
                continue;
            }
            try
            {
                var image = new System.Windows.Media.Imaging.BitmapImage();
                image.BeginInit();
                image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                image.DecodePixelWidth = 32;
                image.UriSource = new Uri(path);
                image.EndInit();
                image.Freeze();
                cell.Bitmap = image;
            }
            catch
            {
                cell.Bitmap = null;
            }
        }
    }

    private void OnGridKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Left: MoveGrid(-1, 0); e.Handled = true; break;
            case Key.Right: MoveGrid(1, 0); e.Handled = true; break;
            case Key.Up: MoveGrid(0, -1); e.Handled = true; break;
            case Key.Down: MoveGrid(0, 1); e.Handled = true; break;
            case Key.Enter: RunGridPrimary(); e.Handled = true; break;
            case Key.Escape:
                if (searchState.Depth > 1 && searchState.Pop())
                {
                    GridHost.Visibility = Visibility.Collapsed;
                    SendSearch(searchState.CurrentQuery);
                }
                else
                {
                    HideWindow();
                }
                e.Handled = true;
                break;
        }
    }

    private void OnGridCellClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is Border { Tag: int flat } && flat < gridCells.Count)
        {
            gridCells[gridIndex >= 0 && gridIndex < gridCells.Count ? gridIndex : 0].Selected = false;
            gridIndex = flat;
            gridCells[gridIndex].Selected = true;
            RunGridPrimary();
        }
    }

    private void MoveGrid(int dx, int dy)
    {
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
        ShowToast("Copied " + item.Icon);
    }

    private void LoadRowIcons(IReadOnlyList<UiRow> rows)
    {
        foreach (var row in rows.OfType<ItemRow>())
        {
            var uri = row.Item.IconUri;
            if (uri is null)
            {
                continue;
            }
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
            .Select((e, i) => new Dictionary<string, object?>
            {
                ["id"] = i.ToString(),
                ["text"] = e.Text,
                ["timestamp"] = e.TimestampUnixMs,
            })
            .ToList();
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { items }));
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
            _ = Task.Run(async () =>
            {
                var outcome = await httpFetch.FetchAsync(parameters, hosts, CancellationToken.None);
                CompleteNativeCall(requestId, method, outcome);
            });
            return;
        }

        _ = Dispatcher.InvokeAsync(() =>
        {
            var outcome = nativeMethods.Execute(method, declared, parameters);
            CompleteNativeCall(requestId, method, outcome);
        });
    }

    private void CompleteNativeCall(string requestId, string method, NativeCallOutcome outcome)
    {
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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool AddClipboardFormatListener(IntPtr hwnd);
}
