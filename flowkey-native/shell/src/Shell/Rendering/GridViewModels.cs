using System.Windows;
using System.Windows.Media;
using FlowKey.Shell.Protocol;
using Application = System.Windows.Application;
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

    public static readonly DependencyProperty OutlineBrushProperty = DependencyProperty.Register(
        nameof(OutlineBrush), typeof(Brush), typeof(GridCellVm), new PropertyMetadata(Brushes.Transparent));

    public static readonly DependencyProperty OutlineThicknessProperty = DependencyProperty.Register(
        nameof(OutlineThickness), typeof(Thickness), typeof(GridCellVm), new PropertyMetadata(new Thickness(0)));

    public static readonly DependencyProperty CellSizeProperty = DependencyProperty.Register(
        nameof(CellSize), typeof(double), typeof(GridCellVm), new PropertyMetadata(62.0));

    public static readonly DependencyProperty GlyphSizeProperty = DependencyProperty.Register(
        nameof(GlyphSize), typeof(double), typeof(GridCellVm), new PropertyMetadata(26.0));

    public static readonly DependencyProperty IconSizeProperty = DependencyProperty.Register(
        nameof(IconSize), typeof(double), typeof(GridCellVm), new PropertyMetadata(34.0));

    public static readonly DependencyProperty BitmapProperty = DependencyProperty.Register(
        nameof(Bitmap), typeof(ImageSource), typeof(GridCellVm), new PropertyMetadata(null));

    public static readonly DependencyProperty TitleProperty = DependencyProperty.Register(
        nameof(Title), typeof(string), typeof(GridCellVm), new PropertyMetadata(string.Empty));

    public static readonly DependencyProperty SubtitleProperty = DependencyProperty.Register(
        nameof(Subtitle), typeof(string), typeof(GridCellVm), new PropertyMetadata(string.Empty));

    public static readonly DependencyProperty ImageDisplaySizeProperty = DependencyProperty.Register(
        nameof(ImageDisplaySize), typeof(double), typeof(GridCellVm), new PropertyMetadata(0d));

    public UiItem Item { get; init; } = new();

    public string Title
    {
        get => (string)GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public string Subtitle
    {
        get => (string)GetValue(SubtitleProperty);
        set => SetValue(SubtitleProperty, value);
    }

    public double ImageDisplaySize
    {
        get => (double)GetValue(ImageDisplaySizeProperty);
        set => SetValue(ImageDisplaySizeProperty, value);
    }
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

    public Brush OutlineBrush
    {
        get => (Brush)GetValue(OutlineBrushProperty);
        set => SetValue(OutlineBrushProperty, value);
    }

    public Thickness OutlineThickness
    {
        get => (Thickness)GetValue(OutlineThicknessProperty);
        set => SetValue(OutlineThicknessProperty, value);
    }

    public double CellSize
    {
        get => (double)GetValue(CellSizeProperty);
        set => SetValue(CellSizeProperty, value);
    }

    public double GlyphSize
    {
        get => (double)GetValue(GlyphSizeProperty);
        set => SetValue(GlyphSizeProperty, value);
    }

    public double IconSize
    {
        get => (double)GetValue(IconSizeProperty);
        set => SetValue(IconSizeProperty, value);
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
        var background = (Brush)Application.Current.FindResource("CellBackgroundBrush");
        var outline = (Brush)Application.Current.FindResource("CellSelectedOutlineBrush");
        cell.CellBackground = cell.Selected ? Lighten(background) : background;
        cell.OutlineBrush = outline;
        cell.OutlineThickness = cell.Selected ? new Thickness(2) : new Thickness(0);
    }

    private static Brush Lighten(Brush brush)
    {
        if (brush is SolidColorBrush solid)
        {
            var lighter = new SolidColorBrush(Color.FromRgb(
                (byte)Math.Min(255, solid.Color.R + 16),
                (byte)Math.Min(255, solid.Color.G + 16),
                (byte)Math.Min(255, solid.Color.B + 16)));
            lighter.Freeze();
            return lighter;
        }
        return brush;
    }
}

public sealed class GridRowVm
{
    public List<GridCellVm> Cells { get; init; } = new();
}
