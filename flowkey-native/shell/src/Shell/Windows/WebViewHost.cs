using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Windows;

/// <summary>
/// Hosts the WebView2 surface for `ui: 'web'` extension commands. One instance
/// is shared by all web commands: the loaded page swaps when a different
/// extension/entry is activated, otherwise updates are posted as props.
/// </summary>
public sealed class WebViewHost : IDisposable
{
    private readonly Grid container;
    private WebView2? webView;
    private bool initialized;
    private bool initializationFailed;
    private string? currentExtensionId;
    private string? currentEntry;
    private WebViewMessage? lastMount;
    private string themeCss = string.Empty;
    private readonly string artworkCacheRoot = Path.Combine(IconUriPolicy.IconCacheRoot, "images");

    /// <summary>bridgeId / extensionId / method / params JSON / timeoutMs for a webview capability call.</summary>
    public event Action<string, string, string, string?, int?>? CallRequested;
    public event Action<string>? LogEmitted;
    public event Action<string, string>? AbortRequested;
    public event Action<string>? LoadFailed;
    /// <summary>The mounted page reported new chrome state (primary action, filters, back-stack).</summary>
    public event Action<string, string>? ViewStateEmitted;

    /// <summary>The page asked for the action panel (Ctrl+K while the page has keyboard focus).</summary>
    public event Action? PaletteRequested;

    public WebViewHost(Grid container)
    {
        this.container = container;
    }

    public static bool RuntimeAvailable()
    {
        try
        {
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public static string BuildThemeCssFromResources(Func<string, object?> findResource)
    {
        var keys = new[]
        {
            "WindowBackgroundBrush", "SurfaceBrush", "SurfaceAltBrush", "TextPrimaryBrush",
            "TextSecondaryBrush", "TextTertiaryBrush", "AccentBrush", "DividerBrush",
            "SuccessBrush", "DangerBrush", "RowSelectedBackgroundBrush", "KeycapBackgroundBrush",
        };
        var tokens = new Dictionary<string, string>();
        foreach (var key in keys)
        {
            if (findResource(key) is System.Windows.Media.SolidColorBrush brush)
            {
                var color = brush.Color;
                tokens[key] = $"#{color.R:X2}{color.G:X2}{color.B:X2}";
            }
        }
        return WebViewProtocol.BuildThemeCss(tokens);
    }

    public async Task ShowAsync(WebViewMessage message, string extensionsRoot, string? firstPartyExtensionsRoot)
    {
        lastMount = message;
        themeCss ??= string.Empty;
        container.Visibility = Visibility.Visible;
        if (!initialized)
        {
            if (initializationFailed)
            {
                ShowFallback("The WebView2 runtime is missing. Install the Evergreen WebView2 Runtime to use web extensions.");
                return;
            }
            await InitializeAsync();
        }
        if (webView is null)
        {
            return;
        }
        var core = webView.CoreWebView2;
        var bundleFolder = WebViewProtocol.ResolveExtensionBundleFolder(
            message.ExtensionId,
            message.Entry,
            extensionsRoot,
            firstPartyExtensionsRoot,
            File.Exists);
        core.SetVirtualHostNameToFolderMapping(
            WebViewProtocol.ExtensionsHost,
            bundleFolder,
            CoreWebView2HostResourceAccessKind.Allow);
        if (currentExtensionId != message.ExtensionId || currentEntry != message.Entry)
        {
            currentExtensionId = message.ExtensionId;
            currentEntry = message.Entry;
            webView.Source = new Uri(WebViewProtocol.BuildHostPageUrl(message.ExtensionId, message.Entry));
        }
        else
        {
            PostProps(message);
        }
    }

    /// <summary>
    /// True when the mounted page already is this extension/entry, so an
    /// incoming webView message is a props-only update (no reload). The shell
    /// keeps the page's reported chrome state in that case: pages dedup their
    /// viewState posts, so a reset would never be refreshed.
    /// </summary>
    public bool IsShowing(string extensionId, string entry) =>
        currentExtensionId == extensionId && currentEntry == entry;

    /// <summary>
    /// True when keyboard focus sits inside the WebView2 surface, so the page
    /// owns arrow/enter/escape/shortcut handling at the window level.
    /// </summary>
    public bool ContainsKeyboardFocus => webView is { IsKeyboardFocusWithin: true };

    public void Hide()
    {
        container.Visibility = Visibility.Collapsed;
    }

    public void SetThemeCss(string css)
    {
        themeCss = css;
        Post(JsonSerializer.Serialize(new { type = "theme", css }));
    }

    public void PostProps(WebViewMessage message)
    {
        lastMount = message;
        Post(WebViewProtocol.SerializeProps(message));
    }

    public void PostWebResult(WebResultMessage message)
    {
        LogEmitted?.Invoke($"posting webResult bridgeId={message.BridgeId} ok={message.Ok}");
        Post(WebViewProtocol.SerializeResult(message, artworkCacheRoot));
    }

    /// <summary>
    /// Asks the mounted page to run one of its chrome-driven interactions:
    /// "primary" (footer ↵), "openPalette" (footer Ctrl+K), "goBack"
    /// (back button / escape) or a scroll step ("moveUp"/"moveDown"/"pageUp"/
    /// "pageDown", which drive row selection or the page's scroll region) —
    /// used while keyboard focus sits in the launcher search box, where the
    /// page cannot see the keystrokes.
    /// </summary>
    public void PostPageAction(string action) =>
        Post(JsonSerializer.Serialize(new { type = "pageAction", action }));

    /// <summary>
    /// Runs the palette action the user committed in the native action panel;
    /// the page resolves the id against the actions it reported in viewState.
    /// </summary>
    public void PostPaletteAction(string actionId) =>
        Post(WebViewProtocol.SerializePaletteAction(actionId));

    private void Post(string json)
    {
        if (webView?.CoreWebView2 is not null)
        {
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }
    }

    private async Task InitializeAsync()
    {
        initialized = true;
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FlowKey.Shell", "WebView2"));
            LogEmitted?.Invoke("initializing webview environment");
            var webView = new WebView2
            {
                DefaultBackgroundColor = System.Drawing.Color.Transparent,
            };
            container.Children.Add(webView);
            await webView.EnsureCoreWebView2Async(environment);
            LogEmitted?.Invoke("webview initialized");
            this.webView = webView;

            var core = webView.CoreWebView2;
            var appWebFolder = Path.Combine(AppContext.BaseDirectory, "Assets", "Web");
            Directory.CreateDirectory(appWebFolder);
            core.SetVirtualHostNameToFolderMapping(
                WebViewProtocol.AppHost,
                appWebFolder,
                CoreWebView2HostResourceAccessKind.Allow);
            // Cached artwork (the shell's own image.fetch output) is served to
            // the page over a virtual host; file: URIs are unreadable there.
            try
            {
                Directory.CreateDirectory(artworkCacheRoot);
                core.SetVirtualHostNameToFolderMapping(
                    WebViewProtocol.ArtHost,
                    artworkCacheRoot,
                    CoreWebView2HostResourceAccessKind.Allow);
            }
            catch (Exception ex)
            {
                LogEmitted?.Invoke("artwork host mapping failed: " + ex.Message);
            }
            core.Settings.AreDevToolsEnabled =
                Environment.GetEnvironmentVariable("FLOWKEY_LOG") == "1";
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsBuiltInErrorPageEnabled = false;
            core.NavigationCompleted += (_, args) =>
            {
                LogEmitted?.Invoke($"navigation completed ok={args.IsSuccess} status={args.WebErrorStatus}");
            };
            core.WebMessageReceived += (_, args) =>
            {
                LogEmitted?.Invoke($"message: {args.WebMessageAsJson}".SliceOrFull(160));
                var parsed = WebViewProtocol.ParseMessage(args.WebMessageAsJson);
                switch (parsed.Type)
                {
                    case WebViewProtocol.WebMessageType.Ready:
                        Post(JsonSerializer.Serialize(new { type = "theme", css = themeCss }));
                        if (lastMount is not null)
                        {
                            PostProps(lastMount);
                        }
                        break;
                    case WebViewProtocol.WebMessageType.OpenPalette:
                        PaletteRequested?.Invoke();
                        break;
                    case WebViewProtocol.WebMessageType.Call:
                        CallRequested?.Invoke(
                            parsed.BridgeId,
                            parsed.ExtensionId,
                            parsed.Method,
                            parsed.ParamsJson,
                            parsed.TimeoutMs);
                        break;
                    case WebViewProtocol.WebMessageType.Abort:
                        AbortRequested?.Invoke(parsed.BridgeId, parsed.ExtensionId);
                        break;
                    case WebViewProtocol.WebMessageType.Unknown when
                        args.WebMessageAsJson.Contains("\"viewState\"", StringComparison.Ordinal):
                        if (currentExtensionId is not null)
                        {
                            ViewStateEmitted?.Invoke(currentExtensionId, args.WebMessageAsJson);
                        }
                        break;
                }
            };
            core.NavigationStarting += (_, args) =>
            {
                var uri = new Uri(args.Uri);
                if (uri.Host is not (WebViewProtocol.AppHost or WebViewProtocol.ExtensionsHost))
                {
                    args.Cancel = true;
                }
            };
            core.ProcessFailed += (_, args) =>
            {
                LoadFailed?.Invoke(args.ProcessFailedKind.ToString());
            };
        }
        catch (Exception ex)
        {
            initializationFailed = true;
            ShowFallback("The WebView2 runtime could not be loaded: " + ex.Message);
            LoadFailed?.Invoke(ex.Message);
        }
    }

    private void ShowFallback(string message)
    {
        container.Children.Clear();
        container.Children.Add(new TextBlock
        {
            Text = message,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(24),
            VerticalAlignment = VerticalAlignment.Center,
        });
    }

    public void Dispose()
    {
        webView?.Dispose();
        webView = null;
    }
}

internal static class WebViewHostStringExtensions
{
    public static string SliceOrFull(this string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";
}
