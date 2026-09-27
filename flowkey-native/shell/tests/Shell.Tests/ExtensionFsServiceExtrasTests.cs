using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ExtensionFsServiceExtrasTests : IDisposable
{
    private readonly string vault;
    private readonly ExtensionFsService service;
    private readonly IReadOnlyList<string> scopes;

    public ExtensionFsServiceExtrasTests()
    {
        vault = Path.Combine(Path.GetTempPath(), "fk-fs-extras-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(vault);
        File.WriteAllText(Path.Combine(vault, "note.md"), "# note");
        service = new ExtensionFsService();
        scopes = FsPolicy.InterpolateAll(
            ["{{vaultPath}}/**"],
            new Dictionary<string, string> { ["vaultPath"] = vault });
    }

    private static Dictionary<string, JsonElement> Params(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    private string InVault(string relative) => Path.Combine(vault, relative).Replace('\\', '/');

    [Fact]
    public void MkdirCreatesNestedDirectoriesAndExistsReportsThem()
    {
        var dir = InVault("archive/2026");
        Assert.True(service.Handle("demo", "fs.mkdir", Params($$"""{"path":"{{dir}}"}"""), scopes).Ok);

        var existsDir = service.Handle("demo", "fs.exists", Params($$"""{"path":"{{dir}}"}"""), scopes);
        Assert.True(existsDir.Ok);
        Assert.True(existsDir.Result!.Value.GetProperty("exists").GetBoolean());

        var missingPath = InVault("nope.md");
        var missing = service.Handle("demo", "fs.exists", Params($$"""{"path":"{{missingPath}}"}"""), scopes);
        Assert.False(missing.Result!.Value.GetProperty("exists").GetBoolean());
    }

    [Fact]
    public void ExistsIsFalseOutsideScopeWithoutFailing()
    {
        var outside = Path.Combine(Path.GetTempPath(), "outside.md").Replace('\\', '/');
        var outcome = service.Handle("demo", "fs.exists", Params($$"""{"path":"{{outside}}"}"""), scopes);
        Assert.False(outcome.Ok, "outside-scope paths stay denied");
        Assert.Equal("pathNotInScope", outcome.Error!.Code);
    }

    [Fact]
    public void CopyAndMoveStayInScope()
    {
        var from = InVault("note.md");
        var copy = InVault("copy.md");
        var moved = InVault("renamed.md");

        Assert.True(service.Handle("demo", "fs.copy", Params($$"""{"from":"{{from}}","to":"{{copy}}"}"""), scopes).Ok);
        Assert.True(File.Exists(copy.Replace('/', '\\')));

        Assert.True(service.Handle("demo", "fs.move", Params($$"""{"from":"{{copy}}","to":"{{moved}}"}"""), scopes).Ok);
        Assert.False(File.Exists(copy));
        Assert.True(File.Exists(moved));
    }

    [Fact]
    public void CopyRejectsDestinationOutsideScope()
    {
        var from = InVault("note.md");
        var outside = Path.Combine(Path.GetTempPath(), "escaped.md").Replace('\\', '/');
        var outcome = service.Handle("demo", "fs.copy", Params($$"""{"from":"{{from}}","to":"{{outside}}"}"""), scopes);
        Assert.False(outcome.Ok);
        Assert.Equal("pathNotInScope", outcome.Error!.Code);
    }

    [Fact]
    public void TrashRemovesFileViaRecycleBin()
    {
        var target = Path.Combine(vault, "trashed.md");
        File.WriteAllText(target, "bye");
        Assert.True(RecycleBin.TryTrash(target, out var error));
        Assert.Null(error);
        Assert.False(File.Exists(target));
    }

    [Fact]
    public void TrashRejectsMissingFiles()
    {
        var missing = Path.Combine(vault, "does-not-exist.md");
        Assert.False(RecycleBin.TryTrash(missing, out var error));
        Assert.NotNull(error);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(vault, recursive: true);
        }
        catch (IOException)
        {
        }
    }
}
