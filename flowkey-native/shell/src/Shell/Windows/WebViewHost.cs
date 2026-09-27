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

    /// <summary>bridgeId / extensionId / method / params JSON for a webview capability call.</summary>
    public event Action<string, string, string, string?>? CallRequested;
    public event Action<string>? LogEmitted;
    public event Action<string, string>? AbortRequested;
    public event Action<string>? LoadFailed;

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

    public async Task ShowAsync(WebViewMessage message, string extensionsRoot)
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
            await InitializeAsync(extensionsRoot);
        }
        if (webView is null)
        {
            return;
        }
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
        Post(WebViewProtocol.SerializeResult(message));
    }

    private void Post(string json)
    {
        if (webView?.CoreWebView2 is not null)
        {
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }
    }

    private async Task InitializeAsync(string extensionsRoot)
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
            core.SetVirtualHostNameToFolderMapping(
                WebViewProtocol.ExtensionsHost,
                extensionsRoot,
                CoreWebView2HostResourceAccessKind.Allow);
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
                    case WebViewProtocol.WebMessageType.Call:
                        CallRequested?.Invoke(parsed.BridgeId, parsed.ExtensionId, parsed.Method, parsed.ParamsJson);
                        break;
                    case WebViewProtocol.WebMessageType.Abort:
                        AbortRequested?.Invoke(parsed.BridgeId, parsed.ExtensionId);
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
