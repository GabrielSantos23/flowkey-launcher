using System.Text.Json.Serialization;

namespace FlowKey.Shell.Protocol;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(ListTree), "list")]
[JsonDerivedType(typeof(DetailTree), "detail")]
[JsonDerivedType(typeof(GridTree), "grid")]
public abstract class UiTree
{
}

public sealed class ListTree : UiTree
{
    public string? Layout { get; set; }
    public UiFilter? Filter { get; set; }
    public List<UiSection> Sections { get; set; } = [];
    public UiEmptyView? EmptyView { get; set; }
}

public sealed class UiFilter
{
    public List<UiFilterOption> Options { get; set; } = [];
}

public sealed class UiFilterOption
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}

public sealed class DetailTree : UiTree
{
    public string Title { get; set; } = "";
    public bool? MediaKeys { get; set; }
    public string? Subtitle { get; set; }
    public string? ImageUri { get; set; }
    public List<UiField> Fields { get; set; } = [];
    public string? Description { get; set; }
    public List<UiAction> Actions { get; set; } = [];
}

public sealed class GridTree : UiTree
{
    public string? Title { get; set; }
    public int Columns { get; set; }
    public List<UiItem> Items { get; set; } = [];
    public UiEmptyView? EmptyView { get; set; }
}

public sealed class UiSection
{
    public string? Title { get; set; }
    public List<UiItem> Items { get; set; } = [];
}

public sealed class UiItem
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Subtitle { get; set; }
    public string? Kind { get; set; }
    public string? Icon { get; set; }
    public string? IconName { get; set; }
    public string? IconColor { get; set; }
    public string? IconUri { get; set; }
    public UiPane? Pane { get; set; }
    public List<UiAction>? Actions { get; set; } = [];
}

public sealed class UiPane
{
    public string? Title { get; set; }
    public string? Preview { get; set; }
    public string? PreviewImageUri { get; set; }
    public List<UiPaneField>? Fields { get; set; }
}

public sealed class UiPaneField
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
    public string? ValueIconUri { get; set; }
}

public sealed class UiAction
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public bool? Primary { get; set; }
    public string? Push { get; set; }
}

public sealed class UiEmptyView
{
    public string Title { get; set; } = "";
    public string? Description { get; set; }
}

public sealed class UiField
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}
