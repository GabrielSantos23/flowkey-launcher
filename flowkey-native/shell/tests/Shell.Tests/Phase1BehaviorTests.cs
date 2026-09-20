using System.Text.Json;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class NativeMethodTableTests
{
    private static Dictionary<string, JsonElement> Params(string key, string value) =>
        new() { [key] = JsonDocument.Parse($"\"{value}\"").RootElement };

    [Fact]
    public void UndeclaredMethodIsRejectedBeforeLookup()
    {
        var table = new NativeMethodTable();
        var outcome = table.Execute("clipboard.write", Array.Empty<string>(), Params("text", "x"));
        Assert.False(outcome.Ok);
        Assert.Equal("methodNotDeclared", outcome.Error!.Code);
    }

    [Fact]
    public void FakeMethodYieldsNotImplementedStructuredError()
    {
        var table = new NativeMethodTable();
        var declared = new[] { "fake.method" };
        var outcome = table.Execute("fake.method", declared, Params("x", "y"));
        Assert.False(outcome.Ok);
        Assert.Equal("notImplemented", outcome.Error!.Code);
        Assert.Contains("fake.method", outcome.Error.Message);
        Assert.Null(outcome.Result);
    }

    [Fact]
    public void DeclaredClipboardWriteSucceeds()
    {
        JsonElement? error = null;
        var thread = new Thread(() =>
        {
            var table = new NativeMethodTable();
            var outcome = table.Execute("clipboard.write", new[] { "clipboard.write" }, Params("text", "🎉"));
            if (!outcome.Ok)
            {
                error = JsonSerializer.SerializeToElement(outcome.Error);
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        Assert.Null(error);
    }

    [Fact]
    public void ClipboardWriteWithMissingTextFailsWithInvalidParams()
    {
        var table = new NativeMethodTable();
        var outcome = table.Execute("clipboard.write", new[] { "clipboard.write" }, null);
        Assert.False(outcome.Ok);
        Assert.Equal("invalidParams", outcome.Error!.Code);
    }
}

public class SearchStateStaleTests
{
    private static ListTree TreeWithEmoji(string emoji) =>
        new()
        {
            Sections =
            {
                new UiSection
                {
                    Items = { new UiItem { Id = emoji, Title = emoji, Actions = { new UiAction { Id = "copy", Title = "Copy", Primary = true } } } },
                },
            },
            EmptyView = new UiEmptyView { Title = "No matches" },
        };

    [Fact]
    public void StaleResultIsDiscarded()
    {
        var state = new SearchState();
        state.BeginQuery(new[] { ("emoji", "s2") });

        var rows = state.ApplyResult("s1", TreeWithEmoji("old"), out var staleOld);
        Assert.True(staleOld);
        Assert.Empty(rows);
        Assert.Empty(state.CurrentRows);
    }

    [Fact]
    public void CurrentResultReplacesRows()
    {
        var state = new SearchState();
        state.BeginQuery(new[] { ("emoji", "s2") });
        state.ApplyResult("s1", TreeWithEmoji("old"), out _);

        var rows = state.ApplyResult("s2", TreeWithEmoji("new"), out var stale);
        Assert.False(stale);
        Assert.Single(rows.OfType<ItemRow>());
        Assert.Equal("new", rows.OfType<ItemRow>().First().Item.Id);
        Assert.Equal("emoji", rows.OfType<ItemRow>().First().ExtensionId);
        Assert.Equal(rows, state.CurrentRows);
    }

    [Fact]
    public void MultiExtensionResultsMergeInReadyOrder()
    {
        var state = new SearchState();
        state.BeginQuery(new[] { ("emoji", "s1"), ("apps", "s2") });
        state.ApplyResult("s2", TreeWithEmoji("app"), out _);
        var rows = state.ApplyResult("s1", TreeWithEmoji("emoji-first"), out _);

        var items = rows.OfType<ItemRow>().ToList();
        Assert.Equal(2, items.Count);
        Assert.Equal("emoji-first", items[0].Item.Id);
        Assert.Equal("emoji", items[0].ExtensionId);
        Assert.Equal("app", items[1].Item.Id);
        Assert.Equal("apps", items[1].ExtensionId);
    }
}

public class ProtocolVersionRefusalTests
{
    [Fact]
    public void ReadyMessageWithWrongVersionIsDetectable()
    {
        var json = "{\"type\":\"ready\",\"protocolVersion\":999,\"extensions\":[]}";
        var ready = JsonSerializer.Deserialize<ReadyMessage>(json, JsonOptions.Default)!;
        Assert.NotEqual(ProtocolVersion.Current, ready.ProtocolVersion);
    }

    [Fact]
    public void ReadyMessageWithCurrentVersionPasses()
    {
        var json = "{\"type\":\"ready\",\"protocolVersion\":1,\"extensions\":[{\"id\":\"emoji\",\"name\":\"Emoji\",\"version\":\"2.0.0\",\"commands\":[],\"nativeMethods\":[\"clipboard.write\"],\"httpHosts\":[]}]}";
        var ready = JsonSerializer.Deserialize<ReadyMessage>(json, JsonOptions.Default)!;
        Assert.Equal(ProtocolVersion.Current, ready.ProtocolVersion);
        Assert.Equal("emoji", ready.Extensions[0].Id);
    }
}
