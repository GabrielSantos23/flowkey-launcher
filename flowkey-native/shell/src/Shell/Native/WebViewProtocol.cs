using System.IO;
using System.Text.Json;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Native;

/// <summary>
/// Pure helpers for the WebView2 extension surface: mount URLs, theme CSS
/// generation, webview message parsing and props serialization. The WPF
/// wiring lives in Windows/WebViewHost.
/// </summary>
public static class WebViewProtocol
{
    public const string AppHost = "app.flowkey.local";
    public const string ExtensionsHost = "extensions.flowkey.local";
    /// <summary>Virtual host mapped to the shell's cached-artwork folder.</summary>
    public const string ArtHost = "art.flowkey.local";
    /// <summary>
    /// Virtual host mapped to the icon cache root, so pages can load clipboard
    /// previews (<c>clipboard/…</c>) and source-app icons (<c>sources/…</c>).
    /// </summary>
    public const string ClipboardHost = "clipboard.flowkey.local";

    public static string BuildHostPageUrl(string extensionId, string entry) =>
        $"https://{AppHost}/webhost.html?ext={Uri.EscapeDataString(extensionId)}&entry={Uri.EscapeDataString(entry)}";

    public static string BuildExtensionScriptUrl(string extensionId, string entry) =>
        $"https://{ExtensionsHost}/{Uri.EscapeDataString(entry)}";

    /// <summary>
    /// Resolves the folder to map the <see cref="ExtensionsHost"/> virtual host
    /// to for one web-command mount. The host page loads the bundle straight
    /// from the host root, so the mapped folder must contain <paramref name="entry"/>.
    /// First-party extensions (loaded from the repo by the sidecar's bundled
    /// registry) win over installed copies so dev builds stay fresh; the CLI
    /// puts their web bundles in a dist/ subfolder. Installed packages keep the
    /// packaged layout (bundle files beside manifest.json).
    /// </summary>
    public static string ResolveExtensionBundleFolder(
        string extensionId,
        string entry,
        string installedRoot,
        string? firstPartyRoot,
        Func<string, bool> fileExists)
    {
        var installedFolder = Path.Combine(installedRoot, extensionId);
        if (firstPartyRoot is not null)
        {
            var firstPartyFolder = Path.Combine(firstPartyRoot, extensionId);
            if (fileExists(Path.Combine(firstPartyFolder, "dist", entry)))
            {
                return Path.Combine(firstPartyFolder, "dist");
            }
            if (fileExists(Path.Combine(firstPartyFolder, entry)))
            {
                return firstPartyFolder;
            }
        }
        return installedFolder;
    }

    /// <summary>Converts FlowKey theme brush names into CSS custom properties.</summary>
    public static string BuildThemeCss(IReadOnlyDictionary<string, string> tokens)
    {
        var declarations = string.Join('\n', tokens.OrderBy(k => k.Key, StringComparer.Ordinal).Select(TokenToCss));
        return $":root {{\n{declarations}\n}}";
    }

    private static string TokenToCss(KeyValuePair<string, string> token)
    {
        var name = token.Key.EndsWith("Brush", StringComparison.Ordinal)
            ? token.Key[..^"Brush".Length]
            : token.Key;
        var kebab = System.Text.RegularExpressions.Regex.Replace(name, "(\\B[A-Z])", "-$1").ToLowerInvariant();
        return $"  --fk-{kebab}: {token.Value};";
    }

    public enum WebMessageType { Ready, Call, Abort, Log, OpenPalette, Unknown }

    /// <summary>An action a web page offers in the Ctrl+K action panel.</summary>
    public sealed record WebAction(string Id, string Title, string? Icon);

    /// <summary>
    /// What the mounted web page reports about its current screen so the shell
    /// chrome (search bar placeholder, footer hints, action panel, search-bar
    /// filter dropdown, back button) can render it natively and forward chrome
    /// interactions back.
    /// </summary>
    public sealed record WebViewState(
        string PrimaryTitle,
        bool CanGoBack,
        bool HasActions,
        List<UiFilterOption>? Filters,
        List<WebAction>? Actions = null,
        string? SearchPlaceholder = null,
        string? SelectionTitle = null);

    /// <summary>Parses the page's viewState message; null when malformed.</summary>
    public static WebViewState? ParseViewState(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("type", out var typeElement)
                || typeElement.ValueKind != JsonValueKind.String
                || typeElement.GetString() != "viewState")
            {
                return null;
            }
            var filters = new List<UiFilterOption>();
            if (root.TryGetProperty("filters", out var filtersElement)
                && filtersElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var element in filtersElement.EnumerateArray())
                {
                    if (element.ValueKind == JsonValueKind.Object
                        && element.TryGetProperty("value", out var valueElement)
                        && valueElement.ValueKind == JsonValueKind.String)
                    {
                        filters.Add(new UiFilterOption
                        {
                            Value = valueElement.GetString() ?? "",
                            Label = element.TryGetProperty("label", out var labelElement)
                                && labelElement.ValueKind == JsonValueKind.String
                                ? labelElement.GetString() ?? ""
                                : valueElement.GetString() ?? "",
                        });
                    }
                }
            }
            var actions = new List<WebAction>();
            if (root.TryGetProperty("actions", out var actionsElement)
                && actionsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var element in actionsElement.EnumerateArray())
                {
                    if (element.ValueKind == JsonValueKind.Object
                        && element.TryGetProperty("id", out var idElement)
                        && idElement.ValueKind == JsonValueKind.String)
                    {
                        actions.Add(new WebAction(
                            idElement.GetString() ?? "",
                            element.TryGetProperty("title", out var titleElement)
                                && titleElement.ValueKind == JsonValueKind.String
                                ? titleElement.GetString() ?? ""
                                : "",
                            OptionalString(element, "icon")));
                    }
                }
            }
            return new WebViewState(
                GetString(root, "primaryTitle"),
                root.TryGetProperty("canGoBack", out var backElement) && backElement.ValueKind == JsonValueKind.True,
                root.TryGetProperty("hasActions", out var hasActionsElement) && hasActionsElement.ValueKind == JsonValueKind.True,
                filters.Count > 0 ? filters : null,
                actions.Count > 0 ? actions : null,
                OptionalString(root, "searchPlaceholder"),
                OptionalString(root, "selectionTitle"));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>A trimmed string property, or null when absent/blank.</summary>
    private static string? OptionalString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return null;
        }
        var value = element.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    /// <summary>Extracts the action name of a pageAction message, or null.</summary>
    public static string? ParseViewAction(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("type", out var typeElement)
                || typeElement.ValueKind != JsonValueKind.String
                || typeElement.GetString() != "pageAction"
                || !root.TryGetProperty("action", out var actionElement)
                || actionElement.ValueKind != JsonValueKind.String)
            {
                return null;
            }
            return actionElement.GetString();
        }
        catch (JsonException)
        {
            return null;
        }
    }    public readonly record struct ParsedWebMessage(
        WebMessageType Type,
        string BridgeId = "",
        string ExtensionId = "",
        string Method = "",
        string? ParamsJson = null,
        int? TimeoutMs = null);

    /// <summary>Parses a webview postMessage payload. Returns Unknown for anything unrecognized.</summary>
    public static ParsedWebMessage ParseMessage(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ParsedWebMessage(WebMessageType.Unknown);
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return new ParsedWebMessage(WebMessageType.Unknown);
            }
            var type = root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
                ? typeElement.GetString()
                : null;
            switch (type)
            {
                case "ready":
                    return new ParsedWebMessage(WebMessageType.Ready);
                case "openPalette":
                    return new ParsedWebMessage(WebMessageType.OpenPalette);
                case "webAbort":
                    return new ParsedWebMessage(
                        WebMessageType.Abort,
                        GetString(root, "bridgeId"),
                        GetString(root, "extensionId"));
                case "log":
                    return new ParsedWebMessage(
                        WebMessageType.Log,
                        Method: root.TryGetProperty("message", out var logElement) && logElement.ValueKind == JsonValueKind.String
                            ? logElement.GetString()
                            : "");
                case "webCall":
                    var paramsJson = root.TryGetProperty("params", out var paramsElement)
                        ? paramsElement.GetRawText()
                        : null;
                    var timeoutMs = root.TryGetProperty("timeoutMs", out var timeoutElement)
                        && timeoutElement.ValueKind == JsonValueKind.Number
                        && timeoutElement.TryGetInt32(out var parsedTimeout)
                        ? parsedTimeout
                        : (int?)null;
                    return new ParsedWebMessage(
                        WebMessageType.Call,
                        GetString(root, "bridgeId"),
                        GetString(root, "extensionId"),
                        GetString(root, "method") ?? "",
                        paramsJson,
                        timeoutMs);
                default:
                    return new ParsedWebMessage(WebMessageType.Unknown);
            }
        }
        catch (JsonException)
        {
            return new ParsedWebMessage(WebMessageType.Unknown);
        }
    }

    private static string GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    /// <summary>Serializes the props payload posted to the webview after mount and on every update.</summary>
    public static string SerializeProps(WebViewMessage message)
    {
        var payload = new
        {
            type = "props",
            query = message.Props.Query,
            filterValue = message.Props.FilterValue,
            arguments = message.Props.Arguments,
            preferences = message.Props.Preferences,
            environment = message.Props.Environment,
        };
        // camelCase like every other wire payload: the page reads
        // props.environment.commandId, which PascalCase would hide
        return JsonSerializer.Serialize(payload, Protocol.JsonOptions.Default);
    }

    /// <summary>
    /// Serializes a webResult payload, rewriting file: URIs that point into
    /// the shell's artwork cache (produced by the gated image.fetch route) to
    /// <see cref="ArtHost"/> URLs, and clipboard preview/source-app icons to
    /// <see cref="ClipboardHost"/> URLs. Chromium refuses file: subresources
    /// on https pages no matter what the CSP allows, so the page could never
    /// display them directly.
    /// </summary>
    public static string SerializeResult(WebResultMessage message, string? artworkCacheRoot = null, string? iconCacheRoot = null) =>
        SerializeResultPayload(message, artworkCacheRoot, iconCacheRoot ?? IconUriPolicy.IconCacheRoot);

    private static string SerializeResultPayload(WebResultMessage message, string? artworkCacheRoot, string iconCacheRoot)
    {
        object payload;
        if (message.Ok)
        {
            var resultJson = RewriteResultJson(message.Result, artworkCacheRoot);
            var raw = resultJson is null ? "null" : resultJson.Value.GetRawText();
            var rewritten = RewriteClipboardFileUris(raw, iconCacheRoot);
            payload = new
            {
                type = "result",
                bridgeId = message.BridgeId,
                ok = true,
                result = System.Text.Json.Nodes.JsonNode.Parse(rewritten),
            };
        }
        else
        {
            payload = new { type = "result", bridgeId = message.BridgeId, ok = false, error = message.Error };
        }
        return JsonSerializer.Serialize(payload);
    }

    private static JsonElement? RewriteResultJson(JsonElement? result, string? artworkCacheRoot)
    {
        if (result is null || artworkCacheRoot is null || result.Value.ValueKind != JsonValueKind.Object)
        {
            return result;
        }
        var rewritten = RewriteArtworkFileUris(result.Value.GetRawText(), artworkCacheRoot);
        if (rewritten is null)
        {
            return result;
        }
        return JsonSerializer.Deserialize<JsonElement>(rewritten);
    }

    /// <summary>
    /// Replaces file: URI strings under <paramref name="artworkCacheRoot"/>
    /// with art-host URLs anywhere in the JSON document. Returns the input
    /// untouched when nothing matches.
    /// </summary>
    public static string? RewriteArtworkFileUris(string? json, string artworkCacheRoot)
    {
        if (string.IsNullOrEmpty(json))
        {
            return json;
        }
        string prefix;
        try
        {
            prefix = new Uri(artworkCacheRoot).AbsoluteUri.TrimEnd('/') + '/';
        }
        catch (UriFormatException)
        {
            return json;
        }
        return RewriteFilePrefix(json, prefix, $"https://{ArtHost}/");
    }

    /// <summary>
    /// Replaces file: URIs under the icon cache's <c>clipboard</c> (image
    /// previews and thumbnails) and <c>sources</c> (source-app icons) folders
    /// with clipboard-host URLs so WebView pages can load them — Chromium
    /// refuses file: subresources on https pages.
    /// </summary>
    public static string? RewriteClipboardFileUris(string? json, string iconCacheRoot)
    {
        if (string.IsNullOrEmpty(json))
        {
            return json;
        }
        var rewritten = RewriteFilePrefix(
            json,
            Path.Combine(iconCacheRoot, "clipboard"),
            $"https://{ClipboardHost}/clipboard/");
        return RewriteFilePrefix(
            rewritten,
            Path.Combine(iconCacheRoot, "sources"),
            $"https://{ClipboardHost}/sources/");
    }

    private static string? RewriteFilePrefix(string? json, string folderPath, string urlPrefix)
    {
        if (string.IsNullOrEmpty(json))
        {
            return json;
        }
        string prefix;
        try
        {
            prefix = new Uri(folderPath).AbsoluteUri.TrimEnd('/') + '/';
        }
        catch (UriFormatException)
        {
            return json;
        }
        var node = System.Text.Json.Nodes.JsonNode.Parse(json);
        if (node is null)
        {
            return json;
        }
        var replaced = ReplaceUriStrings(node, prefix, urlPrefix);
        return replaced ? node.ToJsonString() : json;
    }

    private static bool ReplaceUriStrings(System.Text.Json.Nodes.JsonNode? node, string prefix, string replacement)
    {
        switch (node)
        {
            case System.Text.Json.Nodes.JsonObject jsonObject:
                var touched = false;
                foreach (var property in jsonObject.ToList())
                {
                    if (property.Value is System.Text.Json.Nodes.JsonValue value
                        && value.TryGetValue<string>(out var text)
                        && text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    {
                        jsonObject[property.Key] = replacement + text[prefix.Length..];
                        touched = true;
                    }
                    else
                    {
                        touched |= ReplaceUriStrings(property.Value, prefix, replacement);
                    }
                }
                return touched;
            case System.Text.Json.Nodes.JsonArray array:
                var arrayTouched = false;
                for (var index = 0; index < array.Count; index++)
                {
                    var element = array[index];
                    if (element is System.Text.Json.Nodes.JsonValue arrayValue
                        && arrayValue.TryGetValue<string>(out var arrayText)
                        && arrayText.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    {
                        array[index] = replacement + arrayText[prefix.Length..];
                        arrayTouched = true;
                    }
                    else
                    {
                        arrayTouched |= ReplaceUriStrings(element, prefix, replacement);
                    }
                }
                return arrayTouched;
            default:
                return false;
        }
    }

    public static string SerializeTheme(string css) =>
        JsonSerializer.Serialize(new { type = "theme", css });

    /// <summary>
    /// Serializes the palette action the user committed in the native action
    /// panel; the page resolves the id against the actions it reported in its
    /// last viewState and runs it.
    /// </summary>
    public static string SerializePaletteAction(string actionId) =>
        JsonSerializer.Serialize(new { type = "paletteAction", action = actionId });
}
