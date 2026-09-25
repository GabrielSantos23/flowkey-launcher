using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record HudRequest(string Title, string? IconUri, string? Emoji, double DurationSeconds);

public static class HudService
{
    public const double DefaultDurationSeconds = 4;
    public const double MinDurationSeconds = 1;
    public const double MaxDurationSeconds = 10;

    public static bool TryParseRequest(Dictionary<string, JsonElement>? parameters, out HudRequest? request, out string? error)
    {
        request = null;
        error = null;
        if (parameters is null
            || !parameters.TryGetValue("title", out var titleElement)
            || titleElement.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(titleElement.GetString()))
        {
            error = "hud.show requires a non-empty string 'title' parameter";
            return false;
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
            if (durationElement.ValueKind is not (JsonValueKind.Number))
            {
                error = "hud.show 'duration' must be a number of seconds";
                return false;
            }
            var parsed = durationElement.GetDouble();
            if (double.IsNaN(parsed))
            {
                error = "hud.show 'duration' must be a number of seconds";
                return false;
            }
            duration = Math.Clamp(parsed, MinDurationSeconds, MaxDurationSeconds);
        }

        request = new HudRequest(titleElement.GetString()!.TrimEnd(), iconUri, emoji, duration);
        return true;
    }
}
