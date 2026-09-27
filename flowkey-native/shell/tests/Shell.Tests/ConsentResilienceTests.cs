using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

/// <summary>
/// Regression tests for the 0.2.1 crash loop: a consent record persisted by
/// an older build without fsPaths/uriSchemes deserialized to null lists, and
/// the first fs.* native call threw ArgumentNullException on the sidecar read
/// loop, killing the pipe and crash-looping the sidecar.
/// </summary>
public class ConsentResilienceTests
{
    [Fact]
    public void StoreTreatsMissingConsentListsAsEmpty()
    {
        var root = Path.Combine(Path.GetTempPath(), "flowkey-consent-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "data"));
        var storePath = Path.Combine(root, "data", "installed-extensions.json");
        File.WriteAllText(storePath, """
            {
              "obsidian-notes": {
                "id": "obsidian-notes",
                "name": "Obsidian Notes",
                "version": "0.1.0",
                "installPath": "C:\\ext\\obsidian-notes",
                "enabled": true,
                "installedAt": "2026-09-26T23:24:32Z",
                "consent": {
                  "nativeMethods": ["fs.*", "hud.show"],
                  "httpHosts": [],
                  "oAuth": []
                }
              }
            }
            """);

        var record = new InstalledExtensionsStore(Path.Combine(root, "data")).Get("obsidian-notes");

        Assert.NotNull(record);
        Assert.NotNull(record!.Consent.NativeMethods);
        Assert.NotNull(record.Consent.HttpHosts);
        Assert.NotNull(record.Consent.OAuth);
        Assert.NotNull(record.Consent.FsPaths);
        Assert.NotNull(record.Consent.UriSchemes);
        Assert.Empty(record.Consent.FsPaths);
        Assert.Empty(record.Consent.UriSchemes);
    }

    [Fact]
    public void DeclarationsForFailClosedInsteadOfThrowingWhenConsentListsMissing()
    {
        var root = Path.Combine(Path.GetTempPath(), "flowkey-consent-tests-" + Guid.NewGuid().ToString("N"));
        var dataDir = Path.Combine(root, "data");
        var installPath = Path.Combine(root, "extensions", "obsidian-notes");
        Directory.CreateDirectory(installPath);
        File.WriteAllText(Path.Combine(installPath, "manifest.json"), """
            {
              "id": "obsidian-notes",
              "name": "Obsidian Notes",
              "version": "0.1.0",
              "nativeMethods": ["fs.*", "hud.show"],
              "fsPaths": ["{{vaultPath}}/**/*.md"]
            }
            """);
        var store = new InstalledExtensionsStore(dataDir);
        // Simulates the legacy persisted record: consent lists absent on disk.
        File.WriteAllText(Path.Combine(dataDir, "installed-extensions.json"), """
            {
              "obsidian-notes": {
                "id": "obsidian-notes",
                "name": "Obsidian Notes",
                "version": "0.1.0",
                "installPath": "ROOT",
                "enabled": true,
                "installedAt": "2026-09-26T23:24:32Z",
                "consent": { "nativeMethods": ["fs.*", "hud.show"], "httpHosts": [], "oAuth": [] }
              }
            }
            """.Replace("ROOT", installPath.Replace("\\", "\\\\")));

        var policy = new ExtensionPolicy(() => [], store);

        var declarations = policy.DeclarationsFor("obsidian-notes");

        Assert.NotNull(declarations);
        // Declared methods the user consented to survive.
        Assert.Contains("fs.*", declarations!.NativeMethods);
        // Missing consent lists grant nothing (fail closed) instead of throwing.
        Assert.Empty(declarations.FsPaths);
    }

    [Fact]
    public void HandleLineSurvivesHandlerExceptions()
    {
        var host = new SidecarHost("sidecar", "extensions", _ => { });
        var crashed = false;
        var readyReceived = false;
        host.NativeCallRequested += (_, _, _, _) => throw new InvalidOperationException("boom");
        host.Ready += _ => readyReceived = true;
        host.SidecarCrashed += _ => crashed = true;

        host.HandleLine("""{"type":"nativeCall","requestId":"n1","extensionId":"e","method":"fs.glob","params":{}}""");
        host.HandleLine("""{"type":"ready","protocolVersion":1,"extensions":[{"id":"emoji","name":"Emoji","version":"1.0.0"}]}""");

        Assert.False(crashed);
        Assert.True(readyReceived);
    }
}
