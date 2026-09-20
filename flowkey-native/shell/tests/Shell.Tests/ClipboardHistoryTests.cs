using System.IO;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ClipboardHistoryTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-clip-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Theory]
    [InlineData(true, false, false, false)]
    [InlineData(false, true, true, false)]
    [InlineData(false, true, false, true)]
    [InlineData(false, false, false, true)]
    public void ExclusionFormatsGateRecording(bool excludePresent, bool canIncludePresent, bool canIncludeZero, bool expected)
    {
        Assert.Equal(expected, ClipboardExclusions.ShouldRecord(excludePresent, canIncludePresent, canIncludeZero));
    }

    [Fact]
    public void RepeatedCopyMovesToTopInsteadOfDuplicating()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("first", 1000);
        store.Record("second", 2000);
        store.Record("first", 3000);
        var items = store.Query("", 50);
        Assert.Equal(2, items.Count);
        Assert.Equal("first", items[0].Text);
        Assert.Equal("second", items[1].Text);
    }

    [Fact]
    public void DuplicateWithinWindowIsIgnored()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("same", 1000);
        store.Record("same", 1200);
        Assert.Equal(1, store.Count);
    }

    [Fact]
    public void HistoryIsCapped()
    {
        var store = new ClipboardHistoryStore(tempDir);
        for (var i = 0; i < ClipboardHistoryStore.MaxEntries + 20; i++)
        {
            store.Record("entry-" + i, i * 1000L);
        }
        Assert.Equal(ClipboardHistoryStore.MaxEntries, store.Count);
        Assert.Equal("entry-" + (ClipboardHistoryStore.MaxEntries + 19), store.Query("", 1)[0].Text);
    }

    [Fact]
    public void QueryFiltersByText()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("hello world", 1000);
        store.Record("other text", 2000);
        var items = store.Query("world", 50);
        var item = Assert.Single(items);
        Assert.Equal("hello world", item.Text);
    }

    [Fact]
    public void PersistsEncryptedAcrossInstances()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("secret payload", 1000);

        var files = Directory.GetFiles(tempDir);
        var file = Assert.Single(files);
        var raw = File.ReadAllBytes(file);
        Assert.DoesNotContain("secret payload"u8, raw);

        var reloaded = new ClipboardHistoryStore(tempDir);
        var items = reloaded.Query("", 50);
        var item = Assert.Single(items);
        Assert.Equal("secret payload", item.Text);
    }

    [Fact]
    public void ClearRemovesMemoryAndFile()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("to be cleared", 1000);
        store.Clear();
        Assert.Equal(0, store.Count);
        Assert.Empty(Directory.GetFiles(tempDir));
        var reloaded = new ClipboardHistoryStore(tempDir);
        Assert.Equal(0, reloaded.Count);
    }

    [Fact]
    public void OversizedTextIsNotRecorded()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record(new string('x', ClipboardHistoryStore.MaxTextChars + 1), 1000);
        Assert.Equal(0, store.Count);
    }
}
