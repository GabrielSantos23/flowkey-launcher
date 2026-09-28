using System.Text.Json;

namespace FlowKey.Shell.Native;

public enum FooterMessageType { Ready, Action, Log, Unknown }

public readonly record struct ParsedFooterMessage(FooterMessageType Type, string Action = "", string Message = "");

/// <summary>
/// Wire helpers for the footer chrome surface: the shell pushes a serialized
/// <see cref="FooterState"/> to the footer page, and the page answers with
/// ready/action/log messages. Same postMessage style as the extension
/// webview bridge (WebViewProtocol).
/// </summary>
public static class FooterProtocol
{
    public static string SerializeState(FooterState state)
    {
        var payload = new
        {
            type = "state",
            left = state.Left,
            primaryTitle = state.PrimaryTitle,
            showActionsHint = state.ShowActionsHint,
            toast = state.Toast,
        };
        // camelCase like every other wire payload: the page reads
        // state.showActionsHint / state.left.dataUri, which PascalCase would hide
        return JsonSerializer.Serialize(payload, Protocol.JsonOptions.Default);
    }

    public static ParsedFooterMessage ParseMessage(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ParsedFooterMessage(FooterMessageType.Unknown);
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return new ParsedFooterMessage(FooterMessageType.Unknown);
            }
            var type = root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
                ? typeElement.GetString()
                : null;
            switch (type)
            {
                case "ready":
                    return new ParsedFooterMessage(FooterMessageType.Ready);
                case "action":
                    return root.TryGetProperty("action", out var actionElement)
                        && actionElement.ValueKind == JsonValueKind.String
                        ? new ParsedFooterMessage(FooterMessageType.Action, actionElement.GetString() ?? "")
                        : new ParsedFooterMessage(FooterMessageType.Unknown);
                case "log":
                    return new ParsedFooterMessage(
                        FooterMessageType.Log,
                        Message: root.TryGetProperty("message", out var logElement)
                            && logElement.ValueKind == JsonValueKind.String
                            ? logElement.GetString() ?? ""
                            : "");
                default:
                    return new ParsedFooterMessage(FooterMessageType.Unknown);
            }
        }
        catch (JsonException)
        {
            return new ParsedFooterMessage(FooterMessageType.Unknown);
        }
    }
}
