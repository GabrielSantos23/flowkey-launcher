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
        store.Record("first", 1000, "testapp");
        store.Record("second", 2000, "testapp");
        store.Record("first", 3000, "testapp");
        var items = store.Query("", 50);
        Assert.Equal(2, items.Count);
        Assert.Equal("first", items[0].Text);
        Assert.Equal("second", items[1].Text);
    }

    [Fact]
    public void DuplicateWithinWindowIsIgnored()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("same", 1000, "testapp");
        store.Record("same", 1200, "testapp");
        Assert.Equal(1, store.Count);
    }

    [Fact]
    public void HistoryIsCapped()
    {
        var store = new ClipboardHistoryStore(tempDir);
        for (var i = 0; i < ClipboardHistoryStore.MaxEntries + 20; i++)
        {
            store.Record("entry-" + i, i * 1000L, "testapp");
        }
        Assert.Equal(ClipboardHistoryStore.MaxEntries, store.Count);
        Assert.Equal("entry-" + (ClipboardHistoryStore.MaxEntries + 19), store.Query("", 1)[0].Text);
    }

    [Fact]
    public void QueryFiltersByText()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("hello world", 1000, "testapp");
        store.Record("other text", 2000, "testapp");
        var items = store.Query("world", 50);
        var item = Assert.Single(items);
        Assert.Equal("hello world", item.Text);
    }

    [Fact]
    public void PersistsEncryptedAcrossInstances()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("secret payload", 1000, "testapp");

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
        store.Record("to be cleared", 1000, "testapp");
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
        store.Record(new string('x', ClipboardHistoryStore.MaxTextChars + 1), 1000, "testapp");
        Assert.Equal(0, store.Count);
    }

    [Fact]
    public void EntryIdIsStableAcrossQueriesAndReload()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("stable text", 1000, "testapp");
        var filtered = store.Query("stable", 50);
        var unfiltered = store.Query("", 50);
        Assert.Equal(
            ClipboardHistoryStore.ComputeEntryId(filtered[0]),
            ClipboardHistoryStore.ComputeEntryId(unfiltered[0]));
        var reloaded = new ClipboardHistoryStore(tempDir);
        Assert.Equal(
            ClipboardHistoryStore.ComputeEntryId(filtered[0]),
            ClipboardHistoryStore.ComputeEntryId(Assert.Single(reloaded.Query("", 50))));
    }

    [Fact]
    public void DeleteRemovesEntryByIdAndPersists()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("alpha", 1000, "testapp");
        store.Record("beta", 2000, "testapp");
        var beta = store.Query("", 50).First(e => e.Text == "beta");
        var id = ClipboardHistoryStore.ComputeEntryId(beta);

        Assert.True(store.Delete(id));

        Assert.Equal("alpha", Assert.Single(store.Query("", 50)).Text);
        var reloaded = new ClipboardHistoryStore(tempDir);
        Assert.Equal("alpha", Assert.Single(reloaded.Query("", 50)).Text);
    }

    [Fact]
    public void DeleteUnknownIdReturnsFalseAndKeepsOtherEntries()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("alpha", 1000, "testapp");
        store.Record("beta", 2000, "testapp");
        Assert.False(store.Delete("00000000000000000000000000000000"));
        Assert.Equal(2, store.Count);
        Assert.Equal(["beta", "alpha"], store.Query("", 50).Select(e => e.Text).ToList());
    }

    [Fact]
    public void SourceAppIsStoredAndPersisted()
    {
        var store = new ClipboardHistoryStore(tempDir);
        store.Record("from chrome", 1000, "chrome");
        var reloaded = new ClipboardHistoryStore(tempDir);
        var entry = Assert.Single(reloaded.Query("", 50));
        Assert.Equal("chrome", entry.SourceApp);
    }

    [Fact]
    public void RecordImagePersistsEntryWithThumbnail()
    {
        var store = new ClipboardHistoryStore(tempDir);
        using (var image = new System.Drawing.Bitmap(40, 20))
        {
            store.RecordImage(image, 1000, "sharex");
        }
        var entry = Assert.Single(store.Query("", 50));
        Assert.Equal("image", entry.Kind);
        Assert.Equal("sharex", entry.SourceApp);
        Assert.Equal(40, entry.ImageWidth);
        Assert.Equal(20, entry.ImageHeight);
        Assert.True(File.Exists(entry.ImagePath!));
        Assert.NotNull(store.ThumbnailUriFor(entry));
        var reloaded = new ClipboardHistoryStore(tempDir);
        Assert.Equal("image", Assert.Single(reloaded.Query("", 50)).Kind);
    }

    [Fact]
    public void SameImageIsDeduplicatedByContent()
    {
        var store = new ClipboardHistoryStore(tempDir);
        using (var image = new System.Drawing.Bitmap(30, 30))
        {
            store.RecordImage(image, 1000, "a");
        }
        using (var image = new System.Drawing.Bitmap(30, 30))
        {
            store.RecordImage(image, 5000, "b");
        }
        Assert.Equal(1, store.Count);
    }

    [Fact]
    public void DeleteImageRemovesFiles()
    {
        var store = new ClipboardHistoryStore(tempDir);
        using (var image = new System.Drawing.Bitmap(30, 30))
        {
            store.RecordImage(image, 1000, "a");
        }
        var entry = Assert.Single(store.Query("", 50));
        Assert.True(store.Delete(ClipboardHistoryStore.ComputeEntryId(entry)));
        Assert.False(File.Exists(entry.ImagePath!));
        Assert.Equal(0, store.Count);
    }

    [Fact]
    public void ImageEntriesMatchImageQuery()
    {
        var store = new ClipboardHistoryStore(tempDir);
        using (var image = new System.Drawing.Bitmap(30, 30))
        {
            store.RecordImage(image, 1000, "a");
        }
        store.Record("plain text", 2000, "a");
        Assert.Single(store.Query("image", 50));
        Assert.Equal(2, store.Query("", 50).Count);
        Assert.Single(store.Query("plain", 50));
    }
}
