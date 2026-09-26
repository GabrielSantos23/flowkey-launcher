using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

/// <summary>
/// Scoped filesystem access for extensions: read/write/delete text files,
/// glob for files, and stat metadata. Every path argument is validated by
/// <see cref="FsPolicy"/> against the extension's interpolated manifest
/// scopes before any IO happens; sizes are capped per call.
/// </summary>
public sealed class ExtensionFsService
{
    public const int MaxReadBytes = 2 * 1024 * 1024;
    public const int MaxWriteBytes = 2 * 1024 * 1024;
    public const int MaxGlobEntries = 500;

    private static readonly string[] GlobRootSeparators = { "*", "?" };

    public NativeCallOutcome Handle(
        string extensionId, string method, Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> interpolatedScopes)
    {
        if (interpolatedScopes.Count == 0)
        {
            return NativeCallOutcome.Failure(
                "fsScopeUnavailable",
                "extension declares no usable fs scope (check manifest fsPaths and the referenced preferences)");
        }
        return method switch
        {
            "fs.readText" => ReadText(parameters, interpolatedScopes),
            "fs.writeText" => WriteText(parameters, interpolatedScopes),
            "fs.delete" => Delete(parameters, interpolatedScopes),
            "fs.glob" => Glob(parameters, interpolatedScopes),
            "fs.stat" => Stat(parameters, interpolatedScopes),
            _ => NativeCallOutcome.Failure("notImplemented", $"native method '{method}' is not implemented by this shell"),
        };
    }

    private static NativeCallOutcome ReadText(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        try
        {
            if (!File.Exists(path))
            {
                return NativeCallOutcome.Failure("fileNotFound", $"file '{path}' does not exist");
            }
            var length = new FileInfo(path).Length;
            if (length > MaxReadBytes)
            {
                return NativeCallOutcome.Failure("fileTooLarge", $"files are limited to {MaxReadBytes} bytes per read");
            }
            var content = File.ReadAllText(path);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, content }));
        }
        catch (IOException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
    }

    private static NativeCallOutcome WriteText(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        if (parameters is null || !parameters.TryGetValue("content", out var contentElement) || contentElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "fs.writeText requires a string 'content' parameter");
        }
        var append = parameters.TryGetValue("append", out var appendElement) && appendElement.ValueKind == JsonValueKind.True;
        var content = contentElement.GetString() ?? "";
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            var length = System.Text.Encoding.UTF8.GetByteCount(content)
                + (append && File.Exists(path) ? new FileInfo(path).Length : 0);
            if (length > MaxWriteBytes)
            {
                return NativeCallOutcome.Failure("fileTooLarge", $"writes are limited to {MaxWriteBytes} bytes per file");
            }
            if (append && File.Exists(path))
            {
                File.AppendAllText(path, content, System.Text.Encoding.UTF8);
            }
            else
            {
                File.WriteAllText(path, content, System.Text.Encoding.UTF8);
            }
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (IOException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
    }

    private static NativeCallOutcome Delete(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        try
        {
            if (!File.Exists(path))
            {
                return NativeCallOutcome.Failure("fileNotFound", $"file '{path}' does not exist");
            }
            File.Delete(path);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        catch (IOException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
    }

    private static NativeCallOutcome Glob(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (parameters is null || !parameters.TryGetValue("pattern", out var patternElement) || patternElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "fs.glob requires a string 'pattern' parameter");
        }
        var pattern = patternElement.GetString() ?? "";
        if (pattern.Length == 0 || pattern.Contains(".."))
        {
            return NativeCallOutcome.Failure("invalidParams", "fs.glob pattern must be a relative glob without '..'");
        }
        var limit = parameters.TryGetValue("limit", out var limitElement) && limitElement.ValueKind == JsonValueKind.Number
            ? Math.Clamp(limitElement.GetInt32(), 1, MaxGlobEntries)
            : MaxGlobEntries;
        try
        {
            var globRegex = FsPolicy.GlobToRegex(pattern.Replace('/', '/'));
            if (globRegex is null)
            {
                return NativeCallOutcome.Failure("invalidParams", "fs.glob pattern is not a valid glob");
            }
            var entries = new List<object>();
            foreach (var root in ScopeRoots(scopes))
            {
                foreach (var file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
                {
                    var rootPrefix = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
                    var relative = file[rootPrefix.Length..].Replace(Path.DirectorySeparatorChar, '/');
                    if (!System.Text.RegularExpressions.Regex.IsMatch(relative, globRegex, System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    {
                        continue;
                    }
                    entries.Add(EntryJson(file));
                    if (entries.Count >= limit)
                    {
                        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, entries }));
                    }
                }
            }
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, entries }));
        }
        catch (IOException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
    }

    private static NativeCallOutcome Stat(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        try
        {
            if (!File.Exists(path))
            {
                return NativeCallOutcome.Failure("fileNotFound", $"file '{path}' does not exist");
            }
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(EntryJson(path)));
        }
        catch (IOException ex)
        {
            return NativeCallOutcome.Failure("fsFailed", ex.Message);
        }
    }

    /// <summary>
    /// The static directory prefix of every scope (everything before the
    /// first wildcard character), used as the enumeration root for relative
    /// glob patterns.
    /// </summary>
    private static IEnumerable<string> ScopeRoots(IReadOnlyList<string> scopes)
    {
        foreach (var scope in scopes)
        {
            var cut = scope.IndexOfAny(GlobRootSeparators.SelectMany(s => s).ToArray());
            var root = (cut >= 0 ? scope[..cut] : scope).TrimEnd('\\', '/');
            if (root.Length > 0 && Directory.Exists(root))
            {
                yield return root;
            }
        }
    }

    private static object EntryJson(string path)
    {
        var info = new FileInfo(path);
        return new
        {
            path = info.FullName,
            name = info.Name,
            sizeBytes = info.Length,
            createdAtMs = new DateTimeOffset(info.CreationTimeUtc).ToUnixTimeMilliseconds(),
            modifiedAtMs = new DateTimeOffset(info.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
        };
    }

    private static bool TryPath(
        Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes,
        out string path, out NativeCallOutcome? failure)
    {
        failure = null;
        path = "";
        if (parameters is null || !parameters.TryGetValue("path", out var pathElement) || pathElement.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "fs methods require a string 'path' parameter");
            return false;
        }
        path = pathElement.GetString() ?? "";
        if (!FsPolicy.IsAllowed(path, scopes))
        {
            failure = NativeCallOutcome.Failure(
                "pathNotInScope",
                $"path '{path}' is outside the filesystem scopes declared by this extension");
            return false;
        }
        return true;
    }
}
