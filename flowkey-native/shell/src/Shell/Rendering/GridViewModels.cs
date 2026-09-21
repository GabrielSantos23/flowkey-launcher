using System.Windows;
using System.Windows.Media;
using FlowKey.Shell.Protocol;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Color = System.Windows.Media.Color;

namespace FlowKey.Shell.Rendering;

public sealed class GridCellVm : DependencyObject
{
    public static readonly DependencyProperty SelectedProperty = DependencyProperty.Register(
        nameof(Selected), typeof(bool), typeof(GridCellVm), new PropertyMetadata(false, OnSelectedChanged));

    public static readonly DependencyProperty CellBackgroundProperty = DependencyProperty.Register(
        nameof(CellBackground), typeof(Brush), typeof(GridCellVm), new PropertyMetadata(Brushes.Transparent));

    public static readonly DependencyProperty BitmapProperty = DependencyProperty.Register(
        nameof(Bitmap), typeof(ImageSource), typeof(GridCellVm), new PropertyMetadata(null));

    public UiItem Item { get; init; } = new();
    public int FlatIndex { get; init; }

    public bool Selected
    {
        get => (bool)GetValue(SelectedProperty);
        set => SetValue(SelectedProperty, value);
    }

    public Brush CellBackground
    {
        get => (Brush)GetValue(CellBackgroundProperty);
        set => SetValue(CellBackgroundProperty, value);
    }

    public ImageSource? Bitmap
    {
        get => (ImageSource?)GetValue(BitmapProperty);
        set
        {
            SetValue(BitmapProperty, value);
            SetValue(BitmapFallbackProperty, value is null ? Visibility.Visible : Visibility.Collapsed);
        }
    }

    public static readonly DependencyProperty BitmapFallbackProperty = DependencyProperty.Register(
        nameof(BitmapFallback), typeof(Visibility), typeof(GridCellVm), new PropertyMetadata(Visibility.Visible));

    public Visibility BitmapFallback
    {
        get => (Visibility)GetValue(BitmapFallbackProperty);
        set => SetValue(BitmapFallbackProperty, value);
    }

    private static void OnSelectedChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var cell = (GridCellVm)d;
        cell.CellBackground = cell.Selected
            ? new SolidColorBrush(Color.FromRgb(0x2E, 0x3A, 0x50))
            : Brushes.Transparent;
    }
}

public sealed class GridRowVm
{
    public List<GridCellVm> Cells { get; init; } = new();
}
