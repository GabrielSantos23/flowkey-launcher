using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ExtensionCacheStoreTests
{
    private static string NewDir()
    {
        var path = Path.Combine(Path.GetTempPath(), "flowkey-cache-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static Dictionary<string, JsonElement> Params(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    private static long nowMs = 1_700_000_000_000;

    private ExtensionCacheStore NewStore() =>
        new(NewDir(), () => nowMs);

    [Fact]
    public void SetThenGetRoundTripsJsonValues()
    {
        var store = NewStore();

        var setResult = store.Handle("demo-ext", "cache.set", Params("""{"key":"tracks","value":{"items":[1,2,3]}}"""));
        Assert.True(setResult.Ok);

        var getResult = store.Handle("demo-ext", "cache.get", Params("""{"key":"tracks"}"""));
        Assert.True(getResult.Ok);
        var value = getResult.Result!.Value.GetProperty("value");
        Assert.Equal(3, value.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public void ExpiredEntriesAreDroppedOnGet()
    {
        var store = NewStore();
        Assert.True(store.Handle("demo-ext", "cache.set", Params("""{"key":"hot","value":"x","ttlSeconds":10}""")).Ok);

        nowMs += 5_000;
        var fresh = store.Handle("demo-ext", "cache.get", Params("""{"key":"hot"}"""));
        Assert.Equal("x", fresh.Result!.Value.GetProperty("value").GetString());

        nowMs += 11_000;
        var expired = store.Handle("demo-ext", "cache.get", Params("""{"key":"hot"}"""));
        Assert.False(expired.Result!.Value.TryGetProperty("value", out _));

        var afterDrop = store.Handle("demo-ext", "cache.get", Params("""{"key":"hot"}"""));
        Assert.False(afterDrop.Result!.Value.TryGetProperty("value", out _));
    }

    [Fact]
    public void DeleteAndClearRemoveEntries()
    {
        var store = NewStore();
        store.Handle("demo-ext", "cache.set", Params("""{"key":"a","value":1}"""));
        store.Handle("demo-ext", "cache.set", Params("""{"key":"b","value":2}"""));

        Assert.True(store.Handle("demo-ext", "cache.delete", Params("""{"key":"a"}""")).Ok);
        var missing = store.Handle("demo-ext", "cache.get", Params("""{"key":"a"}"""));
        Assert.False(missing.Result!.Value.TryGetProperty("value", out _));

        Assert.True(store.Handle("demo-ext", "cache.clear", Params("{}")).Ok);
        var empty = store.Handle("demo-ext", "cache.get", Params("""{"key":"b"}"""));
        Assert.False(empty.Result!.Value.TryGetProperty("value", out _));
    }

    [Fact]
    public void EnforcesKeyCountCap()
    {
        var store = NewStore();
        for (var i = 0; i < ExtensionCacheStore.MaxKeysPerExtension; i++)
        {
            var set = store.Handle("demo-ext", "cache.set", Params($$"""{"key":"k{{i}}","value":{{i}}}"""));
            Assert.True(set.Ok);
        }

        var overflow = store.Handle("demo-ext", "cache.set", Params("""{"key":"overflow","value":true}"""));
        Assert.Equal("tooManyKeys", overflow.Error!.Code);
    }

    [Fact]
    public void EnforcesValueSizeCap()
    {
        var store = NewStore();
        var big = new string('x', ExtensionCacheStore.MaxValueJsonBytes);
        var set = store.Handle("demo-ext", "cache.set", Params($$"""{"key":"big","value":"{{big}}"}"""));

        Assert.Equal("valueTooLarge", set.Error!.Code);
        _ = big;
    }

    [Fact]
    public void RejectsNonPositiveTtl()
    {
        var store = NewStore();
        var set = store.Handle("demo-ext", "cache.set", Params("""{"key":"t","value":1,"ttlSeconds":0}"""));
        Assert.Equal("invalidParams", set.Error!.Code);
    }

    [Fact]
    public void CorruptCacheFileStartsEmpty()
    {
        var dir = NewDir();
        Directory.CreateDirectory(Path.Combine(dir, "extension-cache"));
        File.WriteAllText(Path.Combine(dir, "extension-cache", "demo-ext.json"), "{not json");
        var store = new ExtensionCacheStore(dir, () => nowMs);

        var get = store.Handle("demo-ext", "cache.get", Params("""{"key":"anything"}"""));
        Assert.True(get.Ok);
        Assert.False(get.Result!.Value.TryGetProperty("value", out _));
    }

    [Fact]
    public void RemoveExtensionDeletesTheCacheFile()
    {
        var dir = NewDir();
        var store = new ExtensionCacheStore(dir, () => nowMs);
        store.Handle("demo-ext", "cache.set", Params("""{"key":"a","value":1}"""));
        Assert.True(File.Exists(Path.Combine(dir, "extension-cache", "demo-ext.json")));

        store.RemoveExtension("demo-ext");

        Assert.False(File.Exists(Path.Combine(dir, "extension-cache", "demo-ext.json")));
    }
}
