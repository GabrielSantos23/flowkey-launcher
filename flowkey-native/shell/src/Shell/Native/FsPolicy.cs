using System.Text.RegularExpressions;

namespace FlowKey.Shell.Native;

/// <summary>
/// Filesystem scope policy for extensions. A manifest declares absolute path
/// globs (fsPaths) which may contain {{preferenceName}} placeholders; the
/// placeholders interpolate the user's current preference values at call
/// time, so an extension can ask for a recursive markdown glob rooted at the
/// user's own vault and the user decides which folder that actually is.
/// Scopes are intersected with the consent record for installed extensions
/// by ExtensionPolicy.
/// </summary>
public static partial class FsPolicy
{
    /// <summary>
    /// Interpolates {{name}} placeholders with the extension's preference
    /// values. Returns the scope unchanged when it has no placeholders, and
    /// null when a placeholder has no (or an empty) preference - fail-closed.
    /// </summary>
    public static string? Interpolate(string scope, IReadOnlyDictionary<string, string> preferences)
    {
        var missing = false;
        var result = Placeholder().Replace(scope, match =>
        {
            var name = match.Groups[1].Value;
            if (preferences.TryGetValue(name, out var value) && value.Trim().Length > 0)
            {
                return value.Trim();
            }
            missing = true;
            return string.Empty;
        });
        return missing ? null : result;
    }

    /// <summary>Interpolates every scope, dropping the ones whose preferences are unset.</summary>
    public static IReadOnlyList<string> InterpolateAll(
        IReadOnlyList<string> scopes, IReadOnlyDictionary<string, string> preferences)
    {
        var result = new List<string>();
        foreach (var scope in scopes)
        {
            var interpolated = Interpolate(scope, preferences);
            if (interpolated is not null)
            {
                result.Add(interpolated);
            }
        }
        return result;
    }

    /// <summary>True when the absolute path matches at least one interpolated scope glob.</summary>
    public static bool IsAllowed(string path, IReadOnlyList<string> interpolatedScopes)
    {
        if (interpolatedScopes.Count == 0 || string.IsNullOrWhiteSpace(path))
        {
            return false;
        }
        if (path.Split(new[] { '/', '\\' }, StringSplitOptions.None).Any(segment => segment == ".."))
        {
            return false;
        }
        var normalized = path.Replace('/', '\\');
        foreach (var scope in interpolatedScopes)
        {
            var pattern = GlobToRegex(scope.Replace('/', '\\'));
            if (pattern is null)
            {
                continue;
            }
            if (Regex.IsMatch(normalized, pattern, RegexOptions.IgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>
    /// Converts a glob into an anchored regex: a double star spans
    /// separators, a single star and question mark stay within one segment,
    /// everything else is literal.
    /// </summary>
    public static string? GlobToRegex(string glob)
    {
        if (glob.Length == 0)
        {
            return null;
        }
        var sb = new System.Text.StringBuilder("^");
        for (var i = 0; i < glob.Length; i++)
        {
            var c = glob[i];
            if (c == '*')
            {
                if (i + 1 < glob.Length && glob[i + 1] == '*')
                {
                    if (i + 2 < glob.Length && (glob[i + 2] == '/' || glob[i + 2] == '\\'))
                    {
                        sb.Append("(?:.*[\\\\/])?");
                        i += 2;
                    }
                    else
                    {
                        sb.Append(".*");
                        i++;
                    }
                }
                else
                {
                    sb.Append("[^\\\\/]*");
                }
            }
            else if (c == '?')
            {
                sb.Append("[^\\\\/]");
            }
            else
            {
                sb.Append(Regex.Escape(c.ToString()));
            }
        }
        return sb.ToString() + '$';
    }

    [GeneratedRegex(@"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")]
    private static partial Regex Placeholder();
}
