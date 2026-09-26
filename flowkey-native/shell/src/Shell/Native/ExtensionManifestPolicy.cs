using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record ManifestIssue(string Field, string Code, string Message);

public sealed record ManifestValidationResult(
    IReadOnlyList<ManifestIssue> Errors,
    IReadOnlyList<ManifestIssue> Warnings)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Structural manifest validation mirroring <c>validateManifest</c> in
/// @flowkey/native-sdk. Both implementations are pinned to identical
/// accept/reject behavior by <c>contract/manifest.fixture.json</c>.
/// </summary>
public static class ExtensionManifestValidator
{
    public const string DefaultEntry = "main.js";
    public const string ReservedActionId = "__open__";

    private const int MaxIdLength = 64;
    private const int MaxNameLength = 50;
    private const int MaxDescriptionLength = 200;
    private const int MaxCommandTitleLength = 80;
    private const int MaxCommands = 128;
    private const int MaxNativeMethods = 128;
    private const int MaxHttpHosts = 64;
    private const int MaxPreferences = 32;

    public static ManifestValidationResult Validate(JsonElement root)
    {
        var errors = new List<ManifestIssue>();
        var warnings = new List<ManifestIssue>();
        if (root.ValueKind != JsonValueKind.Object)
        {
            return new ManifestValidationResult(
                [new ManifestIssue("", "notAnObject", "manifest must be a JSON object")],
                warnings);
        }

        // id
        if (!root.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String)
        {
            Add(errors, "id", "required", "id is required");
        }
        else
        {
            var value = id.GetString() ?? "";
            if (value.Contains(".."))
            {
                Add(errors, "id", "pathUnsafe", "id must not contain \"..\"");
            }
            else if (value.Length > MaxIdLength)
            {
                Add(errors, "id", "tooLong", $"id must be at most {MaxIdLength} characters");
            }
            else if (!System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-z0-9][a-z0-9._-]*$"))
            {
                Add(errors, "id", "format", "id must match ^[a-z0-9][a-z0-9._-]*$ (lowercase slug)");
            }
        }

        // name
        if (!root.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(name.GetString()))
        {
            Add(errors, "name", "required", "name is required");
        }
        else if (name.GetString()!.Trim().Length is < 2 or > MaxNameLength)
        {
            Add(errors, "name", "length", $"name must be between 2 and {MaxNameLength} characters");
        }

        // version
        if (!root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.String
            || version.GetString()!.Length == 0)
        {
            Add(errors, "version", "required", "version is required");
        }
        else if (!SemVer.TryParseTriple(version.GetString()!, out _))
        {
            Add(errors, "version", "format", "version must be semver (major.minor.patch with optional pre-release/build)");
        }

        // description
        if (!root.TryGetProperty("description", out var description))
        {
            Add(warnings, "description", "missing", "description is recommended");
        }
        else if (description.ValueKind != JsonValueKind.String)
        {
            Add(errors, "description", "format", "description must be a string");
        }
        else if (description.GetString()!.Length > MaxDescriptionLength)
        {
            Add(errors, "description", "tooLong", $"description must be at most {MaxDescriptionLength} characters");
        }

        // icon — emoji, lucide name, or an image path shipped with the package
        if (root.TryGetProperty("icon", out var icon))
        {
            if (icon.ValueKind != JsonValueKind.String || !IsValidIconValue(icon.GetString() ?? ""))
            {
                Add(errors, "icon", "format",
                    "icon must be a non-empty emoji/lucide name or a safe image path (e.g. 'command-icon.png', no '..' or absolute paths)");
            }
        }
        else
        {
            Add(warnings, "icon", "missing", "icon is recommended");
        }

        // entry
        if (root.TryGetProperty("entry", out var entry))
        {
            if (entry.ValueKind != JsonValueKind.String || entry.GetString()!.Length == 0)
            {
                Add(errors, "entry", "format", "entry must be a non-empty string");
            }
            else
            {
                var entryValue = entry.GetString()!;
                if (entryValue.Contains('/') || entryValue.Contains('\\') || entryValue.Contains(".."))
                {
                    Add(errors, "entry", "pathUnsafe", "entry must be a single filename, not a path");
                }
                else if (!System.Text.RegularExpressions.Regex.IsMatch(entryValue, "^[A-Za-z0-9][A-Za-z0-9._-]*\\.js$"))
                {
                    Add(errors, "entry", "format", "entry must be a bundled .js filename (e.g. main.js)");
                }
            }
        }

        // commands
        if (!root.TryGetProperty("commands", out var commands) || commands.ValueKind != JsonValueKind.Array
            || commands.GetArrayLength() == 0)
        {
            Add(errors, "commands", "required", "at least one command is required");
        }
        else
        {
            if (commands.GetArrayLength() > MaxCommands)
            {
                Add(errors, "commands", "tooMany", $"at most {MaxCommands} commands are allowed");
            }
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var index = 0;
            foreach (var command in commands.EnumerateArray())
            {
                var field = $"commands[{index}]";
                if (command.ValueKind != JsonValueKind.Object)
                {
                    Add(errors, field, "format", "command must be an object");
                    index++;
                    continue;
                }
                if (!command.TryGetProperty("id", out var commandId) || commandId.ValueKind != JsonValueKind.String
                    || commandId.GetString()!.Length == 0)
                {
                    Add(errors, $"{field}.id", "required", "command id is required");
                }
                else
                {
                    var commandIdValue = commandId.GetString()!;
                    if (commandIdValue == ReservedActionId)
                    {
                        Add(errors, $"{field}.id", "reserved", $"command id '{commandIdValue}' is reserved by the shell");
                    }
                    else if (!System.Text.RegularExpressions.Regex.IsMatch(commandIdValue, "^[a-z0-9][a-z0-9._-]*$"))
                    {
                        Add(errors, $"{field}.id", "format", $"command id '{commandIdValue}' must match ^[a-z0-9][a-z0-9._-]*$");
                    }
                    else if (!seen.Add(commandIdValue))
                    {
                        Add(errors, $"{field}.id", "duplicate", $"duplicate command id '{commandIdValue}'");
                    }
                }
                if (!command.TryGetProperty("title", out var title) || title.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(title.GetString()))
                {
                    Add(errors, $"{field}.title", "required", "command title is required");
                }
                else if (title.GetString()!.Length > MaxCommandTitleLength)
                {
                    Add(errors, $"{field}.title", "tooLong", $"command title must be at most {MaxCommandTitleLength} characters");
                }
                if (command.TryGetProperty("mode", out var mode) && mode.ValueKind == JsonValueKind.String
                    && mode.GetString() is not ("view" or "background"))
                {
                    Add(errors, $"{field}.mode", "format", "command mode must be 'view' or 'background'");
                }
                if (command.TryGetProperty("keywords", out var keywords)
                    && (keywords.ValueKind != JsonValueKind.Array
                        || keywords.EnumerateArray().Any(k => k.ValueKind != JsonValueKind.String)))
                {
                    Add(errors, $"{field}.keywords", "format", "keywords must be an array of strings");
                }
                index++;
            }
        }

        // nativeMethods
        if (!root.TryGetProperty("nativeMethods", out var nativeMethods) || nativeMethods.ValueKind != JsonValueKind.Array)
        {
            Add(errors, "nativeMethods", "required", "nativeMethods is required (use [] to declare none)");
        }
        else
        {
            if (nativeMethods.GetArrayLength() > MaxNativeMethods)
            {
                Add(errors, "nativeMethods", "tooMany", $"at most {MaxNativeMethods} native methods are allowed");
            }
            var index = 0;
            foreach (var method in nativeMethods.EnumerateArray())
            {
                if (method.ValueKind != JsonValueKind.String || !IsValidNativeMethod(method.GetString() ?? ""))
                {
                    Add(errors, $"nativeMethods[{index}]", "format",
                        $"native method '{method.ToString()}' must look like 'namespace.method' with an optional trailing '.*' wildcard");
                }
                index++;
            }
        }

        // httpHosts
        if (!root.TryGetProperty("httpHosts", out var httpHosts) || httpHosts.ValueKind != JsonValueKind.Array)
        {
            Add(errors, "httpHosts", "required", "httpHosts is required (use [] to declare none)");
        }
        else
        {
            if (httpHosts.GetArrayLength() > MaxHttpHosts)
            {
                Add(errors, "httpHosts", "tooMany", $"at most {MaxHttpHosts} http hosts are allowed");
            }
            var index = 0;
            foreach (var host in httpHosts.EnumerateArray())
            {
                if (host.ValueKind != JsonValueKind.String || !IsValidHttpHost(host.GetString() ?? ""))
                {
                    Add(errors, $"httpHosts[{index}]", "format",
                        $"http host '{host.ToString()}' must be a hostname (e.g. api.example.com), a '.suffix' wildcard, with an optional :port");
                }
                index++;
            }
        }

        // oauth
        if (root.TryGetProperty("oauth", out var oauth))
        {
            if (oauth.ValueKind != JsonValueKind.Array)
            {
                Add(errors, "oauth", "format", "oauth must be an array of provider ids");
            }
            else
            {
                var index = 0;
                foreach (var provider in oauth.EnumerateArray())
                {
                    if (provider.ValueKind != JsonValueKind.String
                        || !System.Text.RegularExpressions.Regex.IsMatch(provider.GetString() ?? "", "^[a-z0-9-]+$"))
                    {
                        Add(errors, $"oauth[{index}]", "format", "oauth provider must be a lowercase id like 'spotify'");
                    }
                    index++;
                }
            }
        }

        // preferences
        if (root.TryGetProperty("preferences", out var preferences))
        {
            if (preferences.ValueKind != JsonValueKind.Array)
            {
                Add(errors, "preferences", "format", "preferences must be an array");
            }
            else
            {
                if (preferences.GetArrayLength() > MaxPreferences)
                {
                    Add(errors, "preferences", "tooMany", $"at most {MaxPreferences} preferences are allowed");
                }
                var seen = new HashSet<string>(StringComparer.Ordinal);
                var index = 0;
                foreach (var preference in preferences.EnumerateArray())
                {
                    var field = $"preferences[{index}]";
                    if (preference.ValueKind != JsonValueKind.Object)
                    {
                        Add(errors, field, "format", "preference must be an object");
                        index++;
                        continue;
                    }
                    if (!preference.TryGetProperty("name", out var prefName)
                        || prefName.ValueKind != JsonValueKind.String
                        || !System.Text.RegularExpressions.Regex.IsMatch(prefName.GetString() ?? "", "^[a-zA-Z_][a-zA-Z0-9_]*$"))
                    {
                        Add(errors, $"{field}.name", "format", "preference name must match ^[a-zA-Z_][a-zA-Z0-9_]*$");
                    }
                    else if (!seen.Add(prefName.GetString()!))
                    {
                        Add(errors, $"{field}.name", "duplicate", $"duplicate preference name '{prefName.GetString()}'");
                    }
                    var type = preference.TryGetProperty("type", out var typeElement)
                        && typeElement.ValueKind == JsonValueKind.String
                            ? typeElement.GetString()
                            : null;
                    if (type is not ("text" or "password" or "checkbox" or "dropdown"))
                    {
                        Add(errors, $"{field}.type", "format", "preference type must be 'text' | 'password' | 'checkbox' | 'dropdown'");
                    }
                    else if (type == "dropdown")
                    {
                        var optionsOk = preference.TryGetProperty("options", out var options)
                            && options.ValueKind == JsonValueKind.Array
                            && options.GetArrayLength() > 0
                            && options.EnumerateArray().All(o =>
                                o.ValueKind == JsonValueKind.Object
                                && o.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.String
                                && o.TryGetProperty("title", out var optionTitle) && optionTitle.ValueKind == JsonValueKind.String);
                        if (!optionsOk)
                        {
                            Add(errors, $"{field}.options", "required", "dropdown preference requires options with value and title");
                        }
                    }
                    if (!preference.TryGetProperty("title", out var prefTitle)
                        || prefTitle.ValueKind != JsonValueKind.String
                        || string.IsNullOrWhiteSpace(prefTitle.GetString()))
                    {
                        Add(errors, $"{field}.title", "required", "preference title is required");
                    }
                    if (preference.TryGetProperty("default", out var prefDefault) && prefDefault.ValueKind != JsonValueKind.Undefined)
                    {
                        if (type == "checkbox" && prefDefault.ValueKind != JsonValueKind.True && prefDefault.ValueKind != JsonValueKind.False)
                        {
                            Add(errors, $"{field}.default", "format", "checkbox preference default must be a boolean");
                        }
                        if (type != "checkbox" && prefDefault.ValueKind != JsonValueKind.String)
                        {
                            Add(errors, $"{field}.default", "format", "preference default must be a string");
                        }
                    }
                    index++;
                }
            }
        }

        return new ManifestValidationResult(errors, warnings);
    }

    public static bool IsValidNativeMethod(string value)
    {
        var segments = value.Split('.');
        if (segments.Length < 2)
        {
            return false;
        }
        for (var i = 0; i < segments.Length - 1; i++)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(segments[i], "^[a-z][a-zA-Z0-9]*$"))
            {
                return false;
            }
        }
        var last = segments[^1];
        return last == "*" || System.Text.RegularExpressions.Regex.IsMatch(last, "^[a-zA-Z0-9]+$");
    }

    /// <summary>
    /// Icon values are either an emoji/lucide name (any non-empty string) or a
    /// relative image path inside the extension package — which must stay inside it.
    /// </summary>
    public static bool IsValidIconValue(string value)
    {
        if (value.Length == 0)
        {
            return false;
        }
        if (!System.Text.RegularExpressions.Regex.IsMatch(value, @"\.(png|jpe?g|gif|webp|ico|bmp)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            return true;
        }
        return !value.Contains('\\') && !value.Contains("..") && !value.StartsWith('/') && !value.Contains(':');
    }

    public static bool IsValidHttpHost(string value)
    {
        var hostPart = value;
        var portIndex = value.LastIndexOf(':');
        if (portIndex > 0)
        {
            hostPart = value[..portIndex];
            var port = value[(portIndex + 1)..];
            if (port.Length is 0 or > 5 || !port.All(char.IsAsciiDigit) || !int.TryParse(port, out var portNumber) || portNumber > 65535)
            {
                return false;
            }
        }
        if (!hostPart.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-'))
        {
            return false;
        }
        var labels = hostPart.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (hostPart.StartsWith('.'))
        {
            return labels.All(l => l.Length > 0 && char.IsAsciiLetterOrDigit(l[0]) && char.IsAsciiLetterOrDigit(l[^1]));
        }
        if (labels.Length == 0 || !char.IsAsciiLetterOrDigit(hostPart[0]) || !char.IsAsciiLetterOrDigit(hostPart[^1]))
        {
            return false;
        }
        return labels.All(l => l.Length > 0 && char.IsAsciiLetterOrDigit(l[0]) && char.IsAsciiLetterOrDigit(l[^1]));
    }

    private static void Add(List<ManifestIssue> list, string field, string code, string message) =>
        list.Add(new ManifestIssue(field, code, message));
}

/// <summary>
/// Wildcard-aware native-method declaration matching. A declared
/// "namespace.*" grants every method under that namespace; exact matches
/// always win.
/// </summary>
public static class NativeMethodPolicy
{
    public static bool IsDeclared(IReadOnlyList<string> declared, string method)
    {
        foreach (var entry in declared)
        {
            if (string.IsNullOrEmpty(entry))
            {
                continue;
            }
            if (entry.EndsWith(".*", StringComparison.Ordinal))
            {
                var prefix = entry[..^1];
                if (method.StartsWith(prefix, StringComparison.Ordinal) && method.Length > prefix.Length)
                {
                    return true;
                }
            }
            else if (string.Equals(entry, method, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }
}

public static class SemVer
{
    /// <summary>Parses the leading major.minor.patch triple, ignoring any pre-release/build suffix.</summary>
    public static bool TryParseTriple(string version, out (int Major, int Minor, int Patch) triple)
    {
        triple = default;
        if (string.IsNullOrEmpty(version))
        {
            return false;
        }
        var core = version;
        var dash = core.IndexOfAny(['-', '+']);
        if (dash >= 0)
        {
            core = core[..dash];
        }
        var parts = core.Split('.');
        if (parts.Length != 3)
        {
            return false;
        }
        if (!TryParseSegment(parts[0], out var major) || !TryParseSegment(parts[1], out var minor)
            || !TryParseSegment(parts[2], out var patch))
        {
            return false;
        }
        triple = (major, minor, patch);
        return true;
    }

    public static bool IsStrictlyNewer(string candidate, string current)
    {
        if (!TryParseTriple(candidate, out var candidateTriple) || !TryParseTriple(current, out var currentTriple))
        {
            return false;
        }
        return candidateTriple.CompareTo(currentTriple) > 0;
    }

    private static bool TryParseSegment(string segment, out int value)
    {
        value = 0;
        return segment.Length > 0 && segment.All(char.IsAsciiDigit) && int.TryParse(segment, out value);
    }
}
