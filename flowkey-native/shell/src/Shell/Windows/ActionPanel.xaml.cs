using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Point = System.Windows.Point;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Windows;

public partial class ActionPanel : Window
{
    private bool selfDismissed;

    public UiAction? SelectedAction => (ActionsList.SelectedItem as ActionRow)?.Action;

    public event Action<UiAction>? Committed;

    public event Action? FocusLostToOtherApp;

    public ActionPanel()
    {
        InitializeComponent();
    }

    public void Open(IReadOnlyList<UiAction> actions, Point anchorScreenPoint)
    {
        ActionsList.ItemsSource = actions.Select(a => new ActionRow { Action = a }).ToList();
        ActionsList.SelectedIndex = 0;
        Left = anchorScreenPoint.X;
        Top = anchorScreenPoint.Y;
        selfDismissed = false;
        Show();
        ActionsList.Focus();
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

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Up:
                if (ActionsList.SelectedIndex > 0)
                {
                    ActionsList.SelectedIndex--;
                }
                e.Handled = true;
                break;
            case Key.Down:
                if (ActionsList.SelectedIndex < ActionsList.Items.Count - 1)
                {
                    ActionsList.SelectedIndex++;
                }
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

    private void OnPreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource is System.Windows.DependencyObject)
        {
            var element = e.OriginalSource as System.Windows.DependencyObject;
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
        public UiAction Action { get; init; } = new();

        public override string ToString() => Action.Title;
    }
}
