using System.IO;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class FsPolicyTests
{
    [Theory]
    [InlineData("{{vaultPath}}/**/*.md", "C:/Users/me/vault", true)]
    [InlineData("{{vaultPath}}/**/*.md", "", false)]
    [InlineData("C:/notes/**/*.md", null, true)]
    public void InterpolationFailsClosed(string scope, string? vault, bool expected)
    {
        var preferences = new Dictionary<string, string> { ["vaultPath"] = vault ?? "" };
        var interpolated = FsPolicy.InterpolateAll([scope], preferences);
        Assert.Equal(expected, interpolated.Count > 0);
    }

    [Fact]
    public void PlaceholderRootScopeMatches()
    {
        var scopes = FsPolicy.InterpolateAll(
            ["{{vaultPath}}/**/*.md"],
            new Dictionary<string, string> { ["vaultPath"] = @"C:\Users\me\vault" });
        var list = Assert.IsType<List<string>>(scopes);
        Assert.Equal(["C:\\Users\\me\\vault/**/*.md"], list);
        Assert.True(FsPolicy.IsAllowed(@"C:\Users\me\vault\uni\Perceptron.md", list));
        Assert.False(FsPolicy.IsAllowed(@"C:\Users\me\vault\uni\Perceptron.txt", list));
        Assert.False(FsPolicy.IsAllowed(@"C:\Windows\system32\evil.md", list));
    }

    [Fact]
    public void WildcardsStayWithinSegments()
    {
        var scopes = new[] { @"C:\vault\*" };
        Assert.True(FsPolicy.IsAllowed(@"C:\vault\note.md", scopes));
        Assert.False(FsPolicy.IsAllowed(@"C:\vault\sub\note.md", scopes));
    }

    [Fact]
    public void TraversalNeverMatches()
    {
        var scopes = new[] { @"C:\vault\**" };
        Assert.False(FsPolicy.IsAllowed(@"C:\vault\..\Windows\evil.md", scopes));
    }

    [Fact]
    public void DoubleStarSpansSegments()
    {
        var scopes = new[] { @"C:\vault\**" };
        Assert.True(FsPolicy.IsAllowed(@"C:\vault\a\b\c.md", scopes));
    }

    [Fact]
    public void SlashesAreNormalized()
    {
        var scopes = new[] { "C:/vault/**/*.md" };
        Assert.True(FsPolicy.IsAllowed(@"C:\vault\uni\note.md", scopes));
    }
}

public class ExtensionFsServiceTests : IDisposable
{
    private readonly string vault;
    private readonly ExtensionFsService service;
    private readonly IReadOnlyList<string> scopes;

    public ExtensionFsServiceTests()
    {
        vault = Path.Combine(Path.GetTempPath(), "fk-fs-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(vault, "uni"));
        File.WriteAllText(Path.Combine(vault, "uni", "Perceptron.md"), "The perceptron is a model of a human neuron.");
        File.WriteAllText(Path.Combine(vault, "Hypercube.md"), "# Hypercube");
        service = new ExtensionFsService();
        scopes = FsPolicy.InterpolateAll(
            ["{{vaultPath}}/**/*.md"],
            new Dictionary<string, string> { ["vaultPath"] = vault });
    }

    private static Dictionary<string, System.Text.Json.JsonElement> Params(string json) =>
        System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, System.Text.Json.JsonElement>>(json)!;

    [Fact]
    public void GlobFindsVaultNotes()
    {
        var outcome = service.Handle("obsidian-notes", "fs.glob", Params("{ \"pattern\": \"**/*.md\" }"), scopes);
        Assert.True(outcome.Ok, outcome.Error?.Message);
        var entries = outcome.Result!.Value.GetProperty("entries");
        Assert.Equal(2, entries.GetArrayLength());
    }

    [Fact]
    public void ReadTextReturnsContent()
    {
        var outcome = service.Handle("obsidian-notes", "fs.readText",
            Params("{ \"path\": \"" + Path.Combine(vault, "Hypercube.md").Replace('\\', '/') + "\" }"), scopes);
        Assert.True(outcome.Ok, outcome.Error?.Message);
        Assert.Contains("Hypercube", outcome.Result!.Value.GetProperty("content").GetString());
    }

    [Fact]
    public void WriteAppendAndDeleteRoundTrip()
    {
        var notePath = Path.Combine(vault, "uni", "Appended.md").Replace('\\', '/');
        Assert.True(service.Handle("obsidian-notes", "fs.writeText",
            Params("{ \"path\": \"" + notePath + "\", \"content\": \"line one\" }"), scopes).Ok);
        Assert.True(service.Handle("obsidian-notes", "fs.writeText",
            Params("{ \"path\": \"" + notePath + "\", \"content\": \"\\nline two\", \"append\": true }"), scopes).Ok);
        var read = service.Handle("obsidian-notes", "fs.readText", Params("{ \"path\": \"" + notePath + "\" }"), scopes);
        Assert.Contains("line one", read.Result!.Value.GetProperty("content").GetString());
        Assert.Contains("line two", read.Result!.Value.GetProperty("content").GetString());
        Assert.True(service.Handle("obsidian-notes", "fs.delete", Params("{ \"path\": \"" + notePath + "\" }"), scopes).Ok);
        Assert.False(File.Exists(notePath));
    }

    [Fact]
    public void PathsOutsideScopeAreDenied()
    {
        var outside = Path.Combine(Path.GetTempPath(), "outside.md").Replace('\\', '/');
        var outcome = service.Handle("obsidian-notes", "fs.readText", Params("{ \"path\": \"" + outside + "\" }"), scopes);
        Assert.False(outcome.Ok);
        Assert.Equal("pathNotInScope", outcome.Error?.Code);
    }

    [Fact]
    public void EmptyScopesFailClosed()
    {
        var outcome = service.Handle("obsidian-notes", "fs.readText",
            Params("{ \"path\": \"" + Path.Combine(vault, "Hypercube.md").Replace('\\', '/') + "\" }"), []);
        Assert.False(outcome.Ok);
        Assert.Equal("fsScopeUnavailable", outcome.Error?.Code);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(vault, recursive: true);
        }
        catch (IOException)
        {
            /* best effort */
        }
    }
}
