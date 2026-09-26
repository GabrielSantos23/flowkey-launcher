using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Button = System.Windows.Controls.Button;
using Orientation = System.Windows.Controls.Orientation;

namespace FlowKey.Shell.Windows;

/// <summary>
/// Modal consent dialog shown before a third-party extension is installed or
/// re-accepted. Lists every capability the extension declares; installing or
/// accepting stores that exact capability set as the extension's consent
/// record, which is what the shell then enforces.
/// </summary>
public sealed class ConsentDialog : Window
{
    public bool Accepted { get; private set; }

    public ConsentDialog(
        string extensionName,
        string version,
        string? description,
        IReadOnlyList<string> nativeMethods,
        IReadOnlyList<string> httpHosts,
        IReadOnlyList<string> oauthProviders,
        bool isReconsent)
    {
        Title = isReconsent ? "Review extension permissions" : "Install extension";
        Width = 460;
        MinHeight = 320;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;

        var root = new StackPanel { Margin = new Thickness(20) };

        root.Children.Add(new TextBlock
        {
            Text = isReconsent
                ? $"“{extensionName}” requests the following capabilities"
                : $"“{extensionName}” (version {version}) requests the following capabilities",
            FontSize = 15,
            FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
        });
        if (!isReconsent && !string.IsNullOrWhiteSpace(description))
        {
            root.Children.Add(new TextBlock
            {
                Text = description,
                FontSize = 12,
                Foreground = GetBrush("TextSecondaryBrush", System.Windows.Media.Brushes.Gray),
                Margin = new Thickness(0, 6, 0, 0),
                TextWrapping = TextWrapping.Wrap,
            });
        }
        root.Children.Add(new TextBlock
        {
            Text = "Only install extensions from authors you trust. Declared capabilities are enforced by FlowKey after you accept.",
            FontSize = 12,
            Foreground = GetBrush("TextSecondaryBrush", System.Windows.Media.Brushes.Gray),
            Margin = new Thickness(0, 8, 0, 0),
            TextWrapping = TextWrapping.Wrap,
        });

        AddCapabilitySection(root, "Native methods", nativeMethods, "none");
        AddCapabilitySection(root, "Network hosts", httpHosts, "none");
        AddCapabilitySection(root, "Connected accounts (OAuth)", oauthProviders, "none");

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Margin = new Thickness(0, 16, 0, 0),
        };
        var cancel = new Button { Content = "Cancel", MinWidth = 88, Margin = new Thickness(0, 0, 8, 0), IsCancel = true };
        var accept = new Button
        {
            Content = isReconsent ? "Accept" : "Install",
            MinWidth = 88,
            IsDefault = true,
            Background = GetBrush("AccentBrush", System.Windows.SystemColors.HighlightBrush),
        };
        accept.Click += (_, _) =>
        {
            Accepted = true;
            DialogResult = true;
        };
        buttons.Children.Add(cancel);
        buttons.Children.Add(accept);
        root.Children.Add(buttons);

        Content = root;
    }

    /// <summary>Shows the dialog modally; returns true when the user accepted.</summary>
    public static bool Confirm(Window? owner, string extensionName, string version, string? description,
        IReadOnlyList<string> nativeMethods, IReadOnlyList<string> httpHosts, IReadOnlyList<string> oauthProviders,
        bool isReconsent = false)
    {
        var dialog = new ConsentDialog(extensionName, version, description, nativeMethods, httpHosts, oauthProviders, isReconsent);
        if (owner is not null)
        {
            dialog.Owner = owner;
        }
        dialog.ShowDialog();
        return dialog.Accepted;
    }

    private void AddCapabilitySection(StackPanel root, string title, IReadOnlyList<string> values, string emptyText)
    {
        root.Children.Add(new TextBlock
        {
            Text = title,
            FontSize = 13,
            FontWeight = FontWeights.Medium,
            Margin = new Thickness(0, 12, 0, 2),
        });
        if (values.Count == 0)
        {
            root.Children.Add(new TextBlock
            {
                Text = emptyText,
                FontSize = 12,
                Foreground = GetBrush("TextSecondaryBrush", System.Windows.Media.Brushes.Gray),
                Margin = new Thickness(10, 0, 0, 0),
            });
            return;
        }
        var list = new StackPanel { Margin = new Thickness(10, 0, 0, 0) };
        foreach (var value in values)
        {
            list.Children.Add(new TextBlock
            {
                Text = "• " + value,
                FontSize = 12,
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        }
        root.Children.Add(list);
    }

    private static System.Windows.Media.Brush GetBrush(string key, System.Windows.Media.Brush fallback)
    {
        return System.Windows.Application.Current?.TryFindResource(key) as System.Windows.Media.Brush ?? fallback;
    }
}
