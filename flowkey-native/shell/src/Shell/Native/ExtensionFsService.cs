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
            "fs.mkdir" => Mkdir(parameters, interpolatedScopes),
            "fs.exists" => Exists(parameters, interpolatedScopes),
            "fs.copy" => Copy(parameters, interpolatedScopes),
            "fs.move" => Move(parameters, interpolatedScopes),
            "fs.trash" => Trash(parameters, interpolatedScopes),
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

    private static NativeCallOutcome Mkdir(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        try
        {
            Directory.CreateDirectory(path);
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

    private static NativeCallOutcome Exists(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
        {
            ok = true,
            exists = File.Exists(path) || Directory.Exists(path),
        }));
    }

    private static NativeCallOutcome Copy(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryTwoPaths(parameters, "from", "to", scopes, out var from, out var to, out var failure))
        {
            return failure!;
        }
        try
        {
            if (!File.Exists(from))
            {
                return NativeCallOutcome.Failure("fileNotFound", $"file '{from}' does not exist");
            }
            File.Copy(from, to, overwrite: false);
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

    private static NativeCallOutcome Move(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryTwoPaths(parameters, "from", "to", scopes, out var from, out var to, out var failure))
        {
            return failure!;
        }
        try
        {
            if (!File.Exists(from))
            {
                return NativeCallOutcome.Failure("fileNotFound", $"file '{from}' does not exist");
            }
            File.Move(from, to, overwrite: false);
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

    private static NativeCallOutcome Trash(Dictionary<string, JsonElement>? parameters, IReadOnlyList<string> scopes)
    {
        if (!TryPath(parameters, scopes, out var path, out var failure))
        {
            return failure!;
        }
        if (!RecycleBin.TryTrash(path, out var trashError))
        {
            return NativeCallOutcome.Failure("fsFailed", trashError ?? "recycle bin operation failed");
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private static bool TryTwoPaths(
        Dictionary<string, JsonElement>? parameters, string fromName, string toName, IReadOnlyList<string> scopes,
        out string from, out string to, out NativeCallOutcome? failure)
    {
        failure = null;
        from = "";
        to = "";
        if (!TryPath(parameters, scopes, out var first, out var fromFailure, fromName) || fromFailure is not null)
        {
            failure = fromFailure ?? NativeCallOutcome.Failure("invalidParams", $"fs methods require a string '{fromName}' parameter");
            return false;
        }
        if (parameters is null
            || !parameters.TryGetValue(toName, out var toElement)
            || toElement.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", $"fs methods require a string '{toName}' parameter");
            return false;
        }
        var second = toElement.GetString() ?? "";
        if (!FsPolicy.IsAllowed(second, scopes))
        {
            failure = NativeCallOutcome.Failure(
                "pathNotInScope",
                $"path '{second}' is outside the filesystem scopes declared by this extension");
            return false;
        }
        from = first;
        to = second;
        return true;
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
        out string path, out NativeCallOutcome? failure, string parameterName = "path")
    {
        failure = null;
        path = "";
        if (parameters is null || !parameters.TryGetValue(parameterName, out var pathElement) || pathElement.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", $"fs methods require a string '{parameterName}' parameter");
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
