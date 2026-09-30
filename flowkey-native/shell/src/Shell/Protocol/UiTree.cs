using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlowKey.Shell.Protocol;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(ListTree), "list")]
[JsonDerivedType(typeof(DetailTree), "detail")]
[JsonDerivedType(typeof(GridTree), "grid")]
[JsonDerivedType(typeof(FormTree), "form")]
public abstract class UiTree
{
}

public sealed class ListTree : UiTree
{
    public string? Layout { get; set; }
    public UiFilter? Filter { get; set; }
    public List<UiSection> Sections { get; set; } = [];
    public UiEmptyView? EmptyView { get; set; }
    /// <summary>Keeps the shell's loading indicator active after the tree arrives.</summary>
    public bool? IsLoading { get; set; }
    /// <summary>Placeholder text for the search bar while this tree is shown.</summary>
    public string? SearchBarPlaceholder { get; set; }
    /// <summary>Server-side pagination affordance; null when the list has no more pages.</summary>
    public UiPagination? Pagination { get; set; }
}

public sealed class UiPagination
{
    public bool HasNextPage { get; set; }
    /// <summary>Registry action id the shell invokes to load the next page.</summary>
    public string MoreActionId { get; set; } = "";
    public int? PageSize { get; set; }
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
    /// <summary>Grouped items with optional headers; when present, Items is ignored.</summary>
    public List<UiSection>? Sections { get; set; }
    public UiFilter? Filter { get; set; }
    public UiEmptyView? EmptyView { get; set; }
    public bool? IsLoading { get; set; }
    public string? SearchBarPlaceholder { get; set; }
}

public sealed class UiSection
{
    public string? Title { get; set; }
    public string? Subtitle { get; set; }
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
    public string? IconSvg { get; set; }
    /// <summary>Extra search terms matched by the shell's filter.</summary>
    public List<string>? Keywords { get; set; }
    /// <summary>Trailing chips shown at the end of a list row.</summary>
    public List<UiAccessory>? Accessories { get; set; }
    public UiPane? Pane { get; set; }
    public List<UiAction>? Actions { get; set; } = [];
}

public sealed class UiAccessory
{
    public string Text { get; set; } = "";
    public string? Tooltip { get; set; }
    /// <summary>Semantic tint: success, danger, accent or secondary (default).</summary>
    public string? Color { get; set; }
}

public sealed class UiShortcut
{
    public string Key { get; set; } = "";
    public List<string>? Modifiers { get; set; }
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
    /// <summary>`destructive` tints the action row in the action panel.</summary>
    public string? Style { get; set; }
    /// <summary>Groups actions into labeled sections in the action panel.</summary>
    public string? Group { get; set; }
    /// <summary>Live keyboard shortcut; runs the action from the focused view.</summary>
    public UiShortcut? Shortcut { get; set; }
}

public sealed class UiEmptyView
{
    public string Title { get; set; } = "";
    public string? Description { get; set; }
}

public sealed class FormTree : UiTree
{
    public string Title { get; set; } = "";
    public List<FormField> Fields { get; set; } = [];
    public List<UiAction> Actions { get; set; } = [];
    /// <summary>Registry action id of the form's submit handler; the shell sends `formValues` with it.</summary>
    public string? SubmitActionId { get; set; }
}

public sealed class FormField
{
    public string Id { get; set; } = "";
    /// <summary>textfield | password | textarea | checkbox | dropdown | datepicker | tagpicker | filepicker | description | separator</summary>
    public string Kind { get; set; } = "textfield";
    public string? Label { get; set; }
    public string? Placeholder { get; set; }
    public JsonElement? Default { get; set; }
    public bool? Required { get; set; }
    public List<PreferenceOption>? Options { get; set; }
    public List<string>? Defaults { get; set; }
    public bool? CanChooseFiles { get; set; }
    public bool? CanChooseDirectories { get; set; }
    public bool? AllowMultipleSelection { get; set; }
}

public sealed class UiField
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
    /// <summary>`link` fields open Href in the user's browser.</summary>
    public string? Href { get; set; }
    /// <summary>`tags` fields render a chip list instead of plain text.</summary>
    public List<string>? Tags { get; set; }
    /// <summary>Field variant; defaults to a plain key/value row.</summary>
    public string? Kind { get; set; }
}
