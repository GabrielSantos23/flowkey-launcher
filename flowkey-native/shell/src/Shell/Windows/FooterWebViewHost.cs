using System.IO;
using System.Text.Json;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Windows;

/// <summary>
/// Hosts the WebView2 footer chrome page — the same pipeline as the extension
/// webview (app.flowkey.local host page + theme CSS + postMessage), but
/// shell-owned: the page is a pure renderer for FooterState pushes, it never
/// loads extension content. Shares the command WebView's user-data folder so
/// both surfaces run in one browser process. The native XAML footer stays in
/// place until this page reports ready, and permanently when the WebView2
/// runtime is missing.
/// </summary>
public sealed class FooterWebViewHost : IDisposable
{
    private readonly Grid container;
    private WebView2? webView;
    private bool initialized;
    private string themeCss = string.Empty;
    private string? lastStateJson;

    /// <summary>The footer page mounted and is rendering state pushes.</summary>
    public event Action? Ready;
    /// <summary>Initialization or the renderer process failed; the caller keeps the native footer.</summary>
    public event Action<string>? Failed;
    /// <summary>The page requested a chrome interaction ("settings").</summary>
    public event Action<string>? ActionRequested;
    public event Action<string>? LogEmitted;

    /// <summary>True once the page posted ready; before that, state pushes are buffered.</summary>
    public bool IsReady { get; private set; }

    public FooterWebViewHost(Grid container)
    {
        this.container = container;
    }

    public static string HostPageUrl => $"https://{WebViewProtocol.AppHost}/footerhost.html";

    public async Task InitializeAsync()
    {
        if (initialized)
        {
            return;
        }
        initialized = true;
        try
        {
            // identical environment options to the command WebView — both
            // hosts share one user data folder and must match to share the
            // same browser process (tracking prevention off: shell-owned
            // content only)
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
                LogEmitted?.Invoke("footer environment with preferred options failed: " + ex.Message);
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
            container.Children.Add(webView);
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
            // Lets the page declare app-region: drag so the footer background
            // keeps dragging the window like the native bar does.
            core.Settings.IsNonClientRegionSupportEnabled = true;
            core.WebMessageReceived += (_, args) =>
            {
                var parsed = FooterProtocol.ParseMessage(args.WebMessageAsJson);
                switch (parsed.Type)
                {
                    case FooterMessageType.Ready:
                        IsReady = true;
                        Post(JsonSerializer.Serialize(new { type = "theme", css = themeCss }));
                        if (lastStateJson is not null)
                        {
                            Post(lastStateJson);
                        }
                        Ready?.Invoke();
                        break;
                    case FooterMessageType.Action:
                        ActionRequested?.Invoke(parsed.Action);
                        break;
                    case FooterMessageType.Log:
                        LogEmitted?.Invoke(parsed.Message);
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
            core.ProcessFailed += (_, args) => Failed?.Invoke(args.ProcessFailedKind.ToString());
            webView.Source = new Uri(HostPageUrl);
        }
        catch (Exception ex)
        {
            Failed?.Invoke(ex.Message);
        }
    }

    public void SetThemeCss(string css)
    {
        themeCss = css;
        if (IsReady)
        {
            Post(JsonSerializer.Serialize(new { type = "theme", css }));
        }
    }

    /// <summary>Pushes a serialized FooterState; buffered until the page is ready.</summary>
    public void PostState(string stateJson)
    {
        lastStateJson = stateJson;
        if (IsReady)
        {
            Post(stateJson);
        }
    }

    private void Post(string json)
    {
        if (webView?.CoreWebView2 is not null)
        {
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }
    }

    public void Dispose()
    {
        webView?.Dispose();
        webView = null;
    }
}
