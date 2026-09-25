namespace FlowKey.Shell.Rendering;

public static class GridMath
{
    public static int RowOf(int flatIndex, int columns) => flatIndex / columns;

    public static int ColumnOf(int flatIndex, int columns) => flatIndex % columns;

    public static int RowCount(int totalItems, int columns) =>
        totalItems == 0 ? 0 : (totalItems + columns - 1) / columns;

    public static int ItemsInRow(int totalItems, int columns, int row)
    {
        var fullRows = totalItems / columns;
        if (row < fullRows)
        {
            return columns;
        }
        return row == fullRows ? totalItems % columns : 0;
    }

    public static int Move(int from, int totalItems, int columns, int dx, int dy)
    {
        var column = ColumnOf(from, columns);
        var row = RowOf(from, columns);
        var targetColumn = column + dx;
        var targetRow = row + dy;
        if (dx != 0 && (targetColumn < 0 || targetColumn >= columns))
        {
            return -1;
        }
        if (targetRow < 0)
        {
            return -1;
        }
        var inRow = ItemsInRow(totalItems, columns, targetRow);
        if (inRow == 0)
        {
            return -1;
        }
        if (targetColumn >= inRow)
        {
            return -1;
        }
        var target = targetRow * columns + targetColumn;
        if (target < 0 || target >= totalItems)
        {
            return -1;
        }
        return target;
    }
}
