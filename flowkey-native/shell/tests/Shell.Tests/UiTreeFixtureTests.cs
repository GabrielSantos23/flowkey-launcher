using System.IO;
using System.Text.Json;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public static class ContractPaths
{
    public static string ContractDir { get; } = FindContractDir();

    public static string UiFixture => Path.Combine(ContractDir, "ui-tree.fixture.json");

    public static string ProtocolFixture => Path.Combine(ContractDir, "protocol.fixture.json");

    private static string FindContractDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "contract", "ui-tree.fixture.json");
            if (File.Exists(candidate))
            {
                return Path.Combine(dir.FullName, "contract");
            }
            dir = dir.Parent!;
        }
        throw new InvalidOperationException("contract directory not found above the test output");
    }
}

public class UiTreeFixtureTests
{
    private static JsonDocument UiFixture() =>
        JsonDocument.Parse(File.ReadAllText(ContractPaths.UiFixture));

    [Fact]
    public void ListFixtureDeserializesIntoListTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);

        var list = Assert.IsType<ListTree>(tree);
        Assert.NotEmpty(list.Sections);
        Assert.Equal("No matches", list.EmptyView!.Title);
        foreach (var section in list.Sections)
        {
            Assert.NotEmpty(section.Items);
            foreach (var item in section.Items)
            {
                Assert.False(string.IsNullOrWhiteSpace(item.Id));
                Assert.NotNull(item.Actions);
                Assert.Contains(item.Actions!, a => a.Primary == true);
            }
        }
    }

    [Fact]
    public void DetailFixtureDeserializesIntoDetailTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("detail").GetRawText(), JsonOptions.Default);

        var detail = Assert.IsType<DetailTree>(tree);
        Assert.Equal("🚀 Rocket", detail.Title);
        Assert.NotEmpty(detail.Fields);
        Assert.Contains("**fast**", detail.Description);
        Assert.Contains(detail.Actions, a => a.Primary == true);
    }

    [Fact]
    public void GridFixtureDeserializesIntoGridTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("grid").GetRawText(), JsonOptions.Default);

        var grid = Assert.IsType<GridTree>(tree);
        Assert.Equal(8, grid.Columns);
        Assert.NotEmpty(grid.Items);
        Assert.Equal("Nothing here", grid.EmptyView!.Title);
    }
}

public class ProtocolFixtureTests
{
    private static JsonElement Root() =>
        JsonDocument.Parse(File.ReadAllText(ContractPaths.ProtocolFixture)).RootElement;

    [Fact]
    public void ProtocolVersionIsOneEverywhere()
    {
        var root = Root();
        Assert.Equal(1, root.GetProperty("protocolVersion").GetInt32());
        Assert.Equal(ProtocolVersion.Current, root.GetProperty("protocolVersion").GetInt32());

        var init = root.GetProperty("hostToSidecar").GetProperty("init").Deserialize<InitMessage>(JsonOptions.Default)!;
        Assert.Equal(ProtocolVersion.Current, init.ProtocolVersion);
        Assert.False(string.IsNullOrWhiteSpace(init.ExtensionsDir));

        var ready = root.GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;
        Assert.Equal(ProtocolVersion.Current, ready.ProtocolVersion);
    }

    [Fact]
    public void ReadyExtensionsDeclareNativeMethodsAndHttpHosts()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;

        var emoji = Assert.Single(ready.Extensions, e => e.Id == "emoji");
        Assert.Contains("clipboard.write", emoji.NativeMethods);
        Assert.Empty(emoji.HttpHosts);
        Assert.NotEmpty(emoji.Commands);
    }

    [Fact]
    public void SearchAndActionCarryRequestAndExtensionIds()
    {
        var root = Root();
        var search = root.GetProperty("hostToSidecar").GetProperty("search").Deserialize<SearchMessage>(JsonOptions.Default)!;
        var action = root.GetProperty("hostToSidecar").GetProperty("action").Deserialize<ActionMessage>(JsonOptions.Default)!;

        Assert.False(string.IsNullOrWhiteSpace(search.RequestId));
        Assert.Equal("emoji", search.ExtensionId);
        Assert.False(string.IsNullOrWhiteSpace(action.RequestId));
        Assert.Equal("emoji", action.ExtensionId);
        Assert.False(string.IsNullOrWhiteSpace(action.Item!.Id));
    }

    [Fact]
    public void SearchMayCarryCommandId()
    {
        var search = Root().GetProperty("hostToSidecar").GetProperty("searchWithCommand").Deserialize<SearchMessage>(JsonOptions.Default)!;
        Assert.Equal("open", search.CommandId);
        Assert.Equal("clipboard-history", search.ExtensionId);
    }

    [Fact]
    public void CommandsMayDeclareKeywordsAndMode()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;
        var command = ready.Extensions[0].Commands[0];
        Assert.Contains("emoji", command.Keywords!);
        Assert.Equal("view", command.Mode);
    }

    [Fact]
    public void AckCarriesRequestIdOnly()
    {
        var ack = Root().GetProperty("sidecarToHost").GetProperty("ack").Deserialize<AckMessage>(JsonOptions.Default)!;
        Assert.Equal("ack", ack.Type);
        Assert.False(string.IsNullOrWhiteSpace(ack.RequestId));
    }

    [Fact]
    public void NativeCallCarriesExtensionId()
    {
        var root = Root();
        var call = root.GetProperty("sidecarToHost").GetProperty("nativeCall").Deserialize<NativeCallMessage>(JsonOptions.Default)!;

        Assert.Equal("emoji", call.ExtensionId);
        Assert.Equal("clipboard.write", call.Method);
        Assert.NotNull(call.Params);

        var denied = root.GetProperty("sidecarToHost").GetProperty("nativeCallDenied").Deserialize<NativeCallMessage>(JsonOptions.Default)!;
        Assert.Equal("emoji", denied.ExtensionId);
        Assert.Equal("http.fetch", denied.Method);
    }

    [Fact]
    public void ErrorCarriesCodeAndMessage()
    {
        var error = Root().GetProperty("sidecarToHost").GetProperty("error").Deserialize<ErrorMessage>(JsonOptions.Default)!;

        Assert.False(string.IsNullOrWhiteSpace(error.Error.Code));
        Assert.False(string.IsNullOrWhiteSpace(error.Error.Message));
    }
}
