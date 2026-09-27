using System.Collections.Specialized;
using System.Windows;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

/// <summary>
/// Tests that touch the real machine clipboard run in one serialized
/// collection — parallel STA clipboard access from two test classes is the
/// known source of "clipboard busy" flakiness.
/// </summary>
[CollectionDefinition(nameof(RealClipboardCollection), DisableParallelization = true)]
public sealed class RealClipboardCollection;

public class CfHtmlTests
{
    [Fact]
    public void ToCfHtmlWrapsFragmentWithByteOffsets()
    {
        var cf = CfHtml.ToCfHtml("<b>hi</b>");

        Assert.StartsWith("Version:0.9", cf);
        Assert.Contains("<!--StartFragment--><b>hi</b><!--EndFragment-->", cf);

        static int Offset(string cf, string field) =>
            int.Parse(cf[(cf.IndexOf(field, StringComparison.Ordinal) + field.Length)..].Split('\r')[0]);

        Assert.Equal(cf.Length, Offset(cf, "EndHTML:"));
        var startFragment = Offset(cf, "StartFragment:");
        var endFragment = Offset(cf, "EndFragment:");
        Assert.Equal("<b>hi</b>", cf[startFragment..endFragment]);
    }

    [Fact]
    public void FromCfHtmlExtractsTheFragment()
    {
        var original = "<i>hello</i>";
        var roundTripped = CfHtml.FromCfHtml(CfHtml.ToCfHtml(original));
        Assert.Equal(original, roundTripped);
    }

    [Fact]
    public void FromCfHtmlPassesThroughPlainHtml()
    {
        Assert.Equal("<p>raw</p>", CfHtml.FromCfHtml("<p>raw</p>"));
    }
}

[Collection(nameof(RealClipboardCollection))]
public class ClipboardRichContentTests
{
    private static void RunInSta(Action action)
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                failure = ex;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (failure is not null)
        {
            throw failure;
        }
    }

    /// <summary>
    /// Clipboard state settles asynchronously when other tests (or clipboard
    /// managers) contend for it, so poll instead of asserting immediately.
    /// </summary>
    private static bool Eventually(Func<bool> condition, int timeoutMs = 5_000)
    {
        for (var waited = 0; waited <= timeoutMs; waited += 50)
        {
            if (condition())
            {
                return true;
            }
            Thread.Sleep(50);
        }
        return condition();
    }

    [Fact]
    public void WriteThenReadRoundTripsTextAndHtml() => RunInSta(() =>
    {
        ClipboardService.WriteContent(new ClipboardWriteContent("plain text", "<b>rich</b>", null));
        Assert.True(Eventually(() => Clipboard.ContainsText()));

        var content = ClipboardService.ReadContent();
        Assert.Equal("plain text", content.Text);
        Assert.Equal("<b>rich</b>", content.Html);
        Assert.Null(content.Paths);
    });

    [Fact]
    public void WriteThenReadRoundTripsFileDropList() => RunInSta(() =>
    {
        ClipboardService.WriteContent(new ClipboardWriteContent(null, null, ["C:/a.txt", "C:/b.txt"]));

        var content = ClipboardService.ReadContent();
        Assert.NotNull(content.Paths);
        Assert.Equal(["C:/a.txt", "C:/b.txt"], content.Paths);
    });

    [Fact]
    public void ClearEmptiesTheClipboard() => RunInSta(() =>
    {
        ClipboardService.WriteText("something");
        Assert.True(Eventually(() => Clipboard.ContainsText()));

        ClipboardService.Clear();

        Assert.True(Eventually(() => !Clipboard.ContainsText()));
    });
}
