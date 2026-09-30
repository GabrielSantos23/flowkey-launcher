using System.Windows;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class WindowPlacementTests
{
    private static readonly Rect WorkArea = new(100, 50, 1600, 800);

    [Fact]
    public void CentersTheWindowInsideTheWorkArea()
    {
        var (left, top) = WindowPlacement.CenterInWorkArea(WorkArea, new System.Windows.Size(750, 475));
        Assert.Equal(100 + (1600 - 750) / 2.0, left);
        Assert.Equal(50 + (800 - 475) / 2.0, top);
    }

    [Fact]
    public void CenteringNeverProducesNegativeOffsetsForHugeWindows()
    {
        var (left, top) = WindowPlacement.CenterInWorkArea(WorkArea, new Size(2000, 900));
        Assert.Equal(100, left);
        Assert.Equal(50, top);
    }

    [Fact]
    public void ClampPullsTheWindowBackInsideTheWorkArea()
    {
        var (left, top) = WindowPlacement.ClampToWorkArea(WorkArea, 50, 20, new Size(750, 475));
        Assert.Equal(WorkArea.Left, left);
        Assert.Equal(WorkArea.Top, top);

        var (right, bottom) = WindowPlacement.ClampToWorkArea(WorkArea, 1700, 900, new Size(750, 475));
        Assert.Equal(WorkArea.Right - 750, right);
        Assert.Equal(WorkArea.Bottom - 475, bottom);
    }

    [Fact]
    public void ClampKeepsValidPositionsUntouched()
    {
        var (left, top) = WindowPlacement.ClampToWorkArea(WorkArea, 300, 200, new System.Windows.Size(750, 475));
        Assert.Equal(300, left);
        Assert.Equal(200, top);
    }
}
