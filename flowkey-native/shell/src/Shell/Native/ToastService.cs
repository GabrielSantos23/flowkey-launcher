using System.Text.Json;

namespace FlowKey.Shell.Native;

public enum ToastStyle
{
    Neutral,
    Success,
    Failure,
}

public sealed record ToastRequest(
    string Title,
    string? Message,
    ToastStyle Style,
    string? IconUri,
    string? Emoji,
    double DurationSeconds);

/// <summary>
/// Parses `toast.show` parameters for the extension toast surface. Pure logic;
/// the window lives in Windows/ToastWindow.
/// </summary>
public static class ToastService
{
    public const double DefaultDurationSeconds = HudService.DefaultDurationSeconds;
    public const double MinDurationSeconds = HudService.MinDurationSeconds;
    public const double MaxDurationSeconds = HudService.MaxDurationSeconds;

    public static bool TryParseRequest(Dictionary<string, JsonElement>? parameters, out ToastRequest? request, out string? error)
    {
        request = null;
        error = null;
        if (parameters is null
            || !parameters.TryGetValue("title", out var titleElement)
            || titleElement.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(titleElement.GetString()))
        {
            error = "toast.show requires a non-empty string 'title' parameter";
            return false;
        }

        string? message = null;
        if (parameters.TryGetValue("message", out var messageElement))
        {
            if (messageElement.ValueKind != JsonValueKind.String)
            {
                error = "toast.show 'message' must be a string";
                return false;
            }
            message = messageElement.GetString();
        }

        var style = ToastStyle.Neutral;
        if (parameters.TryGetValue("style", out var styleElement))
        {
            switch (styleElement.ValueKind == JsonValueKind.String ? styleElement.GetString() : null)
            {
                case "success":
                    style = ToastStyle.Success;
                    break;
                case "failure":
                    style = ToastStyle.Failure;
                    break;
                case null when styleElement.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined:
                    break;
                default:
                    error = "toast.show 'style' must be one of: success, failure";
                    return false;
            }
        }

        string? iconUri = null;
        string? emoji = null;
        if (parameters.TryGetValue("icon", out var iconElement) && iconElement.ValueKind == JsonValueKind.String)
        {
            var icon = iconElement.GetString();
            if (!string.IsNullOrEmpty(icon))
            {
                if (icon.StartsWith("data:", StringComparison.Ordinal) || icon.StartsWith("file:", StringComparison.Ordinal))
                {
                    iconUri = icon;
                }
                else
                {
                    emoji = icon;
                }
            }
        }

        var duration = DefaultDurationSeconds;
        if (parameters.TryGetValue("duration", out var durationElement))
        {
            if (durationElement.ValueKind is not JsonValueKind.Number)
            {
                error = "toast.show 'duration' must be a number of seconds";
                return false;
            }
            var parsed = durationElement.GetDouble();
            if (double.IsNaN(parsed))
            {
                error = "toast.show 'duration' must be a number of seconds";
                return false;
            }
            duration = Math.Clamp(parsed, MinDurationSeconds, MaxDurationSeconds);
        }

        request = new ToastRequest(
            titleElement.GetString()!.TrimEnd(),
            string.IsNullOrEmpty(message) ? null : message,
            style,
            iconUri,
            emoji,
            duration);
        return true;
    }
}
