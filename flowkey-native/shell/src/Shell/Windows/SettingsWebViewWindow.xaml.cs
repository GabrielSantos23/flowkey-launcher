using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Rendering;

namespace FlowKey.Shell.Windows;

/// <summary>
/// The settings window: a shell-owned WebView2 surface (app.flowkey.local/
/// settingshost.html) fed by SettingsState pushes, replacing the former
/// SettingsWindow XAML code-behind. Same hosting pipeline as the footer —
/// shared environment/user-data folder, theme CSS push, buffered state until
/// ready — but a standalone window whose whole chrome (title bar, drag band,
/// window buttons) is drawn by the page via app-region: drag. Every operation
/// the page offers is an invoke op executed by SettingsOperations; the page
/// can never touch a store or the OS directly.
/// </summary>
public partial class SettingsWebViewWindow : Window
{
    private readonly HotkeySettingsStore hotkeySettings;
    private readonly PreferencesStore preferencesStore;
    private readonly IReadOnlyList<ReadyExtension> extensions;
    private readonly ExtensionPackageManager extensionManager;
    private readonly IReadOnlyList<ReadyFailure> loadFailures;
    private readonly Action requestExtensionsRefresh;
    private readonly Func<string, string?> assetsDirResolver;
    private readonly OAuthService oauthService;
    private readonly UpdateService updateService;
    private readonly Action<string> showToast;
    private readonly Func<uint, uint, bool> applySummonHotkey;

    private readonly SettingsOperations operations;
    private readonly Dictionary<string, FooterIconState> iconCache = new(StringComparer.Ordinal);
    private readonly Dictionary<string, SettingsOAuthRow> oauthStatuses = new(StringComparer.Ordinal);
    private readonly HashSet<string> oauthFetchesInFlight = new(StringComparer.Ordinal);
    private List<SettingsAppOption>? appChoices;

    private WebView2? webView;
    private SettingsCaptureState? capture;
    private ExtensionPackageInstaller.InstallPlan? pendingInstallPlan;
    private SettingsPendingConsent? pendingInstall;
    private string? pendingInstallPath;
    private SettingsPendingConsent? pendingReconsent;
    private bool pushQueued;

    /// <summary>A preference slice was persisted; MainWindow forwards it to the sidecar.</summary>
    public event Action<string, Dictionary<string, JsonElement>>? PreferencesChanged;
    /// <summary>A command shortcut was committed or cleared; MainWindow persists + re-registers.</summary>
    public event Action<string, string?>? CommandShortcutChanged;
    /// <summary>A command enable toggle changed; MainWindow re-registers hotkeys.</summary>
    public event Action<string, string, bool>? CommandToggled;

    /// <summary>True when a combo equals the summon hotkey.</summary>
    public Func<string, bool> ShortcutConflict { get; set; } = _ => false;
    public Action? SuspendGlobalHotkeys { get; set; }
    public Action? RestoreGlobalHotkeys { get; set; }

    public SettingsWebViewWindow(
        HotkeyManager hotkeyManager,
        HotkeySettingsStore hotkeySettings,
        PreferencesStore preferencesStore,
        IReadOnlyList<ReadyExtension> extensions,
        ExtensionPackageManager extensionManager,
        IReadOnlyList<ReadyFailure> loadFailures,
        Action requestExtensionsRefresh,
        Func<string, string?> assetsDirResolver,
        OAuthService oauthService,
        UpdateService updateService,
        Action clearClipboardHistory,
        Action<string> showToast,
        Func<uint, uint, bool> applySummonHotkey)
    {
        InitializeComponent();
        this.hotkeySettings = hotkeySettings;
        this.preferencesStore = preferencesStore;
        this.extensions = extensions;
        this.extensionManager = extensionManager;
        this.loadFailures = loadFailures;
        this.requestExtensionsRefresh = requestExtensionsRefresh;
        this.assetsDirResolver = assetsDirResolver;
        this.oauthService = oauthService;
        this.updateService = updateService;
        this.showToast = showToast;
        this.applySummonHotkey = applySummonHotkey;

        operations = new SettingsOperations(
            hotkeySettings,
            preferencesStore,
            extensionManager,
            extensions,
            showToast,
            applySummonHotkey,
            combo => ShortcutConflict(combo),
            enabled => LoginLauncher.SetEnabled(enabled),
            clearClipboardHistory,
            (extensionId, commandId, enabled) => CommandToggles.SetEnabled(extensionId, commandId, enabled));
        operations.PreferencesChanged += (extensionId, values) => PreferencesChanged?.Invoke(extensionId, values);
        operations.CommandShortcutChanged += (commandKey, combo) => CommandShortcutChanged?.Invoke(commandKey, combo);
        operations.CommandToggled += (extensionId, commandId, enabled) => CommandToggled?.Invoke(extensionId, commandId, enabled);

        SourceInitialized += (_, _) => DwmChrome.Apply(System.Windows.Interop.HwndSource.FromHwnd(
            new System.Windows.Interop.WindowInteropHelper(this).Handle));
        Loaded += async (_, _) => await InitializeWebViewAsync();
        Closed += (_, _) =>
        {
            updateService.StatusChanged -= OnUpdateStatusChanged;
            webView?.Dispose();
            webView = null;
        };
        updateService.StatusChanged += OnUpdateStatusChanged;
    }

    private void OnUpdateStatusChanged(UpdateStatus status) =>
        Dispatcher.BeginInvoke(PushState);

    private static string HostPageUrl => $"https://{WebViewProtocol.AppHost}/settingshost.html";

    private async Task InitializeWebViewAsync()
    {
        try
        {
            // identical environment options to the other WebView hosts — one
            // shared user data folder and browser process
            var options = new CoreWebView2EnvironmentOptions
            {
                EnableTrackingPrevention = false,
            };
            CoreWebView2Environment environment;
            try
            {
                environment = await CoreWebView2Environment.CreateAsync(
                    null,
                    Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "FlowKey.Shell", "WebView2"),
                    options);
            }
            catch (Exception ex)
            {
                DebugLog.Write("settings environment with preferred options failed: " + ex.Message);
                environment = await CoreWebView2Environment.CreateAsync(
                    null,
                    Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "FlowKey.Shell", "WebView2"));
            }
            var webView = new WebView2
            {
                DefaultBackgroundColor = System.Drawing.Color.Transparent,
            };
            Root.Children.Add(webView);
            await webView.EnsureCoreWebView2Async(environment);
            this.webView = webView;

            var core = webView.CoreWebView2;
            var appWebFolder = Path.Combine(AppContext.BaseDirectory, "Assets", "Web");
            Directory.CreateDirectory(appWebFolder);
            core.SetVirtualHostNameToFolderMapping(
                WebViewProtocol.AppHost,
                appWebFolder,
                CoreWebView2HostResourceAccessKind.Allow);
            core.Settings.AreDevToolsEnabled =
                Environment.GetEnvironmentVariable("FLOWKEY_LOG") == "1";
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsBuiltInErrorPageEnabled = false;
            // lets the page declare app-region: drag so its title bar moves
            // the window, and no-drag on the window buttons
            core.Settings.IsNonClientRegionSupportEnabled = true;
            core.WebMessageReceived += (_, args) =>
            {
                var parsed = SettingsProtocol.ParseMessage(args.WebMessageAsJson);
                switch (parsed.Type)
                {
                    case SettingsMessageType.Ready:
                        Post(SettingsProtocol.SerializeTheme(SettingsTheme.BuildCss(key => TryFindResource(key))));
                        PushState();
                        break;
                    case SettingsMessageType.Invoke:
                        DispatchInvoke(parsed);
                        break;
                    case SettingsMessageType.Log:
                        DebugLog.Write("settings page: " + parsed.Message);
                        break;
                }
            };
            core.NavigationStarting += (_, args) =>
            {
                if (new Uri(args.Uri).Host != WebViewProtocol.AppHost)
                {
                    args.Cancel = true;
                }
            };
            core.ProcessFailed += (_, args) => ShowFallback("Settings renderer failed: " + args.ProcessFailedKind);
            await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
            webView.Source = new Uri(HostPageUrl);
        }
        catch (Exception ex)
        {
            DebugLog.Write("settings webview init failed: " + ex);
            ShowFallback("WebView2 is unavailable: " + ex.Message);
        }
    }

    private void ShowFallback(string message)
    {
        Root.Children.Clear();
        _ = new TextBlock
        {
            Text = message,
            Foreground = (System.Windows.Media.Brush)FindResource("TextSecondaryBrush"),
            FontSize = 13,
            Margin = new Thickness(24),
            TextWrapping = TextWrapping.Wrap,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
        };
    }

    private void Post(string json)
    {
        if (webView?.CoreWebView2 is not null)
        {
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }
    }

    /// <summary>Builds and pushes the full state snapshot; coalesces rapid updates to one push per dispatcher pass.</summary>
    private void PushState()
    {
        if (pushQueued)
        {
            return;
        }
        pushQueued = true;
        Dispatcher.BeginInvoke(() =>
        {
            pushQueued = false;
            try
            {
                var input = new SettingsStateInput(
                    Extensions: extensions,
                    LoadFailures: loadFailures,
                    Hotkeys: hotkeySettings.Load(),
                    OpenAtLogin: ReadOpenAtLogin(),
                    AutoUpdateCheck: updateService.IsAutoCheckEnabled(),
                    Update: SettingsStateBuilder.FromUpdate(updateService.Status),
                    IconFor: IconFor,
                    InstalledFor: extensionManager.GetInstalled,
                    OAuthStatusFor: OAuthStatusFor,
                    PreferencesFor: (extensionId, schema) => preferencesStore.Slice(extensionId, schema),
                    AppChoicesFor: GetAppChoices,
                    CommandEnabled: IsCommandEnabled,
                    PendingInstall: pendingInstall,
                    PendingReconsent: pendingReconsent,
                    Capture: capture);
                Post(SettingsProtocol.SerializeState(SettingsStateBuilder.Build(input)));
            }
            catch (Exception ex)
            {
                DebugLog.Write("settings PushState failed: " + ex);
            }
        });
    }

    private bool ReadOpenAtLogin()
    {
        try
        {
            return LoginLauncher.IsEnabled();
        }
        catch
        {
            return false;
        }
    }

    private FooterIconState? IconFor(string extensionId)
    {
        if (iconCache.TryGetValue(extensionId, out var cached))
        {
            return cached;
        }
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension is null)
        {
            return null;
        }
        var resolved = SettingsIconResolver.Resolve(extension, assetsDirResolver, key => TryFindResource(key));
        if (resolved is not null)
        {
            iconCache[extensionId] = resolved;
        }
        return resolved;
    }

    private SettingsOAuthRow OAuthStatusFor(string extensionId, string provider)
    {
        var key = extensionId + ":" + provider;
        if (oauthStatuses.TryGetValue(key, out var row))
        {
            return row;
        }
        if (oauthFetchesInFlight.Add(key))
        {
            ScheduleOAuthStatusFetch(extensionId, provider, key);
        }
        return new SettingsOAuthRow(provider, "checking", null);
    }

    private void ScheduleOAuthStatusFetch(string extensionId, string provider, string key)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension is null)
        {
            oauthFetchesInFlight.Remove(key);
            return;
        }
        _ = Task.Run(async () =>
        {
            try
            {
                var outcome = await oauthService.StatusAsync(
                    extensionId, BuildOAuthParameters(extension, provider),
                    extension.OAuth ?? new List<string>(), CancellationToken.None);
                var connected = outcome.Ok && outcome.Result is { } result
                    && result.ValueKind == JsonValueKind.Object
                    && result.TryGetProperty("ok", out var okElement)
                    && okElement.GetBoolean();
                _ = Dispatcher.BeginInvoke(() =>
                {
                    oauthStatuses[key] = connected
                        ? new SettingsOAuthRow(provider, "connected", null)
                        : new SettingsOAuthRow(provider, "disconnected", null);
                    oauthFetchesInFlight.Remove(key);
                    PushState();
                });
            }
            catch (Exception ex)
            {
                _ = Dispatcher.BeginInvoke(() =>
                {
                    oauthStatuses[key] = new SettingsOAuthRow(provider, "disconnected", ex.Message);
                    oauthFetchesInFlight.Remove(key);
                    PushState();
                });
            }
        });
    }

    private Dictionary<string, JsonElement> BuildOAuthParameters(ReadyExtension extension, string provider)
    {
        var parameters = new Dictionary<string, JsonElement>
        {
            ["provider"] = JsonSerializer.SerializeToElement(provider),
        };
        if (extension.Preferences is not null)
        {
            var current = preferencesStore.Slice(extension.Id, extension.Preferences);
            foreach (var pref in extension.Preferences)
            {
                if (pref.Name.Contains("ClientId", StringComparison.OrdinalIgnoreCase)
                    && current.TryGetValue(pref.Name, out var stored)
                    && stored.ValueKind == JsonValueKind.String
                    && stored.GetString() is { Length: > 0 })
                {
                    parameters[pref.Name] = stored;
                }
            }
        }
        return parameters;
    }

    private IReadOnlyList<SettingsAppOption> GetAppChoices()
    {
        // enumerated once per window lifetime; the picker list is long and
        // only feeds dropdown options
        appChoices ??= AppsFolderEnumerator.Enumerate()
            .Select(app => new SettingsAppOption(app.Name, app.LaunchPath))
            .ToList();
        return appChoices;
    }

    private bool IsCommandEnabled(string commandKey)
    {
        var separator = commandKey.IndexOf(':');
        if (separator <= 0 || separator == commandKey.Length - 1)
        {
            return true;
        }
        return CommandToggles.IsEnabled(commandKey[..separator], commandKey[(separator + 1)..]);
    }

    private void ReplyInvoke(string id, bool ok, object? result = null, string? error = null) =>
        Post(SettingsProtocol.SerializeInvokeResult(id, ok, result, error));

    private async void DispatchInvoke(ParsedSettingsMessage message)
    {
        try
        {
            await DispatchInvokeCoreAsync(message);
        }
        catch (Exception ex)
        {
            DebugLog.Write("settings invoke " + message.Op + " failed: " + ex);
            ReplyInvoke(message.Id, ok: false, error: ex.Message);
        }
    }

    private async Task DispatchInvokeCoreAsync(ParsedSettingsMessage message)
    {
        var id = message.Id;
        var op = message.Op;
        var p = message.Params;
        string ParamString(string name, string fallback = "") =>
            p.ValueKind == JsonValueKind.Object && p.TryGetProperty(name, out var element) && element.ValueKind == JsonValueKind.String
                ? element.GetString() ?? fallback
                : fallback;
        bool ParamBool(string name, bool fallback = false) =>
            p.ValueKind == JsonValueKind.Object && p.TryGetProperty(name, out var element)
                ? element.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => fallback,
                }
                : fallback;

        switch (op)
        {
            case "window.minimize":
                WindowState = WindowState.Minimized;
                ReplyInvoke(id, ok: true);
                return;
            case "window.maximize":
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                ReplyInvoke(id, ok: true);
                return;
            case "window.close":
                Close();
                ReplyInvoke(id, ok: true);
                return;

            case "setOpenAtLogin":
                FinishOutcome(id, operations.SetOpenAtLogin(ParamBool("enabled")));
                return;
            case "resetSummonHotkey":
                FinishOutcome(id, operations.ResetSummonHotkey());
                return;
            case "clearClipboardHistory":
                FinishOutcome(id, operations.ClearClipboardHistory());
                return;

            case "beginHotkeyCapture":
                capture = new SettingsCaptureState(ParamString("scope", "summon"), ParamString("commandKey") is { Length: > 0 } key ? key : null);
                SuspendGlobalHotkeys?.Invoke();
                ReplyInvoke(id, ok: true);
                PushState();
                return;
            case "cancelHotkeyCapture":
                capture = null;
                RestoreGlobalHotkeys?.Invoke();
                ReplyInvoke(id, ok: true);
                PushState();
                return;
            case "commitHotkeyCapture":
                CommitCapture(id, ParamString("combo"));
                return;

            case "setAutoUpdateCheck":
                updateService.SetAutoCheckEnabled(ParamBool("enabled"), Dispatcher);
                ReplyInvoke(id, ok: true);
                PushState();
                return;
            case "checkForUpdates":
                ReplyInvoke(id, ok: true);
                await updateService.CheckNowAsync();
                if (updateService.Status.Phase == UpdatePhase.Available)
                {
                    // download in the background; the install itself waits for
                    // the page's confirmation dialog (installUpdate op)
                    _ = updateService.DownloadUpdateAsync();
                }
                return;
            case "downloadUpdate":
                ReplyInvoke(id, ok: true);
                _ = updateService.DownloadUpdateAsync();
                return;
            case "installUpdate":
                ReplyInvoke(id, ok: true);
                _ = updateService.DownloadAndApplyAsync();
                return;

            case "setCommandShortcut":
                FinishOutcome(id, operations.CommitCommandCapture(ParamString("commandKey"), ParamString("combo")));
                return;
            case "clearCommandShortcut":
                FinishOutcome(id, operations.ClearCommandShortcut(ParamString("commandKey")));
                return;
            case "toggleCommand":
                FinishOutcome(id, operations.ToggleCommand(ParamString("commandKey"), ParamBool("enabled")));
                return;

            case "setExtensionEnabled":
                FinishOutcome(id, operations.SetExtensionEnabled(ParamString("extensionId"), ParamBool("enabled")));
                return;
            case "uninstallExtension":
                UninstallExtension(id, ParamString("extensionId"));
                return;
            case "pickExtensionPackage":
                PickExtensionPackage(id);
                return;
            case "confirmPendingInstall":
                ConfirmPendingInstall(id);
                return;
            case "cancelPendingInstall":
                pendingInstall = null;
                pendingInstallPath = null;
                ReplyInvoke(id, ok: true);
                PushState();
                return;
            case "reviewPermissions":
                BeginReconsent(id, ParamString("extensionId"));
                return;
            case "confirmPendingReconsent":
                if (pendingReconsent is null)
                {
                    ReplyInvoke(id, ok: false, error: "No pending re-consent");
                    return;
                }
                FinishOutcome(id, operations.UpdateConsent(pendingReconsent.ExtensionId));
                pendingReconsent = null;
                PushState();
                return;
            case "cancelPendingReconsent":
                pendingReconsent = null;
                ReplyInvoke(id, ok: true);
                PushState();
                return;

            case "oauthAuthorize":
                await OAuthAuthorizeAsync(id, ParamString("extensionId"), ParamString("provider"));
                return;
            case "oauthDisconnect":
                OAuthDisconnect(id, ParamString("extensionId"), ParamString("provider"));
                return;

            case "setPreferences":
                FinishOutcome(id, operations.SetPreferences(
                    ParamString("extensionId"),
                    ReadPreferenceValues(p)));
                return;

            case "browsePath":
                BrowsePath(id, ParamString("kind", "file"));
                return;

            default:
                ReplyInvoke(id, ok: false, error: "Unknown settings op: " + op);
                return;
        }
    }

    private static Dictionary<string, JsonElement> ReadPreferenceValues(JsonElement p)
    {
        var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("values", out var valuesElement)
            && valuesElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in valuesElement.EnumerateObject())
            {
                values[property.Name] = property.Value.Clone();
            }
        }
        return values;
    }

    private void FinishOutcome(string id, SettingsOpOutcome outcome)
    {
        ReplyInvoke(id, outcome.Ok, error: outcome.Error);
        if (outcome.Ok)
        {
            if (outcome.RefreshExtensions)
            {
                requestExtensionsRefresh();
            }
            else
            {
                PushState();
            }
        }
    }

    private void CommitCapture(string id, string combo)
    {
        if (capture is null)
        {
            ReplyInvoke(id, ok: false, error: "No recording in progress");
            return;
        }
        var outcome = capture.Scope == "command"
            ? operations.CommitCommandCapture(capture.CommandKey ?? "", combo)
            : operations.CommitSummonCapture(combo);
        if (outcome.Ok)
        {
            capture = null;
            RestoreGlobalHotkeys?.Invoke();
            ReplyInvoke(id, ok: true);
            PushState();
        }
        else
        {
            // keep recording so the page can show the reason inline
            ReplyInvoke(id, ok: false, error: outcome.Error);
        }
    }

    private void UninstallExtension(string id, string extensionId)
    {
        var name = extensionManager.GetInstalled(extensionId)?.Name ?? extensionId;
        var outcome = operations.UninstallExtension(extensionId);
        ReplyInvoke(id, outcome.Ok, error: outcome.Error);
        if (outcome.Ok)
        {
            operations.ShowToast(name + " uninstalled");
            requestExtensionsRefresh();
        }
        else
        {
            PushState();
        }
    }

    private void PickExtensionPackage(string id)
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Install extension package",
            Filter = "FlowKey extension (*.flowkey;*.zip)|*.flowkey;*.zip",
        };
        if (dialog.ShowDialog(this) != true)
        {
            ReplyInvoke(id, ok: true);
            return;
        }
        var plan = extensionManager.Inspect(dialog.FileName, out var inspectError);
        if (plan is null)
        {
            operations.ShowToast("Install failed: " + inspectError);
            ReplyInvoke(id, ok: true);
            return;
        }
        pendingInstall = new SettingsPendingConsent(
            Kind: "install",
            ExtensionId: plan.Id,
            Name: plan.Name,
            Version: plan.Version,
            Description: plan.Description,
            NativeMethods: plan.NativeMethods.ToList(),
            HttpHosts: plan.HttpHosts.ToList(),
            OAuth: plan.OAuth.ToList(),
            FsPaths: plan.FsPaths.ToList(),
            UriSchemes: plan.UriSchemes.ToList(),
            HasWebUi: plan.HasWebUi,
            ManifestWarnings: plan.ManifestWarnings.ToList());
        pendingInstallPlan = plan;
        pendingInstallPath = dialog.FileName;
        ReplyInvoke(id, ok: true);
        PushState();
    }

    private void ConfirmPendingInstall(string id)
    {
        if (pendingInstall is null || pendingInstallPlan is null || pendingInstallPath is null)
        {
            ReplyInvoke(id, ok: false, error: "No pending install");
            return;
        }
        // the stored consent is built from the inspected plan, never from the page
        var name = pendingInstall.Name;
        var version = pendingInstall.Version;
        var outcome = operations.InstallPackage(pendingInstallPlan, pendingInstallPath);
        pendingInstall = null;
        pendingInstallPlan = null;
        pendingInstallPath = null;
        if (outcome.Ok)
        {
            operations.ShowToast($"{name} v{version} installed");
            ReplyInvoke(id, ok: true);
            requestExtensionsRefresh();
        }
        else
        {
            operations.ShowToast(outcome.Error ?? "Install failed");
            ReplyInvoke(id, ok: false, error: outcome.Error);
            PushState();
        }
    }

    private void BeginReconsent(string id, string extensionId)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        var record = extension is null ? null : extensionManager.GetInstalled(extensionId);
        if (extension is null || record is null)
        {
            ReplyInvoke(id, ok: false, error: "Unknown extension: " + extensionId);
            return;
        }
        pendingReconsent = new SettingsPendingConsent(
            Kind: "reconsent",
            ExtensionId: extension.Id,
            Name: extension.Name,
            Version: record.Version,
            Description: extension.Description,
            NativeMethods: extension.NativeMethods.ToList(),
            HttpHosts: extension.HttpHosts.ToList(),
            OAuth: (extension.OAuth ?? new List<string>()).ToList(),
            FsPaths: (extension.FsPaths ?? new List<string>()).ToList(),
            UriSchemes: (extension.UriSchemes ?? new List<string>()).ToList(),
            HasWebUi: false,
            ManifestWarnings: new List<string>());
        ReplyInvoke(id, ok: true);
        PushState();
    }

    private async Task OAuthAuthorizeAsync(string id, string extensionId, string provider)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension is null)
        {
            ReplyInvoke(id, ok: false, error: "Unknown extension: " + extensionId);
            return;
        }
        var key = extensionId + ":" + provider;
        oauthStatuses[key] = new SettingsOAuthRow(provider, "authorizing", null);
        ReplyInvoke(id, ok: true);
        PushState();
        var outcome = await Task.Run(() => oauthService.AuthorizeAsync(
            extensionId, BuildOAuthParameters(extension, provider),
            extension.OAuth ?? new List<string>(), CancellationToken.None,
            TimeSpan.FromMinutes(5)));
        var succeeded = outcome.Ok;
        oauthStatuses[key] = succeeded
            ? new SettingsOAuthRow(provider, "connected", null)
            : new SettingsOAuthRow(provider, "disconnected", outcome.Error?.Message ?? "Authorization failed");
        PushState();
    }

    private void OAuthDisconnect(string id, string extensionId, string provider)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension is null)
        {
            ReplyInvoke(id, ok: false, error: "Unknown extension: " + extensionId);
            return;
        }
        var key = extensionId + ":" + provider;
        var outcome = oauthService.Disconnect(
            extensionId, BuildOAuthParameters(extension, provider),
            extension.OAuth ?? new List<string>());
        if (outcome.Ok)
        {
            oauthStatuses[key] = new SettingsOAuthRow(provider, "disconnected", null);
        }
        ReplyInvoke(id, outcome.Ok, error: outcome.Error?.Message);
        PushState();
    }

    private void BrowsePath(string id, string kind)
    {
        if (kind == "directory")
        {
            var folderDialog = new Microsoft.Win32.OpenFolderDialog { Title = "Choose folder" };
            if (folderDialog.ShowDialog(this) == true)
            {
                ReplyInvoke(id, ok: true, result: new { path = folderDialog.FolderName });
                return;
            }
        }
        else
        {
            var fileDialog = new Microsoft.Win32.OpenFileDialog { Title = "Choose file", CheckFileExists = true };
            if (fileDialog.ShowDialog(this) == true)
            {
                ReplyInvoke(id, ok: true, result: new { path = fileDialog.FileName });
                return;
            }
        }
        ReplyInvoke(id, ok: true);
    }
}
