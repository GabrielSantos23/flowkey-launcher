using System.IO;
using System.IO.Compression;
using System.Text;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public sealed class ExtensionSubsystemFixture : IDisposable
{
    public string Root { get; }
    public InstalledExtensionsStore Store { get; }
    public ExtensionPackageInstaller Installer { get; }

    public ExtensionSubsystemFixture()
    {
        Root = Path.Combine(Path.GetTempPath(), "flowkey-ext-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Root);
        Store = new InstalledExtensionsStore(Path.Combine(Root, "data"));
        Installer = new ExtensionPackageInstaller(Path.Combine(Root, "extensions"), Store);
    }

    public string BuildPackage(string manifestJson, string entryFile = "main.js", string? entryContent = null, string? extraEntryName = null, string? extraEntryContent = null)
    {
        var path = Path.Combine(Root, $"pkg-{Guid.NewGuid():N}.flowkey");
        using var stream = File.Create(path);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Create);
        var manifest = archive.CreateEntry("manifest.json");
        using (var writer = new StreamWriter(manifest.Open(), Encoding.UTF8))
        {
            writer.Write(manifestJson);
        }
        var entry = archive.CreateEntry(entryFile);
        using (var writer = new StreamWriter(entry.Open(), Encoding.UTF8))
        {
            writer.Write(entryContent ?? "export default { handlers: {} };");
        }
        if (extraEntryName is not null)
        {
            var extra = archive.CreateEntry(extraEntryName);
            using var writer = new StreamWriter(extra.Open(), Encoding.UTF8);
            writer.Write(extraEntryContent ?? "evil");
        }
        return path;
    }

    public static string ValidManifest(string id = "demo-ext", string version = "1.0.0")
    {
        return string.Concat(
            "{",
            "\"id\": \"", id, "\",",
            "\"name\": \"Demo Extension\",",
            "\"version\": \"", version, "\",",
            "\"description\": \"A test package.\",",
            "\"icon\": \"🧪\",",
            "\"commands\": [{ \"id\": \"open\", \"title\": \"Demo\" }],",
            "\"nativeMethods\": [\"clipboard.write\", \"storage.*\"],",
            "\"httpHosts\": [\"api.example.com\"]",
            "}");
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(Root, recursive: true);
        }
        catch (IOException)
        {
            /* best effort */
        }
    }
}

public class ExtensionPackageInstallerTests : IDisposable
{
    private readonly ExtensionSubsystemFixture fixture = new();

    [Fact]
    public void ValidPackageInspectsAndInstalls()
    {
        var package = fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest());
        var plan = fixture.Installer.Inspect(package, out var error);
        Assert.Null(error);
        Assert.NotNull(plan);
        Assert.Equal("demo-ext", plan!.Id);
        Assert.Equal("1.0.0", plan.Version);
        Assert.Equal("api.example.com", Assert.Single(plan.HttpHosts));
        Assert.Contains("storage.*", plan.NativeMethods);

        var consent = new ExtensionConsent(plan.NativeMethods, plan.HttpHosts, plan.OAuth);
        var outcome = fixture.Installer.Install(plan, package, consent);
        Assert.True(outcome.Ok, outcome.ErrorMessage);
        Assert.NotNull(outcome.Installed);
        Assert.True(Directory.Exists(outcome.Installed!.InstallPath));
        Assert.True(File.Exists(Path.Combine(outcome.Installed.InstallPath, "main.js")));

        var stored = fixture.Store.Get("demo-ext");
        Assert.NotNull(stored);
        Assert.Equal("Demo Extension", stored!.Name);
        Assert.True(stored.Enabled);
        Assert.Contains("clipboard.write", stored.Consent.NativeMethods);
    }

    [Fact]
    public void SameOrLowerVersionIsRejected()
    {
        var package = fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(version: "1.2.0"));
        var plan = fixture.Installer.Inspect(package, out _);
        Assert.NotNull(plan);
        var outcome = fixture.Installer.Install(plan!, package,
            new ExtensionConsent(plan!.NativeMethods, plan.HttpHosts, plan.OAuth));
        Assert.True(outcome.Ok);

        var same = fixture.Installer.Inspect(fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(version: "1.2.0")), out var sameError);
        Assert.Null(same);
        Assert.StartsWith("versionConflict", sameError);

        var lower = fixture.Installer.Inspect(fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(version: "1.0.0")), out var lowerError);
        Assert.Null(lower);
        Assert.StartsWith("versionConflict", lowerError);

        var newer = fixture.Installer.Inspect(fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(version: "1.3.0")), out _);
        Assert.NotNull(newer);
    }

    [Fact]
    public void InvalidManifestIsRejected()
    {
        var package = fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(id: "Bad Id"));
        var plan = fixture.Installer.Inspect(package, out var error);
        Assert.Null(plan);
        Assert.StartsWith("manifestInvalid", error);
    }

    [Fact]
    public void MissingEntryFileIsRejected()
    {
        var package = fixture.BuildPackage(ExtensionSubsystemFixture.ValidManifest(), entryFile: "other.js");
        var plan = fixture.Installer.Inspect(package, out var error);
        Assert.Null(plan);
        Assert.StartsWith("entryMissing", error);
    }

    [Fact]
    public void ZipSlipEntryIsRejected()
    {
        var package = fixture.BuildPackage(
            ExtensionSubsystemFixture.ValidManifest(),
            extraEntryName: "../evil.txt");
        var plan = fixture.Installer.Inspect(package, out var error);
        Assert.Null(plan);
        Assert.StartsWith("unsafeEntry", error);
    }

    [Fact]
    public void NotAZipIsRejected()
    {
        var path = Path.Combine(fixture.Root, "not-a-zip.flowkey");
        File.WriteAllText(path, "this is not a zip archive");
        var plan = fixture.Installer.Inspect(path, out var error);
        Assert.Null(plan);
        Assert.Equal("notAZipArchive", error);
    }

    public void Dispose() => fixture.Dispose();
}

public class ExtensionPolicyTests : IDisposable
{
    private readonly ExtensionSubsystemFixture fixture = new();

    [Fact]
    public void InstalledExtensionsGetManifestIntersectedWithConsent()
    {
        var extensionsRoot = Path.Combine(fixture.Root, "extensions");
        var installPath = Path.Combine(extensionsRoot, "demo-ext");
        Directory.CreateDirectory(installPath);
        File.WriteAllText(Path.Combine(installPath, "manifest.json"), ExtensionSubsystemFixture.ValidManifest());

        fixture.Store.Upsert(new InstalledExtension(
            "demo-ext", "Demo Extension", "1.0.0", installPath, Enabled: true, DateTimeOffset.UtcNow,
            new ExtensionConsent(["clipboard.write"], ["api.example.com"], [])));

        var policy = new ExtensionPolicy(() => Array.Empty<Protocol.ReadyExtension>(), fixture.Store);
        var declarations = policy.DeclarationsFor("demo-ext");
        Assert.NotNull(declarations);
        // "storage.*" is declared in the manifest but was not consented to.
        Assert.Equal(["clipboard.write"], declarations!.NativeMethods);
        Assert.Equal(["api.example.com"], declarations.HttpHosts);
    }

    [Fact]
    public void ConsentWildcardCoversDeclaredMethods()
    {
        var extensionsRoot = Path.Combine(fixture.Root, "extensions");
        var installPath = Path.Combine(extensionsRoot, "demo-ext");
        Directory.CreateDirectory(installPath);
        File.WriteAllText(Path.Combine(installPath, "manifest.json"), ExtensionSubsystemFixture.ValidManifest());

        fixture.Store.Upsert(new InstalledExtension(
            "demo-ext", "Demo Extension", "1.0.0", installPath, Enabled: true, DateTimeOffset.UtcNow,
            new ExtensionConsent(["storage.*", "clipboard.*"], ["api.example.com"], [])));

        var policy = new ExtensionPolicy(() => Array.Empty<Protocol.ReadyExtension>(), fixture.Store);
        var declarations = policy.DeclarationsFor("demo-ext");
        Assert.NotNull(declarations);
        // Manifest-level wildcards covered by consent pass through; expansion
        // to concrete methods happens at call time via NativeMethodPolicy.
        Assert.Contains("storage.*", declarations!.NativeMethods);
        Assert.Contains("clipboard.write", declarations.NativeMethods);
        Assert.DoesNotContain("http.fetch", declarations.NativeMethods);
    }

    [Fact]
    public void FirstPartyExtensionsFallBackToReadyDeclarations()
    {
        var ready = new Protocol.ReadyExtension
        {
            Id = "emoji",
            Name = "Emoji",
            NativeMethods = ["clipboard.write"],
            HttpHosts = [],
            OAuth = [],
        };
        var policy = new ExtensionPolicy(() => [ready], fixture.Store);
        var declarations = policy.DeclarationsFor("emoji");
        Assert.NotNull(declarations);
        Assert.Equal(["clipboard.write"], declarations!.NativeMethods);
        Assert.Null(policy.DeclarationsFor("unknown"));
    }

    public void Dispose() => fixture.Dispose();
}

public class ExtensionStorageStoreTests : IDisposable
{
    private readonly ExtensionSubsystemFixture fixture = new();
    private readonly ExtensionStorageStore store;

    public ExtensionStorageStoreTests()
    {
        store = new ExtensionStorageStore(Path.Combine(fixture.Root, "data"));
    }

    private static Dictionary<string, System.Text.Json.JsonElement>? Params(string key, object? value = null)
    {
        var json = value is null
            ? $"{{ \"key\": \"{key}\" }}"
            : $"{{ \"key\": \"{key}\", \"value\": {System.Text.Json.JsonSerializer.Serialize(value)} }}";
        return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, System.Text.Json.JsonElement>>(json);
    }

    [Fact]
    public void SetGetDeleteRoundTrip()
    {
        Assert.True(store.Handle("demo-ext", "storage.set", Params("token", new { a = 1 })).Ok);
        var get = store.Handle("demo-ext", "storage.get", Params("token"));
        Assert.True(get.Ok);
        Assert.Equal(1, get.Result?.GetProperty("value").GetProperty("a").GetInt32());

        Assert.True(store.Handle("demo-ext", "storage.delete", Params("token")).Ok);
        var missing = store.Handle("demo-ext", "storage.get", Params("token"));
        Assert.True(missing.Ok);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, missing.Result?.GetProperty("value").ValueKind);

        var keys = store.Handle("demo-ext", "storage.keys", null);
        Assert.True(keys.Ok);
        Assert.Equal(0, keys.Result!.Value.GetProperty("keys").GetArrayLength());
    }

    [Fact]
    public void StorageIsScopedPerExtension()
    {
        store.Handle("ext-a", "storage.set", Params("k", "value-a"));
        store.Handle("ext-b", "storage.set", Params("k", "value-b"));
        var a = store.Handle("ext-a", "storage.get", Params("k"));
        Assert.Equal("value-a", a.Result?.GetProperty("value").GetString());
        store.Handle("ext-a", "storage.delete", Params("k"));
        Assert.True(File.Exists(Path.Combine(fixture.Root, "data", "extension-storage", "ext-b.json")));
    }

    [Fact]
    public void RemoveExtensionDeletesTheFile()
    {
        store.Handle("ext-c", "storage.set", Params("k", "v"));
        Assert.True(File.Exists(Path.Combine(fixture.Root, "data", "extension-storage", "ext-c.json")));
        store.RemoveExtension("ext-c");
        Assert.False(File.Exists(Path.Combine(fixture.Root, "data", "extension-storage", "ext-c.json")));
    }

    public void Dispose() => fixture.Dispose();
}
