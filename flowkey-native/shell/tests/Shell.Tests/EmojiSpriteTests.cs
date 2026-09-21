using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class EmojiSpriteTests
{
    [Fact]
    public void SpriteBuildProducesColorPngs()
    {
        var emojis = new[]
        {
            char.ConvertFromUtf32(0x1F389),
            char.ConvertFromUtf32(0x1F600),
            char.ConvertFromUtf32(0x2764),
        };
        Assert.True(EmojiSpriteRenderer.EnsureSprites(emojis), "EnsureSprites failed (browser missing or render error)");
        foreach (var emoji in emojis)
        {
            Assert.True(EmojiSpriteRenderer.IsCached(emoji), "missing sprite for " + emoji);
        }
    }
}
