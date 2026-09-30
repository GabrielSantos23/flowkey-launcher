using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Point = System.Windows.Point;
using Brush = System.Windows.Media.Brush;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using Application = System.Windows.Application;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Rendering;

namespace FlowKey.Shell.Windows;

/// <summary>Group header row inside the action palette. Top-level so XAML can resolve it.</summary>
public sealed class PanelHeaderRow
{
    public PanelHeaderRow(string title) => Title = title;

    public string Title { get; }
}

public partial class ActionPanel : Window
{
    private bool selfDismissed;
    private List<ActionRow> allRows = new();

    /// <summary>
    /// One palette entry, independent of where it came from: sidecar UiActions
    /// (native list/grid/detail rows) or a web page's reported viewState
    /// actions. <paramref name="IconName"/> is a Lucide name; when null the
    /// icon is derived from the action id. <paramref name="Group"/> renders a
    /// section header; <paramref name="Shortcut"/> renders keycap hints.
    /// </summary>
    public sealed record PanelAction(
        string Id,
        string Title,
        string? IconName = null,
        string? Style = null,
        bool Primary = false,
        string? Push = null,
        string? Group = null,
        UiShortcut? Shortcut = null);

    public PanelAction? SelectedAction => (ActionsList.SelectedItem as ActionRow)?.Action;

    public event Action<PanelAction>? Committed;

    public event Action? FocusLostToOtherApp;

    public ActionPanel()
    {
        InitializeComponent();
    }

    public void Open(IReadOnlyList<PanelAction> actions, string title, double launcherRight, double launcherBottom, double footerHeight)
    {
        allRows = actions.Select(a => new ActionRow(a)).ToList();
        PanelTitle.Text = title;
        ActionsList.ItemsSource = BuildDisplayRows(allRows);
        if (allRows.Count > 0)
        {
            ActionsList.SelectedIndex = FirstActionIndex();
        }
        FilterBox.Text = "";
        selfDismissed = false;
        launcherBounds = (launcherRight, launcherBottom, footerHeight);
        Left = launcherRight - Width - 14;
        Top = launcherBottom - footerHeight - 10 - 260;
        Show();
        FilterBox.Focus();
        ContentRendered += OnFirstRendered;
    }

    private (double Right, double Bottom, double Footer) launcherBounds;

    /// <summary>Action rows with regenerated group headers between them.</summary>
    private static List<object> BuildDisplayRows(IEnumerable<ActionRow> rows)
    {
        var result = new List<object>();
        string? lastGroup = null;
        foreach (var row in rows)
        {
            var group = row.Action.Group;
            if (!string.IsNullOrWhiteSpace(group) && group != lastGroup)
            {
                result.Add(new PanelHeaderRow(group));
                lastGroup = group;
            }
            else if (string.IsNullOrWhiteSpace(group))
            {
                lastGroup = null;
            }
            result.Add(row);
        }
        return result;
    }

    private int FirstActionIndex()
    {
        for (var i = 0; i < ActionsList.Items.Count; i++)
        {
            if (ActionsList.Items[i] is ActionRow)
            {
                return i;
            }
        }
        return -1;
    }

    private void OnFirstRendered(object? sender, EventArgs e)
    {
        ContentRendered -= OnFirstRendered;
        Left = launcherBounds.Right - ActualWidth - 14;
        Top = Math.Max(launcherBounds.Bottom - launcherBounds.Footer - 10 - ActualHeight, launcherBounds.Bottom - launcherBounds.Footer - ActualHeight);
        // Anchored off the launcher's bottom-right corner; near a screen edge
        // the panel must stay inside the monitor's work area.
        var monitor = Native.MonitorInfo.FromWindow(new System.Windows.Interop.WindowInteropHelper(this).Handle);
        if (monitor is { } info)
        {
            Left = Math.Max(info.WorkArea.Left, Math.Min(Left, info.WorkArea.Right - ActualWidth));
            Top = Math.Max(info.WorkArea.Top, Math.Min(Top, info.WorkArea.Bottom - ActualHeight));
        }
    }

    private void Close()
    {
        selfDismissed = true;
        Hide();
    }

    private void OnDeactivated(object sender, EventArgs e)
    {
        if (!selfDismissed)
        {
            FocusLostToOtherApp?.Invoke();
        }
        Hide();
    }

    private void OnPanelPreviewKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Up:
                MoveSelection(-1);
                e.Handled = true;
                break;
            case Key.Down:
                MoveSelection(1);
                e.Handled = true;
                break;
            case Key.Enter:
                Commit();
                e.Handled = true;
                break;
            case Key.Escape:
            case Key.K when Keyboard.Modifiers.HasFlag(ModifierKeys.Control):
                Close();
                e.Handled = true;
                break;
        }
    }

    private void MoveSelection(int delta)
    {
        if (ActionsList.Items.Count == 0)
        {
            return;
        }
        var index = ActionsList.SelectedIndex;
        do
        {
            index += delta;
            if (index < 0 || index >= ActionsList.Items.Count)
            {
                return;
            }
        }
        while (ActionsList.Items[index] is not ActionRow);
        ActionsList.SelectedIndex = index;
        ActionsList.ScrollIntoView(ActionsList.Items[index]);
    }

    private void OnFilterTextChanged(object sender, TextChangedEventArgs e)
    {
        if (allRows.Count == 0 && FilterBox.Text.Length == 0)
        {
            return;
        }
        var query = FilterBox.Text.Trim();
        var visible = query.Length == 0
            ? allRows
            : allRows.Where(r => r.Action.Title.Contains(query, StringComparison.OrdinalIgnoreCase)).ToList();
        ActionsList.ItemsSource = BuildDisplayRows(visible);
        var first = FirstActionIndex();
        if (first >= 0)
        {
            ActionsList.SelectedIndex = first;
        }
    }

    private void OnPreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource is System.Windows.DependencyObject element)
        {
            while (element is not null && element is not ListBoxItem)
            {
                element = System.Windows.Media.VisualTreeHelper.GetParent(element);
            }
            if (element is ListBoxItem listBoxItem)
            {
                ActionsList.SelectedItem = listBoxItem.Content;
                Commit();
                e.Handled = true;
            }
        }
    }

    private void OnDoubleClick(object sender, MouseButtonEventArgs e) => Commit();

    private void Commit()
    {
        if (ActionsList.SelectedItem is ActionRow row)
        {
            Committed?.Invoke(row.Action);
        }
        Close();
    }

    public sealed class ActionRow
    {
        public ActionRow(PanelAction action)
        {
            Action = action;
            Icon = string.IsNullOrWhiteSpace(action.IconName)
                ? LucideIcon.Load(ActionIconName(action.Id))
                : LucideIcon.Load(action.IconName);
            var destructive = string.Equals(action.Style, "destructive", StringComparison.Ordinal);
            var brushKey = destructive ? "DangerBrush" : "TextPrimaryBrush";
            IconBrush = (Brush)Application.Current.FindResource(brushKey);
            TitleBrush = IconBrush;
            EnterKeycapVisibility = action.Primary ? Visibility.Visible : Visibility.Collapsed;
            ShortcutChips = ShortcutChipsFor(action.Shortcut);
            ShortcutVisibility = ShortcutChips.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        public PanelAction Action { get; }
        public Geometry? Icon { get; }
        public Brush IconBrush { get; }
        public Brush TitleBrush { get; }
        public Visibility EnterKeycapVisibility { get; }
        public IReadOnlyList<string> ShortcutChips { get; }
        public Visibility ShortcutVisibility { get; }

        private static IReadOnlyList<string> ShortcutChipsFor(UiShortcut? shortcut)
        {
            if (shortcut is null || string.IsNullOrWhiteSpace(shortcut.Key))
            {
                return Array.Empty<string>();
            }
            var chips = new List<string>();
            foreach (var modifier in shortcut.Modifiers ?? new List<string>())
            {
                chips.Add(modifier switch
                {
                    "ctrl" or "cmd" => "Ctrl",
                    "alt" or "opt" => "Alt",
                    "shift" => "Shift",
                    "windows" => "Win",
                    _ => modifier,
                });
            }
            var key = shortcut.Key;
            chips.Add(key.Length == 1 ? key.ToUpperInvariant() : key switch
            {
                "return" or "enter" => "↵",
                "backspace" => "⌫",
                "delete" or "deleteForward" => "Del",
                "escape" => "Esc",
                "space" => "Space",
                "up" => "↑",
                "down" => "↓",
                "left" => "←",
                "right" => "→",
                "pageUp" => "PgUp",
                "pageDown" => "PgDn",
                _ => key,
            });
            return chips;
        }

        private static string ActionIconName(string actionId) => actionId switch
        {
            "paste" => "clipboard-paste",
            "copy" => "copy",
            "edit" => "pencil",
            "insert" => "clipboard",
            "delete" => "trash-2",
            "clearHistory" => "trash-2",
            "launch" => "external-link",
            "rerun" => "rotate-cw",
            _ => "rocket",
        };
    }
}
