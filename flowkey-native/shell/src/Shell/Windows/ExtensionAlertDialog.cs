using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Button = System.Windows.Controls.Button;
using Orientation = System.Windows.Controls.Orientation;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Windows;

/// <summary>
/// Modal confirmation dialog behind `alert.confirm`. Shown as a blocking
/// native call: the shell completes the pending extension call with
/// `{ confirmed }` once the user answers.
/// </summary>
public sealed class ExtensionAlertDialog : Window
{
    public ExtensionAlertDialog(AlertRequest request)
    {
        Title = request.Title;
        Width = 420;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;

        var root = new StackPanel { Margin = new Thickness(20) };

        var title = new TextBlock
        {
            Text = request.Title,
            FontSize = 15,
            FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
        };
        title.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        root.Children.Add(title);

        if (!string.IsNullOrWhiteSpace(request.Message))
        {
            var message = new TextBlock
            {
                Text = request.Message,
                FontSize = 12,
                Margin = new Thickness(0, 8, 0, 0),
                TextWrapping = TextWrapping.Wrap,
            };
            message.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
            root.Children.Add(message);
        }

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Margin = new Thickness(0, 16, 0, 0),
        };
        var cancel = new Button { Content = request.CancelTitle, MinWidth = 88, Margin = new Thickness(0, 0, 8, 0), IsCancel = true };
        var confirm = new Button
        {
            Content = request.ConfirmTitle,
            MinWidth = 88,
            IsDefault = true,
        };
        confirm.SetResourceReference(
            Button.BackgroundProperty,
            request.Destructive ? "DangerBrush" : "AccentBrush");
        confirm.Click += (_, _) => DialogResult = true;
        buttons.Children.Add(cancel);
        buttons.Children.Add(confirm);
        root.Children.Add(buttons);

        Content = root;
    }
}
