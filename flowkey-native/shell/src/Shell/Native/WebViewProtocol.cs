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

    public static string BuildHostPageUrl(string extensionId, string entry) =>
        $"https://{AppHost}/webhost.html?ext={Uri.EscapeDataString(extensionId)}&entry={Uri.EscapeDataString(entry)}";

    public static string BuildExtensionScriptUrl(string extensionId, string entry) =>
        $"https://{ExtensionsHost}/{Uri.EscapeDataString(extensionId)}/{entry}";

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

    public enum WebMessageType { Ready, Call, Abort, Log, Unknown }

    public readonly record struct ParsedWebMessage(
        WebMessageType Type,
        string BridgeId = "",
        string ExtensionId = "",
        string Method = "",
        string? ParamsJson = null);

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
                    return new ParsedWebMessage(
                        WebMessageType.Call,
                        GetString(root, "bridgeId"),
                        GetString(root, "extensionId"),
                        GetString(root, "method") ?? "",
                        paramsJson);
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
        return JsonSerializer.Serialize(payload);
    }

    public static string SerializeResult(WebResultMessage message)
    {
        object payload = message.Ok
            ? new { type = "result", bridgeId = message.BridgeId, ok = true, result = message.Result }
            : (object)new { type = "result", bridgeId = message.BridgeId, ok = false, error = message.Error };
        return JsonSerializer.Serialize(payload);
    }

    public static string SerializeTheme(string css) =>
        JsonSerializer.Serialize(new { type = "theme", css });
}
