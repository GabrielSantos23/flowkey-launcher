using System.IO;
using System.IO.Compression;
using System.Text.Json;

namespace FlowKey.Shell.Native;

/// <summary>
/// Validates and extracts .flowkey extension packages (zips containing a
/// manifest.json at the root plus a bundled .js entry). Extraction is guarded
/// against zip-slip, oversized and overly numerous entries. All install
/// decisions are pure functions of the package and the installed store, so
/// they are xunit-testable without a UI.
/// </summary>
public sealed class ExtensionPackageInstaller
{
    public const int MaxEntries = 512;
    public const long MaxEntryBytes = 32 * 1024 * 1024;
    public const long MaxTotalBytes = 64 * 1024 * 1024;

    private readonly string extensionsRoot;
    private readonly InstalledExtensionsStore store;

    public ExtensionPackageInstaller(string extensionsRoot, InstalledExtensionsStore store)
    {
        this.extensionsRoot = extensionsRoot;
        this.store = store;
    }

    public sealed record InstallPlan(
        string Id,
        string Name,
        string Version,
        string? Description,
        string? Icon,
        string EntryFile,
        IReadOnlyList<string> NativeMethods,
        IReadOnlyList<string> HttpHosts,
        IReadOnlyList<string> OAuth,
        IReadOnlyList<string> ManifestWarnings);

    public sealed record InstallOutcome(bool Ok, string? ErrorCode, string? ErrorMessage, InstalledExtension? Installed)
    {
        public static InstallOutcome Fail(string code, string message) => new(false, code, message, null);
    }

    /// <summary>
    /// Opens and fully validates a package without extracting it. Returns null
    /// and sets <paramref name="error"/> when the package is invalid, its
    /// manifest fails validation, or its version is not an upgrade.
    /// </summary>
    public InstallPlan? Inspect(string packagePath, out string? error)
    {
        error = null;
        if (!File.Exists(packagePath))
        {
            error = "packageNotFound";
            return null;
        }
        try
        {
            using var archive = ZipFile.OpenRead(packagePath);
            if (!ValidateEntries(archive, out error))
            {
                return null;
            }
            var manifestEntry = FindEntry(archive, "manifest.json");
            if (manifestEntry is null)
            {
                error = "manifestMissing";
                return null;
            }
            JsonDocument manifestDocument;
            try
            {
                using var reader = new StreamReader(manifestEntry.Open());
                manifestDocument = JsonDocument.Parse(reader.ReadToEnd());
            }
            catch (JsonException ex)
            {
                error = "manifestInvalidJson: " + ex.Message;
                return null;
            }
            using (manifestDocument)
            {
                var validation = ExtensionManifestValidator.Validate(manifestDocument.RootElement);
                if (!validation.IsValid)
                {
                    var first = validation.Errors[0];
                    error = $"manifestInvalid: {first.Field}: {first.Message}";
                    return null;
                }
                var root = manifestDocument.RootElement;
                var id = root.GetProperty("id").GetString()!;
                var version = root.GetProperty("version").GetString()!;
                var entryFile = root.TryGetProperty("entry", out var entryElement)
                    ? entryElement.GetString() ?? ExtensionManifestValidator.DefaultEntry
                    : ExtensionManifestValidator.DefaultEntry;
                if (FindEntry(archive, entryFile) is null)
                {
                    error = $"entryMissing: {entryFile}";
                    return null;
                }
                var existing = store.Get(id);
                if (existing is not null && !SemVer.IsStrictlyNewer(version, existing.Version))
                {
                    error = $"versionConflict: installed version {existing.Version}, package version {version}";
                    return null;
                }
                return new InstallPlan(
                    id,
                    root.GetProperty("name").GetString() ?? id,
                    version,
                    root.TryGetProperty("description", out var description) && description.ValueKind == JsonValueKind.String
                        ? description.GetString()
                        : null,
                    root.TryGetProperty("icon", out var icon) && icon.ValueKind == JsonValueKind.String
                        ? icon.GetString()
                        : null,
                    entryFile,
                    ReadStringArray(root, "nativeMethods"),
                    ReadStringArray(root, "httpHosts"),
                    root.TryGetProperty("oauth", out var oauth) && oauth.ValueKind == JsonValueKind.Array
                        ? ReadStringArray(root, "oauth")
                        : Array.Empty<string>(),
                    validation.Warnings.Select(w => $"{w.Field}: {w.Message}").ToList());
            }
        }
        catch (InvalidDataException)
        {
            error = "notAZipArchive";
            return null;
        }
        catch (IOException ex)
        {
            error = "packageUnreadable: " + ex.Message;
            return null;
        }
    }

    /// <summary>
    /// Extracts a previously inspected plan into the extensions root and
    /// records it in the store with the given consent. The package is
    /// re-opened from <paramref name="packagePath"/>; the caller must not
    /// delete or modify it between Inspect and Install.
    /// </summary>
    public InstallOutcome Install(InstallPlan plan, string packagePath, ExtensionConsent consent)
    {
        if (plan.NativeMethods.Any(m => !NativeMethodPolicy.IsDeclared(consent.NativeMethods, m)))
        {
            return InstallOutcome.Fail("consentMismatch", "consent does not cover every declared native method");
        }
        var target = Path.Combine(extensionsRoot, plan.Id);
        var staging = Path.Combine(extensionsRoot, $".staging-{plan.Id}-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(extensionsRoot);
            Directory.CreateDirectory(staging);
            using (var archive = ZipFile.OpenRead(packagePath))
            {
                foreach (var entry in archive.Entries)
                {
                    var relative = NormalizeEntryName(entry.FullName);
                    if (relative.Length == 0)
                    {
                        continue;
                    }
                    var destination = Path.GetFullPath(Path.Combine(staging, relative));
                    if (!destination.StartsWith(Path.GetFullPath(staging) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                    {
                        return InstallOutcome.Fail("zipSlip", $"entry '{entry.FullName}' escapes the extraction directory");
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                    if (relative.EndsWith('/'))
                    {
                        continue;
                    }
                    entry.ExtractToFile(destination, overwrite: true);
                }
            }
            if (!File.Exists(Path.Combine(staging, plan.EntryFile)))
            {
                return InstallOutcome.Fail("entryMissing", $"entry file '{plan.EntryFile}' missing after extraction");
            }
            if (Directory.Exists(target))
            {
                Directory.Delete(target, recursive: true);
            }
            Directory.Move(staging, target);
        }
        catch (IOException ex)
        {
            TryDelete(staging);
            return InstallOutcome.Fail("extractFailed", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            TryDelete(staging);
            return InstallOutcome.Fail("extractFailed", ex.Message);
        }
        var record = new InstalledExtension(
            plan.Id, plan.Name, plan.Version, target, Enabled: true, DateTimeOffset.UtcNow, consent);
        store.Upsert(record);
        return new InstallOutcome(true, null, null, record);
    }

    /// <summary>Validates every entry: no traversal, no absolute paths, sane sizes.</summary>
    private static bool ValidateEntries(ZipArchive archive, out string? error)
    {
        error = null;
        if (archive.Entries.Count > MaxEntries)
        {
            error = $"tooManyEntries: {archive.Entries.Count}";
            return false;
        }
        long total = 0;
        foreach (var entry in archive.Entries)
        {
            var normalized = NormalizeEntryName(entry.FullName);
            if (normalized.Length == 0)
            {
                continue;
            }
            if (Path.IsPathRooted(entry.FullName)
                || entry.FullName.Contains(':')
                || normalized.Split('/').Any(segment => segment == ".."))
            {
                error = $"unsafeEntry: {entry.FullName}";
                return false;
            }
            if (entry.Length > MaxEntryBytes)
            {
                error = $"entryTooLarge: {entry.FullName}";
                return false;
            }
            total += entry.Length;
            if (total > MaxTotalBytes)
            {
                error = "archiveTooLarge";
                return false;
            }
        }
        return true;
    }

    private static ZipArchiveEntry? FindEntry(ZipArchive archive, string name)
    {
        return archive.Entries.FirstOrDefault(e =>
            string.Equals(NormalizeEntryName(e.FullName), name, StringComparison.Ordinal));
    }

    private static string NormalizeEntryName(string fullName)
    {
        return fullName.Replace('\\', '/').TrimStart('/');
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }
        return array.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString() ?? "")
            .ToList();
    }

    private static void TryDelete(string directory)
    {
        try
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
        catch
        {
            /* best effort */
        }
    }
}
