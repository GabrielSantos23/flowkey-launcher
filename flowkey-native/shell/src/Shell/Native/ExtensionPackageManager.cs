using System.IO;

namespace FlowKey.Shell.Native;

/// <summary>
/// Facade for the whole third-party extension lifecycle: install from a
/// .flowkey package (with consent), uninstall with full data purge, and
/// enable/disable. Keeps install/uninstall logic out of window code-behind.
/// </summary>
public sealed class ExtensionPackageManager
{
    private readonly InstalledExtensionsStore store;
    private readonly ExtensionPackageInstaller installer;
    private readonly SecretsStore secretsStore;
    private readonly TokenVault tokenVault;
    private readonly ExtensionStorageStore storageStore;
    private readonly string iconCacheImagesDirectory;

    public ExtensionPackageManager(
        string extensionsRoot,
        InstalledExtensionsStore store,
        SecretsStore secretsStore,
        TokenVault tokenVault,
        ExtensionStorageStore storageStore,
        string iconCacheImagesDirectory)
    {
        this.store = store;
        installer = new ExtensionPackageInstaller(extensionsRoot, store);
        this.secretsStore = secretsStore;
        this.tokenVault = tokenVault;
        this.storageStore = storageStore;
        this.iconCacheImagesDirectory = iconCacheImagesDirectory;
    }

    public ExtensionPackageInstaller.InstallPlan? Inspect(string packagePath, out string? error) =>
        installer.Inspect(packagePath, out error);

    public ExtensionPackageInstaller.InstallOutcome Install(
        ExtensionPackageInstaller.InstallPlan plan, string packagePath, ExtensionConsent consent) =>
        installer.Install(plan, packagePath, consent);

    /// <summary>Grants a fresh consent record (used when reviewing an upgraded extension).</summary>
    public void UpdateConsent(string extensionId, ExtensionConsent consent) => store.UpdateConsent(extensionId, consent);

    public void SetEnabled(string extensionId, bool enabled) => store.SetEnabled(extensionId, enabled);

    public IReadOnlyList<InstalledExtension> Installed => store.GetAll();

    public InstalledExtension? GetInstalled(string extensionId) => store.Get(extensionId);

    /// <summary>
    /// Removes the extension directory plus every piece of per-extension data:
    /// consent record, secrets, OAuth tokens, storage and cached images.
    /// </summary>
    public bool Uninstall(string extensionId)
    {
        var record = store.Get(extensionId);
        if (record is null)
        {
            return false;
        }
        try
        {
            if (Directory.Exists(record.InstallPath))
            {
                Directory.Delete(record.InstallPath, recursive: true);
            }
        }
        catch (IOException)
        {
            /* the directory may be locked; the record is removed regardless */
        }
        catch (UnauthorizedAccessException)
        {
            /* same */
        }
        secretsStore.RemoveExtension(extensionId);
        tokenVault.RemoveAll(extensionId);
        storageStore.RemoveExtension(extensionId);
        try
        {
            var imageCache = Path.Combine(iconCacheImagesDirectory, extensionId);
            if (Directory.Exists(imageCache))
            {
                Directory.Delete(imageCache, recursive: true);
            }
        }
        catch (IOException)
        {
            /* best effort */
        }
        catch (UnauthorizedAccessException)
        {
            /* best effort */
        }
        store.Remove(extensionId);
        return true;
    }
}

/// <summary>
/// Computes the effective capability declarations the shell enforces for a
/// given extension. First-party extensions use the sidecar's ready
/// declarations; installed extensions get the on-disk manifest intersected
/// with the user's stored consent, so a manifest can never grant more than
/// the user approved and an upgraded manifest silently loses new
/// capabilities until re-consent.
/// </summary>
public sealed class ExtensionPolicy
{
    private readonly Func<IReadOnlyList<Protocol.ReadyExtension>> readyExtensions;
    private readonly InstalledExtensionsStore store;
    private readonly Dictionary<string, (DateTimeOffset Stamp, Protocol.ReadyExtension Declarations)> manifestCache = new(StringComparer.Ordinal);

    public ExtensionPolicy(
        Func<IReadOnlyList<Protocol.ReadyExtension>> readyExtensions,
        InstalledExtensionsStore store)
    {
        this.readyExtensions = readyExtensions;
        this.store = store;
    }

    public Protocol.ReadyExtension? DeclarationsFor(string extensionId)
    {
        var record = store.Get(extensionId);
        if (record is null)
        {
            return readyExtensions().FirstOrDefault(e => e.Id == extensionId);
        }
        var manifest = ReadInstalledManifest(record);
        if (manifest is null)
        {
            return null;
        }
        return new Protocol.ReadyExtension
        {
            Id = record.Id,
            Name = manifest.Name,
            Version = record.Version,
            Commands = manifest.Commands,
            // Manifest ∩ consent: consent wildcards ("storage.*") cover any
            // matching method the manifest declares.
            NativeMethods = manifest.NativeMethods
                .Where(m => NativeMethodPolicy.IsDeclared(record.Consent.NativeMethods, m))
                .ToList(),
            HttpHosts = manifest.HttpHosts
                .Where(h => record.Consent.HttpHosts.Contains(h, StringComparer.Ordinal))
                .ToList(),
            OAuth = manifest.OAuth
                .Where(p => record.Consent.OAuth.Contains(p, StringComparer.Ordinal))
                .ToList(),
        };
    }

    private Protocol.ReadyExtension? ReadInstalledManifest(InstalledExtension record)
    {
        var manifestPath = Path.Combine(record.InstallPath, "manifest.json");
        DateTimeOffset stamp;
        try
        {
            stamp = File.GetLastWriteTimeUtc(manifestPath);
        }
        catch (IOException)
        {
            return null;
        }
        if (manifestCache.TryGetValue(record.Id, out var cached) && cached.Stamp == stamp)
        {
            return cached.Declarations;
        }
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(manifestPath));
            var root = document.RootElement;
            var declarations = new Protocol.ReadyExtension
            {
                Id = record.Id,
                Name = root.TryGetProperty("name", out var name) && name.ValueKind == System.Text.Json.JsonValueKind.String
                    ? name.GetString() ?? record.Id
                    : record.Id,
                Version = record.Version,
                Commands = [],
                NativeMethods = ReadStringArray(root, "nativeMethods"),
                HttpHosts = ReadStringArray(root, "httpHosts"),
                OAuth = root.TryGetProperty("oauth", out _) ? ReadStringArray(root, "oauth") : [],
            };
            manifestCache[record.Id] = (stamp, declarations);
            return declarations;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }

    private static List<string> ReadStringArray(System.Text.Json.JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var array) || array.ValueKind != System.Text.Json.JsonValueKind.Array)
        {
            return [];
        }
        return array.EnumerateArray()
            .Where(e => e.ValueKind == System.Text.Json.JsonValueKind.String)
            .Select(e => e.GetString() ?? "")
            .ToList();
    }
}
