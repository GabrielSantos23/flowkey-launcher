using System.Text.Json;

namespace FlowKey.Shell.Native;

public enum SettingsMessageType { Ready, Invoke, Log, Unknown }

public readonly record struct ParsedSettingsMessage(
    SettingsMessageType Type,
    string Id = "",
    string Op = "",
    string Message = "",
    JsonElement Params = default);

/// <summary>
/// Wire helpers for the settings surface: the shell pushes a serialized
/// <see cref="SettingsState"/> (plus theme CSS) to the page, the page answers
/// with ready / invoke / log messages, and the shell replies to invokes with
/// invokeResult. Same postMessage style as FooterProtocol and the extension
/// WebView bridge (WebViewProtocol).
/// </summary>
public static class SettingsProtocol
{
    public static string SerializeState(SettingsState state) =>
        JsonSerializer.Serialize(new { type = "state", state }, Protocol.JsonOptions.Default);

    public static string SerializeTheme(string css) =>
        JsonSerializer.Serialize(new { type = "theme", css }, Protocol.JsonOptions.Default);

    public static string SerializeInvokeResult(string id, bool ok, object? result = null, string? error = null) =>
        JsonSerializer.Serialize(new { type = "invokeResult", id, ok, result, error }, Protocol.JsonOptions.Default);

    public static ParsedSettingsMessage ParseMessage(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ParsedSettingsMessage(SettingsMessageType.Unknown);
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return new ParsedSettingsMessage(SettingsMessageType.Unknown);
            }
            var type = root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
                ? typeElement.GetString()
                : null;
            switch (type)
            {
                case "ready":
                    return new ParsedSettingsMessage(SettingsMessageType.Ready);
                case "log":
                    return new ParsedSettingsMessage(
                        SettingsMessageType.Log,
                        Message: root.TryGetProperty("message", out var logElement)
                            && logElement.ValueKind == JsonValueKind.String
                            ? logElement.GetString() ?? ""
                            : "");
                case "invoke":
                    var id = root.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.String
                        ? idElement.GetString() ?? ""
                        : "";
                    var op = root.TryGetProperty("op", out var opElement) && opElement.ValueKind == JsonValueKind.String
                        ? opElement.GetString() ?? ""
                        : "";
                    var params_element = root.TryGetProperty("params", out var paramsElement)
                        ? paramsElement.Clone()
                        : default(JsonElement);
                    return new ParsedSettingsMessage(SettingsMessageType.Invoke, Id: id, Op: op, Params: params_element);
                default:
                    return new ParsedSettingsMessage(SettingsMessageType.Unknown);
            }
        }
        catch (JsonException)
        {
            return new ParsedSettingsMessage(SettingsMessageType.Unknown);
        }
    }
}
