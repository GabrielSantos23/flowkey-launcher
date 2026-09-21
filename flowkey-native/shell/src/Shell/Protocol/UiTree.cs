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
    public List<UiSection> Sections { get; set; } = [];
    public UiEmptyView? EmptyView { get; set; }
}

public sealed class DetailTree : UiTree
{
    public string Title { get; set; } = "";
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
    public string? IconUri { get; set; }
    public List<UiAction>? Actions { get; set; } = [];
}

public sealed class UiAction
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public bool? Primary { get; set; }
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
