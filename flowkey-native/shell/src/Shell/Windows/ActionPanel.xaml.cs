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

public partial class ActionPanel : Window
{
    private bool selfDismissed;
    private List<ActionRow> allRows = new();

    public UiAction? SelectedAction => (ActionsList.SelectedItem as ActionRow)?.Action;

    public event Action<UiAction>? Committed;

    public event Action? FocusLostToOtherApp;

    public ActionPanel()
    {
        InitializeComponent();
    }

    public void Open(IReadOnlyList<UiAction> actions, string title, double launcherRight, double launcherBottom, double footerHeight)
    {
        allRows = actions.Select(a => new ActionRow(a)).ToList();
        PanelTitle.Text = title;
        ActionsList.ItemsSource = allRows;
        if (allRows.Count > 0)
        {
            ActionsList.SelectedIndex = 0;
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

    private void OnFirstRendered(object? sender, EventArgs e)
    {
        ContentRendered -= OnFirstRendered;
        Left = launcherBounds.Right - ActualWidth - 14;
        Top = Math.Max(launcherBounds.Bottom - launcherBounds.Footer - 10 - ActualHeight, launcherBounds.Bottom - launcherBounds.Footer - ActualHeight);
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
            case Key.K:
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
        ActionsList.ItemsSource = query.Length == 0
            ? allRows
            : allRows.Where(r => r.Action.Title.Contains(query, StringComparison.OrdinalIgnoreCase)).ToList();
        if (ActionsList.Items.Count > 0)
        {
            ActionsList.SelectedIndex = 0;
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
        public ActionRow(UiAction action)
        {
            Action = action;
            Icon = LucideIcon.Load(ActionIconName(action.Id));
            IconBrush = (Brush)Application.Current.FindResource("TextPrimaryBrush");
            EnterKeycapVisibility = action.Primary == true ? Visibility.Visible : Visibility.Collapsed;
        }

        public UiAction Action { get; }
        public Geometry? Icon { get; }
        public Brush IconBrush { get; }
        public Visibility EnterKeycapVisibility { get; }

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
