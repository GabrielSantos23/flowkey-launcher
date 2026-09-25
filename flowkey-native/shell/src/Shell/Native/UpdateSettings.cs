using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record UpdateSettings(
    bool AutoCheckEnabled,
    long? LastCheckedAtMs)
{
    public static UpdateSettings Default { get; } = new(true, null);
}

public static class UpdateSettingsStore
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static UpdateSettings Load(string directory)
    {
        try
        {
            var path = Path.Combine(directory, "update-settings.json");
            if (!File.Exists(path))
            {
                return UpdateSettings.Default;
            }
            var loaded = JsonSerializer.Deserialize<UpdateSettings>(File.ReadAllText(path), Options);
            return loaded ?? UpdateSettings.Default;
        }
        catch (Exception ex)
        {
            DebugLog.Write("update settings load failed: " + ex.Message);
            return UpdateSettings.Default;
        }
    }

    public static void Save(string directory, UpdateSettings settings)
    {
        try
        {
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, "update-settings.json");
            File.WriteAllText(path, JsonSerializer.Serialize(settings, Options));
        }
        catch (Exception ex)
        {
            DebugLog.Write("update settings save failed: " + ex.Message);
        }
    }
}

/// <summary>
/// Compares dotted numeric versions (e.g. "1.2.10" vs "1.2.9"). Prefixed non-numeric
/// segments ("1.2.0-beta.1") compare below their plain counterpart; missing segments
/// count as zero.
/// </summary>
public static class UpdateVersionComparer
{
    public static int Compare(string? left, string? right)
    {
        var a = Parse(left);
        var b = Parse(right);
        var length = Math.Max(a.Length, b.Length);
        for (var i = 0; i < length; i++)
        {
            var av = i < a.Length ? a[i] : 0;
            var bv = i < b.Length ? b[i] : 0;
            var byKind = Kind(av).CompareTo(Kind(bv));
            if (byKind != 0)
            {
                return byKind;
            }
            if (av != bv)
            {
                return av < bv ? -1 : 1;
            }
        }
        return 0;
    }

    public static bool IsNewer(string? candidate, string? current) => Compare(candidate, current) > 0;

    // A segment carrying a prerelease suffix ("0-beta.1") sorts below the same plain
    // numeric segment, which is what we want when comparing "1.2.0-beta.1" to "1.2.0".
    private static int Kind(decimal segment) => segment % 1 == 0 ? 0 : -1;

    private static decimal[] Parse(string? version)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            return Array.Empty<decimal>();
        }
        var cleaned = version.Trim().TrimStart('v', 'V');
        var plus = cleaned.IndexOf('+');
        if (plus >= 0)
        {
            cleaned = cleaned[..plus];
        }
        var values = new List<decimal>();
        foreach (var segment in cleaned.Split('.'))
        {
            var end = 0;
            while (end < segment.Length && segment[end] is >= '0' and <= '9')
            {
                end++;
            }
            if (end == 0)
            {
                values.Add(-1m);
                continue;
            }
            var numeric = decimal.Parse(segment[..end], System.Globalization.CultureInfo.InvariantCulture);
            values.Add(end < segment.Length ? numeric - 0.5m : numeric);
        }
        return values.ToArray();
    }
}
