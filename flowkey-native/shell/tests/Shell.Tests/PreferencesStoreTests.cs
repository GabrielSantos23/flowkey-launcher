using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public class PreferencesStoreTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-pref-tests-" + Guid.NewGuid().ToString("N"));

    private static PreferenceSchema Schema(string name, string type, bool required = false) =>
        new() { Name = name, Type = type, Title = name, Required = required };

    public void Dispose()
    {
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void ValuesPersistAndSlicePerExtension()
    {
        var store = new PreferencesStore(tempDir);
        var emojiSchema = new[] { Schema("tone", "text") };
        store.SetSlice("emoji", emojiSchema, new Dictionary<string, JsonElement> { ["tone"] = JsonSerializer.SerializeToElement("dark") });
        store.SetSlice("other", emojiSchema, new Dictionary<string, JsonElement> { ["tone"] = JsonSerializer.SerializeToElement("light") });

        var reloaded = new PreferencesStore(tempDir);
        var emojiSlice = reloaded.Slice("emoji", emojiSchema);
        var otherSlice = reloaded.Slice("other", emojiSchema);
        Assert.Equal("dark", emojiSlice["tone"].GetString());
        Assert.Equal("light", otherSlice["tone"].GetString());
        Assert.Single(emojiSlice);
    }

    [Fact]
    public void PasswordsAreEncryptedOnDiskAndDecryptedOnRead()
    {
        var store = new PreferencesStore(tempDir);
        store.SetSlice("ext", new[] { Schema("secret", "password") }, new Dictionary<string, JsonElement> { ["secret"] = JsonSerializer.SerializeToElement("hunter2") });

        var raw = File.ReadAllText(Path.Combine(tempDir, "preferences.json"));
        Assert.DoesNotContain("hunter2", raw);
        Assert.Contains("dpapi:", raw);

        var slice = store.Slice("ext", new[] { Schema("secret", "password") });
        Assert.Equal("hunter2", slice["secret"].GetString());
    }

    [Fact]
    public void DefaultsFillMissingValues()
    {
        var store = new PreferencesStore(tempDir);
        var schema = new[]
        {
            new PreferenceSchema { Name = "limit", Type = "text", Title = "Limit", Default = JsonSerializer.SerializeToElement("10") },
            new PreferenceSchema { Name = "set", Type = "text", Title = "Set", Default = JsonSerializer.SerializeToElement("x") },
        };
        store.SetSlice("ext", schema, new Dictionary<string, JsonElement> { ["set"] = JsonSerializer.SerializeToElement("override") });

        var slice = store.Slice("ext", schema);
        Assert.Equal("10", slice["limit"].GetString());
        Assert.Equal("override", slice["set"].GetString());
    }

    [Fact]
    public void MissingRequiredReported()
    {
        var store = new PreferencesStore(tempDir);
        var schema = new[]
        {
            new PreferenceSchema { Name = "token", Type = "password", Title = "API token", Required = true },
            new PreferenceSchema { Name = "flag", Type = "checkbox", Title = "Flag", Required = true, Default = JsonSerializer.SerializeToElement(false) },
        };
        var missing = store.MissingRequired("ext", schema);
        var entry = Assert.Single(missing);
        Assert.Equal("API token", entry);
    }
}
