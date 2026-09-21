using FlowKey.Shell.Rendering;
using Xunit;

namespace FlowKey.Shell.Tests;

public class GridMathTests
{
    private const int Columns = 8;

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(9, 1, 1)]
    [InlineData(1870, 233, 6)]
    public void RowAndColumnCompute(int flat, int row, int column)
    {
        Assert.Equal(row, GridMath.RowOf(flat, Columns));
        Assert.Equal(column, GridMath.ColumnOf(flat, Columns));
    }

    [Fact]
    public void LastPartialRowCountsCorrectly()
    {
        Assert.Equal(234, GridMath.RowCount(1870, Columns));
        Assert.Equal(6, GridMath.ItemsInRow(1870, Columns, 233));
        Assert.Equal(8, GridMath.ItemsInRow(1870, Columns, 0));
        Assert.Equal(0, GridMath.ItemsInRow(1870, Columns, 234));
    }

    [Fact]
    public void RightAtRowEndDoesNotWrap() => Assert.Equal(-1, GridMath.Move(7, 1870, Columns, 1, 0));

    [Fact]
    public void LeftAtRowStartDoesNotWrap() => Assert.Equal(-1, GridMath.Move(8, 1870, Columns, -1, 0));

    [Fact]
    public void DownAtEndStays()
    {
        var last = 1869;
        Assert.Equal(-1, GridMath.Move(last, 1870, Columns, 0, 1));
    }

    [Fact]
    public void DownSkipsMissingCellInLastRow()
    {
        var lastRowStart = 233 * Columns;
        var downFrom = lastRowStart + 7;
        Assert.Equal(-1, GridMath.Move(downFrom, 1870, Columns, 0, 1));
    }

    [Fact]
    public void UpFromLastRowClampsToExistingColumn()
    {
        var lastRowStart = 233 * Columns;
        var target = GridMath.Move(lastRowStart + 5, 1870, Columns, 0, -1);
        Assert.Equal(lastRowStart - Columns + 5, target);
    }

    [Fact]
    public void HorizontalAndVerticalMoves()
    {
        Assert.Equal(11, GridMath.Move(10, 1870, Columns, 1, 0));
        Assert.Equal(9, GridMath.Move(10, 1870, Columns, -1, 0));
        Assert.Equal(18, GridMath.Move(10, 1870, Columns, 0, 1));
        Assert.Equal(2, GridMath.Move(10, 1870, Columns, 0, -1));
    }

    [Fact]
    public void EmptyGridHasNoMoves() => Assert.Equal(-1, GridMath.Move(0, 0, Columns, 1, 0));
}
