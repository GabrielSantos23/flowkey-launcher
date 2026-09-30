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
public sealed class RealClipboardCollection : ICollectionFixture<ClipboardGuardFixture>;

/// <summary>
/// Saves the real system clipboard before the collection's tests run and
/// restores it afterwards: the clipboard tests write fixture strings to the
/// OS clipboard, and without the guard every test run would clobber the
/// user's actual clipboard content (and pollute a running launcher's
/// history). The snapshot is plain content (not the IDataObject), because
/// COM objects cannot cross the STA threads the runner hands out.
/// </summary>
public sealed class ClipboardGuardFixture : IDisposable
{
    private readonly ClipboardReadContent saved;

    public ClipboardGuardFixture()
    {
        saved = RunSta(() => ClipboardService.ReadContent());
    }

    public void Dispose()
    {
        RunSta(() =>
        {
            if (saved.Text is null && saved.Html is null && saved.Paths is null)
            {
                ClipboardService.Clear();
            }
            else
            {
                ClipboardService.WriteContent(new ClipboardWriteContent(saved.Text, saved.Html, saved.Paths));
            }
        });
    }

    private static void RunSta(Action action) =>
        RunSta<object>(() =>
        {
            action();
            return null;
        });

    private static T RunSta<T>(Func<T> action)
    {
        var result = default(T);
        var thread = new Thread(() => result = action());
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        return result!;
    }
}

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
public class ClipboardRichContentTests(ClipboardGuardFixture guard)
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
    public void TestTaggedWritesAreNotCaptured()
    {
        var previous = ClipboardService.ExcludeFromMonitor;
        ClipboardService.ExcludeFromMonitor = true;
        try
        {
            RunInSta(() =>
            {
                ClipboardService.WriteText("tagged write must stay out of the history");
                Assert.Null(ClipboardReader.TryCapture());
            });
        }
        finally
        {
            ClipboardService.ExcludeFromMonitor = previous;
        }
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
