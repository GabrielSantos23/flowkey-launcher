using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using Brush = System.Windows.Media.Brush;
using Button = System.Windows.Controls.Button;
using CheckBox = System.Windows.Controls.CheckBox;
using RadioButton = System.Windows.Controls.RadioButton;
using Orientation = System.Windows.Controls.Orientation;
using ComboBox = System.Windows.Controls.ComboBox;
using ComboBoxItem = System.Windows.Controls.ComboBoxItem;
using PasswordBox = System.Windows.Controls.PasswordBox;
using TextBox = System.Windows.Controls.TextBox;
using Cursors = System.Windows.Input.Cursors;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Windows;

public partial class SettingsWindow : Window
{
    public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;

    private const uint DefaultModifier = HotkeyManager.MOD_ALT | HotkeyManager.MOD_CONTROL;
    private const uint DefaultVirtualKey = 0x20;

    private readonly HotkeyManager hotkeyManager;
    private readonly HotkeySettingsStore hotkeySettings;
    private readonly PreferencesStore preferencesStore;
    private readonly IReadOnlyList<ReadyExtension> extensions;
    private readonly OAuthService oauthService;
    private readonly Action clearClipboardHistory;
    private readonly Action<string> showToast;
    private readonly Func<uint, uint, bool> applySummonHotkey;

    private sealed record NavEntry(string Key, string Label, string? Glyph);

    private readonly List<string> navigationHistory = [];
    private int navigationIndex = -1;
    private bool suppressNavigation;
    private readonly Dictionary<string, RadioButton> navButtons = new(StringComparer.Ordinal);

    public bool CanNavigateBack => navigationIndex > 0;
    public bool CanNavigateForward => navigationIndex >= 0 && navigationIndex < navigationHistory.Count - 1;

    private void NavigateTo(string key)
    {
        if (suppressNavigation)
        {
            return;
        }
        if (navigationIndex >= 0 && navigationIndex < navigationHistory.Count && navigationHistory[navigationIndex] == key)
        {
            return;
        }
        while (navigationHistory.Count > navigationIndex + 1)
        {
            navigationHistory.RemoveAt(navigationHistory.Count - 1);
        }
        navigationHistory.Add(key);
        navigationIndex = navigationHistory.Count - 1;
        RenderPage(key);
        SyncNavSelection(key);
        RefreshChromeNavState();
    }

    private void SyncNavSelection(string key)
    {
        if (!navButtons.TryGetValue(key, out var button) || button.IsChecked == true)
        {
            return;
        }
        suppressNavigation = true;
        button.IsChecked = true;
        suppressNavigation = false;
    }

    private void RefreshChromeNavState()
    {
        PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(CanNavigateBack)));
        PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(CanNavigateForward)));
    }

    private void GoBack()
    {
        if (navigationIndex <= 0)
        {
            return;
        }
        navigationIndex--;
        suppressNavigation = true;
        RenderPage(navigationHistory[navigationIndex]);
        suppressNavigation = false;
        SyncNavSelection(navigationHistory[navigationIndex]);
        RefreshChromeNavState();
    }

    private void GoForward()
    {
        if (navigationIndex >= navigationHistory.Count - 1)
        {
            return;
        }
        navigationIndex++;
        suppressNavigation = true;
        RenderPage(navigationHistory[navigationIndex]);
        suppressNavigation = false;
        SyncNavSelection(navigationHistory[navigationIndex]);
        RefreshChromeNavState();
    }

    public SettingsWindow(
        HotkeyManager hotkeyManager,
        HotkeySettingsStore hotkeySettings,
        PreferencesStore preferencesStore,
        IReadOnlyList<ReadyExtension> extensions,
        OAuthService oauthService,
        Action clearClipboardHistory,
        Action<string> showToast,
        Func<uint, uint, bool> applySummonHotkey)
    {
        InitializeComponent();
        this.hotkeyManager = hotkeyManager;
        this.hotkeySettings = hotkeySettings;
        this.preferencesStore = preferencesStore;
        this.extensions = extensions;
        this.oauthService = oauthService;
        this.clearClipboardHistory = clearClipboardHistory;
        this.showToast = showToast;
        this.applySummonHotkey = applySummonHotkey;

        SourceInitialized += (_, _) => DwmChrome.Apply(System.Windows.Interop.HwndSource.FromHwnd(new System.Windows.Interop.WindowInteropHelper(this).Handle));

        EmojiSpriteRenderer.EnsureSprites(extensions
            .Select(extension => extension.Icon)
            .Where(icon => !string.IsNullOrEmpty(icon))
            .Cast<string>());
        BuildNavigation();
        NavigateTo("general");
    }

    private void BuildNavigation()
    {
        AddNavEntry(new NavEntry("general", "General", "\uE713"), true);
        AddNavEntry(new NavEntry("shortcuts", "Shortcuts", "\uE765"), false);
        AddNavEntry(new NavEntry("extensions", "Extensions", "\uE71D"), false);
        foreach (var extension in extensions)
        {
            AddNavEntry(new NavEntry("ext:" + extension.Id, extension.Name, extension.Icon), false, topGap: extension == extensions[0], brand: extension);
        }
        AddNavEntry(new NavEntry("about", "About", "\uE946"), false, topGap: true);
    }

    private void AddNavEntry(NavEntry entry, bool isChecked, bool topGap = false, ReadyExtension? brand = null)
    {
        var button = new RadioButton
        {
            GroupName = "SettingsNav",
            IsChecked = isChecked,
            Tag = entry.Key,
            Style = FindResource("SettingsNavButton") as Style,
            Content = BuildNavLabel(entry.Label, entry.Glyph, brand),
            Margin = new Thickness(0, topGap ? (double)FindResource("NavGroupGap") : 0, 0, (double)FindResource("NavRowSpacing")),
        };
        button.Checked += (_, _) =>
        {
            navButtons[entry.Key] = button;
            NavigateTo(entry.Key);
        };
        NavPanel.Children.Add(button);
    }

    private FrameworkElement BuildNavGlyph(string? glyph)
    {
        if (string.IsNullOrEmpty(glyph))
        {
            return new TextBlock { Width = (double)FindResource("SettingsNavIconSize") };
        }
        if (glyph.Length == 1 && glyph[0] >= 0xE000 && glyph[0] <= 0xF8FF)
        {
            // Core nav entries render as a rounded tile outline with the glyph centered,
            // matching the reference sidebar's icon treatment.
            return new Border
            {
                Width = (double)FindResource("SettingsNavIconSize"),
                Height = (double)FindResource("SettingsNavIconSize"),
                CornerRadius = (System.Windows.CornerRadius)FindResource("SettingsNavTileCornerRadius"),
                BorderBrush = (Brush)FindResource("SettingsNavTileStrokeBrush"),
                BorderThickness = new Thickness(1),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = glyph,
                    FontFamily = FindResource("GlyphFontFamily") as System.Windows.Media.FontFamily,
                    FontSize = (double)FindResource("SettingsNavGlyphSize"),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
        }
        if (EmojiSpriteRenderer.IsCached(glyph))
        {
            try
            {
                var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                bitmap.DecodePixelWidth = 32;
                bitmap.UriSource = new Uri(EmojiSpriteRenderer.CachePathFor(glyph));
                bitmap.EndInit();
                bitmap.Freeze();
                return new System.Windows.Controls.Image
                {
                    Source = bitmap,
                    Width = (double)FindResource("SettingsNavIconSize"),
                    Height = (double)FindResource("SettingsNavIconSize"),
                    VerticalAlignment = VerticalAlignment.Center,
                };
            }
            catch
            {
                /* fall through to plain text */
            }
        }
        return new TextBlock
        {
            Text = glyph,
            FontSize = 14,
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    private StackPanel BuildNavLabel(string label, string? glyph, ReadyExtension? brand = null)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        var glyphElement = brand is not null
            ? BuildBrandMark(brand, (double)FindResource("SettingsNavIconSize"))
            : BuildNavGlyph(glyph);
        glyphElement.Margin = new Thickness(0, 0, (double)FindResource("NavIconGap"), 0);
        panel.Children.Add(glyphElement);
        panel.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
        return panel;
    }

    private void RenderPage(string key)
    {
        PageHost.Content = key switch
        {
            "general" => BuildGeneralPage(),
            "shortcuts" => BuildShortcutsPage(),
            "extensions" => BuildExtensionsPage(),
            "about" => BuildAboutPage(),
            _ when key.StartsWith("ext:", StringComparison.Ordinal) => BuildExtensionDetailPage(key[4..]),
            _ => BuildGeneralPage(),
        };
    }

    private TextBlock SectionTitle(string text)
    {
        return new TextBlock
        {
            Text = text,
            FontSize = 14,
            FontWeight = FontWeights.Medium,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            Margin = new Thickness(0, 20, 0, 4),
        };
    }

    private Border SettingsRow(string? title, string? description, FrameworkElement? control)
    {
        var titleText = new TextBlock
        {
            Text = title,
            FontSize = 13,
            FontWeight = FontWeights.Medium,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var left = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        if (title is not null)
        {
            left.Children.Add(titleText);
        }
        if (!string.IsNullOrEmpty(description))
        {
            left.Children.Add(new TextBlock
            {
                Text = description,
                FontSize = 12,
                Foreground = FindResource("TextTertiaryBrush") as Brush,
                Margin = new Thickness(0, 2, 0, 0),
            });
        }
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(left, 0);
        grid.Children.Add(left);
        if (control is not null)
        {
            control.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(control, 1);
            grid.Children.Add(control);
        }
        return new Border
        {
            Style = FindResource("SettingsRow") as Style,
            Child = grid,
        };
    }

    private FrameworkElement BuildGeneralPage()
    {
        var page = new StackPanel();

        var loginToggle = new Wpf.Ui.Controls.ToggleSwitch
        {
            Background = FindResource("AccentBrush") as System.Windows.Media.Brush,
            IsChecked = LoginLauncher.IsEnabled(),
            Tag = string.Empty,
        };
        loginToggle.Checked += OnLaunchAtLoginChanged;
        loginToggle.Unchecked += OnLaunchAtLoginChanged;
        page.Children.Add(SettingsRow("Open at Login", "Start FlowKey when you log in", loginToggle));

        var trayToggle = new Wpf.Ui.Controls.ToggleSwitch { Background = FindResource("AccentBrush") as System.Windows.Media.Brush, IsEnabled = false, Tag = string.Empty };
        trayToggle.ToolTip = "Not available yet";
        page.Children.Add(SettingsRow("Show in System Tray", "Keep FlowKey in the system tray", trayToggle));

        page.Children.Add(SectionTitle("Launcher"));
        page.Children.Add(BuildHotkeyRow());

        page.Children.Add(SectionTitle("Maintenance"));
        var clearButton = new Button { Content = "Clear clipboard history" };
        clearButton.Click += OnClearClipboardHistory;
        page.Children.Add(SettingsRow("Clipboard History", "Erase every stored clipboard entry", clearButton));

        return page;
    }

    private TextBlock hotkeyHint = new();

    private FrameworkElement BuildHotkeyRow()
    {
        var left = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        left.Children.Add(new TextBlock
        {
            Text = "FlowKey Hotkey",
            FontSize = 14,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
        });
        hotkeyHint = new TextBlock
        {
            Text = "Click the field and press a combination. Escape cancels.",
            FontSize = 12,
            Foreground = FindResource("TextSecondaryBrush") as Brush,
            Margin = new Thickness(0, 2, 0, 0),
            TextWrapping = TextWrapping.Wrap,
        };
        left.Children.Add(hotkeyHint);

        var right = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var box = new TextBox
        {
            Style = FindResource("RecorderBox") as Style,
            Text = Describe(hotkeySettings.Load().Modifier, hotkeySettings.Load().VirtualKey),
        };
        box.PreviewKeyDown += OnHotkeyPreviewKeyDown;
        box.GotKeyboardFocus += OnHotkeyGotFocus;
        box.LostKeyboardFocus += OnHotkeyLostFocus;
        right.Children.Add(box);

        var resetButton = new Button
        {
            Content = new TextBlock
            {
                Text = "\uE72C",
                FontFamily = FindResource("GlyphFontFamily") as System.Windows.Media.FontFamily,
                FontSize = 12,
            },
            Padding = new Thickness(6, 4, 6, 4),
            Margin = new Thickness(8, 0, 0, 0),
            ToolTip = "Reset to Ctrl+Alt+Space",
        };
        resetButton.Click += (_, _) =>
        {
            if (!applySummonHotkey(DefaultModifier, DefaultVirtualKey))
            {
                showToast("The default hotkey is already registered by another app");
                return;
            }
            var settings = hotkeySettings.Load();
            settings.Modifier = DefaultModifier;
            settings.VirtualKey = DefaultVirtualKey;
            hotkeySettings.Save(settings);
            box.Text = Describe(DefaultModifier, DefaultVirtualKey);
            showToast("Hotkey reset to Ctrl+Alt+Space");
        };
        right.Children.Add(resetButton);

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(left, 0);
        Grid.SetColumn(right, 1);
        grid.Children.Add(left);
        grid.Children.Add(right);
        return new Border
        {
            Style = FindResource("SettingsRow") as Style,
            Child = grid,
        };
    }

    private FrameworkElement BuildShortcutsPage()
    {
        var page = new StackPanel();
        page.Children.Add(new TextBlock
        {
            Text = "Per-command global shortcuts. Click a field and press a combination (Ctrl, Alt or Win required).",
            FontSize = 12,
            Foreground = FindResource("TextSecondaryBrush") as Brush,
            Margin = new Thickness(0, 0, 0, 10),
        });
        var rows = new StackPanel();
        RefreshCommandShortcuts?.Invoke();
        var settings = hotkeySettings.Load();
        var bound = new HashSet<string>(StringComparer.Ordinal);
        foreach (var extension in extensions)
        {
            foreach (var command in extension.Commands)
            {
                var key = extension.Id + ":" + command.Id;
                settings.CommandShortcuts.TryGetValue(key, out var stored);
                AddShortcutRow(rows, command.Title, stored, key);
                bound.Add(key);
            }
        }
        foreach (var key in settings.CommandShortcuts.Keys)
        {
            if (!bound.Contains(key))
            {
                AddShortcutRow(rows, key + " (orphan — command no longer exists)", settings.CommandShortcuts[key], key);
            }
        }
        page.Children.Add(rows);
        return page;
    }

    private FrameworkElement BuildExtensionsPage()
    {
        var page = new StackPanel();
        page.Children.Add(new TextBlock
        {
            Text = "Installed extensions and their preferences.",
            FontSize = 12,
            Foreground = FindResource("TextSecondaryBrush") as Brush,
            Margin = new Thickness(0, 0, 0, 10),
        });
        BuildExtensionForms(page);
        return page;
    }

    private FrameworkElement BuildAboutPage()
    {
        var page = new StackPanel();
        page.Children.Add(SettingsRow("FlowKey", "Native Windows launcher", null));
        page.Children.Add(SettingsRow("Extensions loaded", extensions.Count.ToString(), null));
        return page;
    }

    private FrameworkElement BuildExtensionDetailPage(string extensionId)
    {
        var extension = extensions.FirstOrDefault(e => e.Id == extensionId);
        var page = new StackPanel();
        if (extension is null)
        {
            return page;
        }

        page.Children.Add(BuildExtensionHeader(extension));

        foreach (var provider in extension.OAuth ?? new List<string>())
        {
            page.Children.Add(BuildOAuthRow(extension, provider));
        }

        page.Children.Add(SettingsRow(
            "Close window on action",
            "If enabled, the FlowKey window will be closed after performing an action",
            new Wpf.Ui.Controls.ToggleSwitch { Background = FindResource("AccentBrush") as System.Windows.Media.Brush, IsEnabled = false, Tag = string.Empty, ToolTip = "Not available yet" }));

        if ((extension.Preferences?.Count ?? 0) > 0)
        {
                page.Children.Add(SectionTitle("Preferences"));
            var form = new StackPanel();
            BuildExtensionForm(form, extension);
            foreach (var child in form.Children.Cast<UIElement>().ToList())
            {
                form.Children.Remove(child);
                page.Children.Add(child);
            }
        }

        if (extension.Commands.Count > 0)
        {
                page.Children.Add(SectionTitle("Commands"));
            var settings = hotkeySettings.Load();
            foreach (var command in extension.Commands)
            {
                var key = extension.Id + ":" + command.Id;
                settings.CommandShortcuts.TryGetValue(key, out var stored);
                page.Children.Add(BuildCommandRow(extension, command, key, stored));
            }
        }

        return page;
    }

    private FrameworkElement BuildExtensionHeader(ReadyExtension extension)
    {
        var panel = new StackPanel { Margin = new Thickness(0, 4, 0, 14) };
        var icon = BuildBrandMark(extension);
        icon.HorizontalAlignment = HorizontalAlignment.Center;
        var tile = new Border
        {
            Width = 52,
            Height = 52,
            CornerRadius = (System.Windows.CornerRadius)FindResource("IconTileCornerRadius"),
            Background = FindResource("CellBackgroundBrush") as Brush,
            Child = icon,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 10),
        };
        panel.Children.Add(tile);
        panel.Children.Add(new TextBlock
        {
            Text = extension.Name,
            FontSize = 24,
            FontWeight = FontWeights.SemiBold,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        var description = extension.Description;
        if (!string.IsNullOrEmpty(description))
        {
            var descriptionText = new TextBlock
            {
                Text = description.Length > 96 ? description[..93] + "\u2026" : description,
                FontSize = 13,
                Foreground = FindResource("TextSecondaryBrush") as Brush,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 560,
                Margin = new Thickness(0, 6, 0, 0),
            };
            panel.Children.Add(descriptionText);
            if (description.Length > 96)
            {
                var expanded = false;
                var toggle = new TextBlock
                {
                    Text = "Show More",
                    FontSize = 12,
                    FontWeight = FontWeights.Medium,
                    Foreground = FindResource("TextSecondaryBrush") as Brush,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 8, 0, 0),
                    Cursor = Cursors.Hand,
                };
                toggle.MouseLeftButtonDown += (_, _) =>
                {
                    expanded = !expanded;
                    descriptionText.Text = expanded ? description : description[..93] + "\u2026";
                    toggle.Text = expanded ? "Show Less" : "Show More";
                };
                panel.Children.Add(toggle);
            }
        }
        panel.Children.Add(new TextBlock
        {
            Text = "v" + extension.Version,
            FontSize = 12,
            Foreground = FindResource("TextTertiaryBrush") as Brush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 3, 0, 0),
        });
        return panel;
    }

    private FrameworkElement BuildBrandMark(ReadyExtension extension, double size = 34)
    {
        try
        {
            var geometry = Rendering.LucideIcon.Load("brand-" + extension.Id);
            if (geometry is not null)
            {
                var resource = System.Windows.Application.GetResourceStream(new Uri("pack://application:,,,/Assets/Icons/brand-" + extension.Id + ".svg"));
                using var reader = new System.IO.StreamReader(resource.Stream);
                var document = System.Xml.Linq.XDocument.Load(reader);
                var fill = (string?)document.Descendants()
                    .FirstOrDefault(element => element.Attribute("fill") is not null)
                    ?.Attribute("fill");
                var path = new System.Windows.Shapes.Path
                {
                    Data = geometry,
                    Fill = fill is not null && fill.StartsWith("#", StringComparison.Ordinal)
                        ? Rendering.LucideIcon.ColorFromHex(fill, FindResource("AccentBrush") as Brush)
                        : FindResource("AccentBrush") as Brush,
                    Stretch = Stretch.Uniform,
                };
                return new Viewbox { Width = size, Height = size, Child = path };
            }
        }
        catch
        {
            /* fall through to the bitmap mark, then the generic mark */
        }
        if (Rendering.BrandIcons.TryGetBitmap(extension.Id, out var brandBitmap))
        {
            return new System.Windows.Controls.Image
            {
                Source = brandBitmap,
                Width = size,
                Height = size,
                Stretch = Stretch.Uniform,
            };
        }
        return BuildExtensionMark(extension, size);
    }

    private FrameworkElement BuildOAuthRow(ReadyExtension extension, string provider)
    {
        var statusText = new TextBlock
        {
            Text = "Checking " + provider + " connection…",
            VerticalAlignment = VerticalAlignment.Center,
        };
        statusText.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        statusText.SetResourceReference(TextBlock.FontSizeProperty, "SecondaryFontSize");
        statusText.SetResourceReference(TextBlock.FontWeightProperty, "Medium");
        var statusText2 = new TextBlock
        {
            Text = string.Empty,
            FontSize = 12,
            Foreground = FindResource("TextTertiaryBrush") as Brush,
            Margin = new Thickness(0, 2, 0, 0),
            TextWrapping = TextWrapping.Wrap,
        };
        var statusStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        statusStack.Children.Add(statusText);
        statusStack.Children.Add(statusText2);

        var providerLabel = char.ToUpperInvariant(provider[0]) + provider[1..];
        var connectButton = new Button { Content = "Logout", IsEnabled = false };
        var parameters = new Dictionary<string, System.Text.Json.JsonElement>
        {
            ["provider"] = System.Text.Json.JsonSerializer.SerializeToElement(provider),
        };
        if (extension.Preferences is not null)
        {
            var current = preferencesStore.Slice(extension.Id, extension.Preferences);
            foreach (var pref in extension.Preferences)
            {
                if (pref.Name.Contains("ClientId", StringComparison.OrdinalIgnoreCase)
                    && current.TryGetValue(pref.Name, out var stored)
                    && stored.ValueKind == System.Text.Json.JsonValueKind.String
                    && stored.GetString() is { Length: > 0 })
                {
                    parameters[pref.Name] = stored;
                }
            }
        }
        connectButton.Click += (_, _) =>
        {
            if (connectButton.Content as string == "Logout")
            {
                var outcome = oauthService.Disconnect(extension.Id, parameters, extension.OAuth ?? new List<string>());
                if (outcome.Ok)
                {
                    statusText.Text = "Not connected to " + providerLabel;
                    connectButton.Content = "Login";
                    showToast("Disconnected from " + providerLabel);
                }
                else
                {
                    showToast(outcome.Error?.Message ?? "Disconnect failed");
                }
                return;
            }
            connectButton.IsEnabled = false;
            statusText.Text = "Waiting for " + providerLabel + " authorization\u2026";
            _ = Task.Run(async () =>
            {
                var outcome = await oauthService.AuthorizeAsync(
                    extension.Id, parameters, extension.OAuth ?? new List<string>(), CancellationToken.None,
                    TimeSpan.FromMinutes(5));
                Dispatcher.BeginInvoke(() =>
                {
                    if (outcome.Ok)
                    {
                        statusText.Text = "Logged into " + providerLabel;
                        connectButton.Content = "Logout";
                        connectButton.IsEnabled = true;
                        showToast("Connected to " + providerLabel);
                    }
                    else
                    {
                        statusText.Text = "Not connected to " + providerLabel;
                        connectButton.Content = "Login";
                        connectButton.IsEnabled = true;
                        var reason = outcome.Error?.Message ?? "Authorization failed";
                        statusText2.Text = reason;
                        showToast("Login failed: " + reason);
                    }
                });
            });
        };

        var row = SettingsRow(null, null, connectButton);
        var grid = (Grid)row.Child;
        Grid.SetColumn(statusStack, 0);
        grid.Children.Insert(0, statusStack);

        _ = Task.Run(async () =>
        {
            var outcome = await oauthService.StatusAsync(
                extension.Id, parameters, extension.OAuth ?? new List<string>(), CancellationToken.None);
            Dispatcher.BeginInvoke(() =>
            {
                var connected = outcome.Ok && outcome.Result is { } resultElement
                    && resultElement.GetProperty("ok").GetBoolean();
                statusText.Text = connected ? "Logged into " + providerLabel : "Not connected to " + providerLabel;
                connectButton.Content = connected ? "Logout" : "Login";
                connectButton.IsEnabled = true;
            });
        });
        return row;
    }

    private FrameworkElement BuildCommandRow(ReadyExtension extension, Protocol.CommandInfo command, string key, string? stored)
    {
        var grid = new Grid { Margin = new Thickness(8, 0, 8, 0), Opacity = CommandToggles.IsEnabled(extension.Id, command.Id) ? 1.0 : 0.4 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(22) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(30) });

        var icon = BuildBrandMark(extension, 14);
        icon.Opacity = 0.85;
        Grid.SetColumn(icon, 0);
        grid.Children.Add(icon);

        var title = new TextBlock
        {
            Text = command.Title,
            FontSize = 13,
            FontWeight = FontWeights.Regular,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 8, 0),
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        Grid.SetColumn(title, 1);
        grid.Children.Add(title);

        var alias = new TextBlock
        {
            Text = "Add Alias",
            FontSize = 12,
            Foreground = FindResource("TextTertiaryBrush") as Brush,
            VerticalAlignment = VerticalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            ToolTip = "Not available yet",
        };
        Grid.SetColumn(alias, 2);
        grid.Children.Add(alias);

        var hotkeyCell = BuildHotkeyCell(key, stored, command.Title, () => BuildBrandMark(extension, 16));
        Grid.SetColumn(hotkeyCell, 3);
        grid.Children.Add(hotkeyCell);

        var enabled = new CheckBox
        {
            IsChecked = CommandToggles.IsEnabled(extension.Id, command.Id),
            Tag = string.Empty,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        enabled.Checked += (_, _) => ApplyCommandToggle(extension, command, grid, true);
        enabled.Unchecked += (_, _) => ApplyCommandToggle(extension, command, grid, false);
        Grid.SetColumn(enabled, 4);
        grid.Children.Add(enabled);

        var rowBorder = new Border
        {
            Background = FindResource("RowBackgroundBrush") as Brush,
            CornerRadius = (System.Windows.CornerRadius)FindResource("RowCornerRadius"),
            Padding = new Thickness(4, 8, 4, 8),
            Margin = new Thickness(0, 0, 0, 1),
            Child = grid,
        };
        rowBorder.MouseEnter += (_, _) => rowBorder.Background = FindResource("SurfaceBrush") as Brush;
        rowBorder.MouseLeave += (_, _) => rowBorder.Background = FindResource("RowBackgroundBrush") as Brush;
        return rowBorder;
    }

    
    private FrameworkElement? BuildVectorGlyph(string? name, System.Windows.Media.Brush? brush)
    {
        if (string.IsNullOrEmpty(name))
        {
            return null;
        }
        var geometry = Rendering.LucideIcon.Load(name);
        if (geometry is null)
        {
            return null;
        }
        var path = new System.Windows.Shapes.Path
        {
            Data = geometry,
            Stroke = brush ?? FindResource("TextPrimaryBrush") as Brush,
            StrokeThickness = 1.8,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round,
            StrokeLineJoin = PenLineJoin.Round,
            Stretch = Stretch.Uniform,
            VerticalAlignment = VerticalAlignment.Center,
        };
        return path;
    }

    private FrameworkElement BuildExtensionMark(ReadyExtension extension, double size)
    {
        foreach (var command in extension.Commands)
        {
            var color = Rendering.LucideIcon.ColorFromHex(
                command.IconColor, FindResource("TextPrimaryBrush") as Brush);
            if (BuildVectorGlyph(command.Icon, color) is { } vector)
            {
                vector.Width = size;
                vector.Height = size;
                return vector;
            }
        }
        return BuildNavGlyph(extension.Icon);
    }

    private FrameworkElement BuildCommandMark(ReadyExtension extension, Protocol.CommandInfo command, double size)
    {
        var color = Rendering.LucideIcon.ColorFromHex(
            command.IconColor, FindResource("TextPrimaryBrush") as Brush);
        if (BuildVectorGlyph(command.Icon, color) is { } vector)
        {
            vector.Width = size;
            vector.Height = size;
            return vector;
        }
        return BuildNavGlyph(extension.Icon);
    }

    private FrameworkElement KeycapChip(string label)
    {
        return new Border
        {
            Background = FindResource("KeycapBackgroundBrush") as Brush,
            BorderBrush = FindResource("KeycapBorderBrush") as Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = (System.Windows.CornerRadius)FindResource("KeycapCornerRadius"),
            Padding = new Thickness(8, 3, 8, 3),
            Margin = new Thickness(2, 0, 2, 0),
            Child = new TextBlock
            {
                Text = label,
                FontSize = 12,
                Foreground = FindResource("TextPrimaryBrush") as Brush,
            },
        };
    }

    private static string? KeyToName(Key key) => key switch
    {
        >= Key.A and <= Key.Z => key.ToString(),
        >= Key.D0 and <= Key.D9 => ((int)key - (int)Key.D0).ToString(),
        >= Key.F1 and <= Key.F24 => key.ToString(),
        Key.Space => "Space",
        Key.Left => "Left",
        Key.Up => "Up",
        Key.Right => "Right",
        Key.Down => "Down",
        Key.OemPeriod => ".",
        Key.OemComma => ",",
        Key.OemMinus => "-",
        Key.OemPlus => "=",
        Key.OemQuestion => "/",
        Key.Oem1 => ";",
        Key.Oem7 => "'",
        Key.OemOpenBrackets => "[",
        Key.Oem6 => "]",
        Key.Oem5 => "\\",
        _ => null,
    };

    private static uint VirtualKeyFromName(string name) => name switch
    {
        "Space" => 0x20,
        "Left" => 0x25,
        "Up" => 0x26,
        "Right" => 0x27,
        "Down" => 0x28,
        "." => 0xBE,
        "," => 0xBC,
        "-" => 0xBD,
        "=" => 0xBB,
        "/" => 0xBF,
        ";" => 0xBA,
        "'" => 0xDE,
        "[" => 0xDB,
        "]" => 0xDD,
        _ when name.Length == 1 && char.IsLetterOrDigit(name[0]) => (uint)char.ToUpperInvariant(name[0]),
        _ when name.StartsWith("F") && int.TryParse(name[1..], out var f) && f is >= 1 and <= 24 => (uint)(0x70 + f - 1),
        _ => 0,
    };

    private List<string>? recorderModifiers;
    private List<string> recorderModifierSnapshot = [];
    private string? recorderKey;
    private Action? recorderRender;
    private Action? recorderCommit;
    private Action? recorderHint;
    private System.Windows.Controls.Primitives.Popup? recorderPopup;

    private void OpenHotkeyRecorder(string key, string commandTitle, Func<FrameworkElement> markFactory, FrameworkElement anchor, Action<string?> committed)
    {
        var capturedModifiers = recorderModifiers = new List<string>();
        recorderKey = null;
        var hint = new TextBlock
        {
            Text = "Press keys to record",
            FontSize = 13,
            Foreground = FindResource("TextSecondaryBrush") as Brush,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        var keycaps = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 10, 0, 10) };
        var mark = markFactory();
        mark.Width = 16;
        mark.Height = 16;
        mark.VerticalAlignment = VerticalAlignment.Center;

        var titleText = new TextBlock
        {
            Text = commandTitle,
            FontSize = 12,
            FontWeight = FontWeights.Medium,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(6, 0, 0, 0),
        };

        var popup = new System.Windows.Controls.Primitives.Popup
        {
            Width = 440,
            StaysOpen = true,
            AllowsTransparency = true,
            Placement = System.Windows.Controls.Primitives.PlacementMode.Top,
            PlacementTarget = anchor,
            VerticalOffset = -6,
        };
        var card = new Border
        {
            Background = FindResource("ActionPanelBackgroundBrush") as Brush,
            BorderBrush = FindResource("KeycapBorderBrush") as Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = (System.Windows.CornerRadius)FindResource("RowCornerRadius"),
            Padding = new Thickness(14, 12, 14, 10),
        };
        var footer = new StackPanel { Orientation = Orientation.Horizontal };
        footer.Children.Add(mark);
        footer.Children.Add(titleText);
        var closeHint = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var footerGrid = new Grid { Margin = new Thickness(0, 8, 0, 0) };
        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var outer = new StackPanel();

        void RenderKeycaps()
        {
            keycaps.Children.Clear();
            foreach (var modifier in capturedModifiers)
            {
                keycaps.Children.Add(KeycapChip(modifier));
            }
            if (recorderKey is not null)
            {
                keycaps.Children.Add(KeycapChip(recorderKey));
            }
        }

        void RenderHint()
        {
            if (recorderKey is null && capturedModifiers.Count == 0)
            {
                hint.Text = "Press keys to record (Ctrl, Alt or Win required)";
            }
            else if (recorderKey is not null)
            {
                hint.Text = "Release the keys to save";
            }
            else
            {
                hint.Text = "Press Backspace to delete";
            }
        }

        void Cleanup()
        {
            PreviewKeyDown -= OnRecorderPreviewKeyDown;
            PreviewKeyUp -= OnRecorderPreviewKeyUp;
            PreviewMouseDown -= OnRecorderPreviewMouseDown;
            Deactivated -= OnRecorderWindowDeactivated;
            if (recorderPopup is null)
            {
                return;
            }
            recorderPopup = null;
            RestoreGlobalHotkeys?.Invoke();
        }

        void Close()
        {
            Cleanup();
            popup.IsOpen = false;
        }

        void Commit()
        {
            DebugLog.Write("recorder commit entered key=" + (recorderKey ?? "null") + " mods=" + string.Join(",", recorderModifierSnapshot));
            if (recorderKey is null)
            {
                return;
            }
            var modifier = 0u;
            foreach (var modifierName in recorderModifierSnapshot)
            {
                modifier |= modifierName.ToLowerInvariant() switch
                {
                    "ctrl" => HotkeyManager.MOD_CONTROL,
                    "alt" => HotkeyManager.MOD_ALT,
                    "win" => HotkeyManager.MOD_WIN,
                    "shift" => HotkeyManager.MOD_SHIFT,
                    _ => 0u,
                };
            }
            var virtualKey = VirtualKeyFromName(recorderKey);
            if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
            {
                DebugLog.Write("recorder commit rejected reserved");
                hint.Text = "Include Ctrl, Alt or Win with another key";
                return;
            }
            if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
            {
                hint.Text = "AltGr risk \u2014 add Win or pick another key";
                return;
            }
            var combo = Describe(modifier, virtualKey);
            if (ShortcutConflict is not null && ShortcutConflict(combo))
            {
                hint.Text = "Conflicts with the summon hotkey";
                return;
            }
            var duplicate = hotkeySettings
                .Load()
                .CommandShortcuts
                .FirstOrDefault(kv => kv.Value.Equals(combo, StringComparison.OrdinalIgnoreCase) && kv.Key != key);
            if (duplicate.Key is not null)
            {
                hint.Text = "Already used by another command";
                return;
            }
            CommandShortcutChanged?.Invoke(key, combo);
            Close();
            committed(combo);
            DebugLog.Write("recorder saved " + combo);
        }

        recorderRender = RenderKeycaps;
        recorderCommit = Commit;
        recorderHint = RenderHint;
        recorderPopup = popup;

        Grid.SetColumn(footer, 0);
        Grid.SetColumn(closeHint, 1);
        footerGrid.Children.Add(footer);
        footerGrid.Children.Add(closeHint);
        outer.Children.Add(hint);
        outer.Children.Add(keycaps);
        outer.Children.Add(new Border { Height = 1, Background = FindResource("DividerBrush") as Brush, Margin = new Thickness(-14, 6, -14, 0) });
        outer.Children.Add(footerGrid);
        card.Child = outer;
        popup.Child = card;
        popup.Closed += (_, _) => Cleanup();
        PreviewKeyDown += OnRecorderPreviewKeyDown;
        PreviewKeyUp += OnRecorderPreviewKeyUp;
        PreviewMouseDown += OnRecorderPreviewMouseDown;
        Deactivated += OnRecorderWindowDeactivated;
        SuspendGlobalHotkeys?.Invoke();
        popup.IsOpen = true;
        DebugLog.Write("recorder opened key=" + key);
    }

    private void OnRecorderWindowDeactivated(object? sender, EventArgs e)
    {
        if (recorderPopup is { IsOpen: true })
        {
            recorderPopup.IsOpen = false;
        }
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (recorderPopup is { IsOpen: true })
        {
            recorderPopup.IsOpen = false;
        }
        base.OnClosing(e);
    }

    private void OnRecorderPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (recorderPopup is null || !recorderPopup.IsOpen)
        {
            return;
        }
        DebugLog.Write("recorder keydown pressed=" + (e.Key == Key.System ? e.SystemKey.ToString() : e.Key.ToString()));
        var pressed = e.Key == Key.System ? e.SystemKey : e.Key;
        if (pressed is Key.Back)
        {
            if (recorderKey is not null)
            {
                recorderKey = null;
            }
            else if (recorderModifiers is not null && recorderModifiers.Count > 0)
            {
                recorderModifiers.RemoveAt(recorderModifiers.Count - 1);
            }
            recorderRender?.Invoke();
            recorderHint?.Invoke();
            e.Handled = true;
            return;
        }
        if (pressed is Key.Escape)
        {
            recorderPopup.IsOpen = false;
            e.Handled = true;
            return;
        }
        if (pressed is Key.Enter or Key.Return)
        {
            recorderCommit?.Invoke();
            e.Handled = true;
            return;
        }
        if (pressed is Key.LeftCtrl or Key.RightCtrl)
        {
            AddRecorderModifier("Ctrl");
            e.Handled = true;
            return;
        }
        if (pressed is Key.LeftAlt or Key.RightAlt)
        {
            AddRecorderModifier("Alt");
            e.Handled = true;
            return;
        }
        if (pressed is Key.LWin or Key.RWin)
        {
            AddRecorderModifier("Win");
            e.Handled = true;
            return;
        }
        if (pressed is Key.LeftShift or Key.RightShift)
        {
            AddRecorderModifier("Shift");
            e.Handled = true;
            return;
        }
        var name = KeyToName(pressed);
        if (name is null)
        {
            return;
        }
        recorderKey = name;
        recorderModifierSnapshot = recorderModifiers?.ToList() ?? [];
        recorderRender?.Invoke();
        recorderHint?.Invoke();
        e.Handled = true;
    }

    private void OnRecorderPreviewKeyUp(object sender, KeyEventArgs e)
    {
        if (recorderPopup is null || !recorderPopup.IsOpen)
        {
            return;
        }
        DebugLog.Write("recorder keyup pressed=" + (e.Key == Key.System ? e.SystemKey.ToString() : e.Key.ToString()));
        var pressed = e.Key == Key.System ? e.SystemKey : e.Key;
        if (pressed is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
            or Key.LWin or Key.RWin or Key.LeftShift or Key.RightShift)
        {
            var name = pressed switch
            {
                Key.LeftCtrl or Key.RightCtrl => "Ctrl",
                Key.LeftAlt or Key.RightAlt => "Alt",
                Key.LWin or Key.RWin => "Win",
                _ => "Shift",
            };
            if (recorderModifiers is not null && recorderModifiers.Contains(name))
            {
                recorderModifiers.Remove(name);
                recorderRender?.Invoke();
                recorderHint?.Invoke();
                if (recorderKey is not null && recorderModifiers.Count == 0)
                {
                    recorderCommit?.Invoke();
                }
            }
            e.Handled = true;
            return;
        }
        var released = KeyToName(pressed);
        if (released is not null && released == recorderKey && recorderModifiers is { Count: 0 })
        {
            recorderCommit?.Invoke();
            e.Handled = true;
        }
    }

    private void OnRecorderPreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (recorderPopup is null || !recorderPopup.IsOpen)
        {
            return;
        }
        if (recorderPopup.Child is Border { } card)
        {
            var topLeft = card.PointToScreen(new System.Windows.Point(0, 0));
            var right = topLeft.X + card.ActualWidth;
            var bottom = topLeft.Y + card.ActualHeight;
            var mouse = System.Windows.Forms.Cursor.Position;
            if (mouse.X < topLeft.X || mouse.X > right || mouse.Y < topLeft.Y || mouse.Y > bottom)
            {
                recorderPopup.IsOpen = false;
                e.Handled = true;
            }
        }
    }

    private void AddRecorderModifier(string name)
    {
        if (recorderModifiers is not null && !recorderModifiers.Contains(name) && recorderModifiers.Count < 2)
        {
            recorderModifiers.Add(name);
            recorderRender?.Invoke();
            recorderHint?.Invoke();
        }
    }

    

    

    private void ApplyCommandToggle(ReadyExtension extension, Protocol.CommandInfo command, Grid grid, bool enabled)
    {
        CommandToggles.SetEnabled(extension.Id, command.Id, enabled);
        grid.Opacity = enabled ? 1.0 : 0.4;
        CommandToggled?.Invoke(extension.Id, command.Id, enabled);
    }

    private FrameworkElement BuildHotkeyCell(string key, string? stored, string commandTitle, Func<FrameworkElement> markFactory)
    {
        var cell = new ContentControl { VerticalAlignment = VerticalAlignment.Center, Focusable = false };

        void ShowStatus(string? combo)
        {
            if (combo is null)
            {
                var record = new TextBlock
                {
                    Text = "Record Hotkey",
                    FontSize = 12,
                    Foreground = FindResource("TextTertiaryBrush") as Brush,
                    VerticalAlignment = VerticalAlignment.Center,
                    TextAlignment = TextAlignment.Center,
                    Cursor = Cursors.Hand,
                };
                record.MouseLeftButtonDown += (_, _) =>
                {
                    DebugLog.Write("record hotkey clicked key=" + key);
                    try
                    {
                        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.ApplicationIdle,
                            () => OpenHotkeyRecorder(key, commandTitle, markFactory, cell, combo2 => ShowStatus(combo2)));
                        DebugLog.Write("recorder popup requested key=" + key);
                    }
                    catch (Exception ex)
                    {
                        DebugLog.Write("recorder failed: " + ex);
                        showToast("Recorder failed: " + ex.Message);
                    }
                };
                cell.Content = record;
                return;
            }

            var grid = new Grid();
            var comboText = new TextBlock
            {
                Text = combo,
                FontSize = 12,
                Foreground = FindResource("TextPrimaryBrush") as Brush,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Cursor = Cursors.Hand,
            };
            var remove = new TextBlock
            {
                Text = "\u2715",
                FontSize = 11,
                Foreground = FindResource("TextSecondaryBrush") as Brush,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Collapsed,
                Cursor = Cursors.Hand,
                ToolTip = "Remove hotkey",
            };
            void RemoveCombo()
            {
                CommandShortcutChanged?.Invoke(key, null);
                ShowStatus(null);
            }
            remove.MouseLeftButtonDown += (_, _) => RemoveCombo();
            grid.Children.Add(comboText);
            grid.Children.Add(remove);
            grid.Cursor = Cursors.Hand;
            grid.MouseEnter += (_, _) =>
            {
                comboText.Visibility = Visibility.Collapsed;
                remove.Visibility = Visibility.Visible;
            };
            grid.MouseLeave += (_, _) =>
            {
                remove.Visibility = Visibility.Collapsed;
                comboText.Visibility = Visibility.Visible;
            };
            grid.MouseLeftButtonDown += (_, e) =>
            {
                if (remove.Visibility == Visibility.Visible)
                {
                    RemoveCombo();
                }
                e.Handled = true;
            };
            cell.Content = grid;
        }

        ShowStatus(stored);
        return cell;
    }



    private void AddShortcutRow(StackPanel panel, string title, string? stored, string key)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 2) };
        row.Children.Add(new TextBlock
        {
            Text = title,
            Width = 300,
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 12,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var box = new TextBox { Width = 180, IsReadOnly = true, Text = stored ?? "(none)" };
        row.Children.Add(box);

        var hintText = new TextBlock { FontSize = 11, Foreground = FindResource("TextSecondaryBrush") as Brush, VerticalAlignment = VerticalAlignment.Center, MaxWidth = 140, TextWrapping = TextWrapping.Wrap };
        row.Children.Add(hintText);

        box.PreviewKeyDown += (sender, e) =>
        {
            var pressed = e.Key == Key.System ? e.SystemKey : e.Key;
            if (pressed is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
                or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin or Key.Escape)
            {
                if (pressed == Key.Escape)
                {
                    box.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
                }
                e.Handled = true;
                return;
            }
            var modifier = ReadModifiers();
            var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(pressed);
            if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
            {
                hintText.Text = "reserved/unsafe";
                e.Handled = true;
                return;
            }
            if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
            {
                hintText.Text = "AltGr risk — add Win";
                e.Handled = true;
                return;
            }
            var combo = Describe(modifier, virtualKey);
            if (ShortcutConflict is not null && ShortcutConflict(combo))
            {
                hintText.Text = "conflicts with the summon hotkey";
                e.Handled = true;
                return;
            }
            CommandShortcutChanged?.Invoke(key, combo);
            box.Text = combo;
            hintText.Text = "saved";
            e.Handled = true;
        };

        var clearButton = new Button { Content = "✕", Padding = new Thickness(6, 2, 6, 2), Margin = new Thickness(4, 0, 0, 0) };
        clearButton.Click += (_, _) =>
        {
            CommandShortcutChanged?.Invoke(key, null);
            box.Text = "(none)";
            hintText.Text = "removed";
        };
        row.Children.Add(clearButton);

        panel.Children.Add(row);
    }

    private void BuildExtensionForms(StackPanel panel)
    {
        foreach (var extension in extensions)
        {
            if ((extension.Preferences?.Count ?? 0) == 0)
            {
                continue;
            }
            panel.Children.Add(new TextBlock
            {
                Text = (extension.Icon ?? "•") + "  " + extension.Name + "  —  " + extension.Id,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4),
            });
            BuildExtensionForm(panel, extension);
        }
    }

    private void BuildExtensionForm(StackPanel panel, ReadyExtension extension)
    {
        if ((extension.Preferences?.Count ?? 0) == 0)
        {
            return;
        }
        var valuesPanel = new StackPanel();
        var schema = extension.Preferences!;
        var current = preferencesStore.Slice(extension.Id, schema);
        var inputs = new Dictionary<string, FrameworkElement>(StringComparer.Ordinal);
            pendingPreferenceInputs[extension.Id] = inputs;
        foreach (var entry in schema)
        {
            FrameworkElement input;
            switch (entry.Type)
            {
                case "checkbox":
                    var checkBox = new CheckBox { Foreground = FindResource("TextPrimaryBrush") as Brush };
                    checkBox.IsChecked = current.TryGetValue(entry.Name, out var cb) ? cb.GetBoolean() : entry.Default?.GetBoolean() ?? false;
                    input = checkBox;
                    break;
                case "dropdown":
                    var combo = new ComboBox { Style = FindResource("SlimComboBox") as Style };
                    foreach (var option in entry.Options ?? new List<PreferenceOption>())
                    {
                        combo.Items.Add(new ComboBoxItem { Content = option.Title, Tag = option.Value });
                    }
                    var selectedValue = current.TryGetValue(entry.Name, out var dv) ? dv.GetString() : entry.Default?.GetString();
                    foreach (ComboBoxItem item in combo.Items)
                    {
                        if ((string)item.Tag == selectedValue)
                        {
                            combo.SelectedItem = item;
                        }
                    }
                    input = combo;
                    break;
                case "password":
                    var passwordBox = new PasswordBox();
                    if (current.TryGetValue(entry.Name, out var pv))
                    {
                        passwordBox.Password = pv.GetString() ?? "";
                    }
                    input = passwordBox;
                    break;
                default:
                    var textBox = new TextBox();
                    if (current.TryGetValue(entry.Name, out var tv))
                    {
                        textBox.Text = tv.GetString() ?? "";
                    }
                    input = textBox;
                    break;
            }
            inputs[entry.Name] = input;
            FrameworkElement rowControl;
            if (entry.Type is "text" or "password")
            {
                input.Visibility = Visibility.Collapsed;
                var capturedEntry = entry;
                var editButton = new Button
                {
                    Content = input is PasswordBox ? "Set value…" : "Edit…",
                    ToolTip = "Opens a dialog to edit this value",
                };
                editButton.Click += (_, _) => OpenPreferenceModal(extension, capturedEntry, input);
                rowControl = editButton;
            }
            else
            {
                rowControl = input;
            }
            valuesPanel.Children.Add(SettingsRow(entry.Title, null, rowControl));
        }
        var saveButton = new Button { Content = "Save preferences" };
        saveButton.Click += (_, _) => SaveExtensionPreferences(extension, inputs);
        panel.Children.Add(valuesPanel);
        var saveRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 4, 0, 0) };
        saveRow.Children.Add(saveButton);
        panel.Children.Add(saveRow);
    }

    private FrameworkElement? modalEditor;

    private void OpenPreferenceModal(ReadyExtension extension, Protocol.PreferenceSchema entry, FrameworkElement input)
    {
        var label = new TextBlock
        {
            Text = entry.Title,
            FontSize = 13,
            FontWeight = FontWeights.Medium,
            Foreground = FindResource("TextPrimaryBrush") as Brush,
            Margin = new Thickness(0, 0, 0, 8),
        };
        FrameworkElement editor;
        if (input is PasswordBox sourcePassword)
        {
            editor = new PasswordBox
            {
                Password = sourcePassword.Password,
                Background = FindResource("KeycapBackgroundBrush") as Brush,
                Foreground = FindResource("TextPrimaryBrush") as Brush,
                BorderBrush = FindResource("KeycapBorderBrush") as Brush,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 5, 8, 5),
                FontSize = 13,
            };
        }
        else
        {
            editor = new TextBox
            {
                Text = ((TextBox)input).Text,
                Background = FindResource("KeycapBackgroundBrush") as Brush,
                Foreground = FindResource("TextPrimaryBrush") as Brush,
                BorderBrush = FindResource("KeycapBorderBrush") as Brush,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 5, 8, 5),
                FontSize = 13,
            };
        }
        modalEditor = editor;
        var cancelButton = new Button { Content = "Cancel" };
        var saveButton = new Button { Content = "Save", Margin = new Thickness(8, 0, 0, 0) };
        cancelButton.Click += (_, _) => ClosePreferenceModal();
        saveButton.Click += (_, _) =>
        {
            if (input is PasswordBox targetPassword)
            {
                targetPassword.Password = ((PasswordBox)editor).Password;
            }
            else
            {
                ((TextBox)input).Text = ((TextBox)editor).Text;
            }
            ClosePreferenceModal();
            SaveExtensionPreferences(extension);
        };
        editor.KeyDown += (_, e) =>
        {
            if (e.Key is Key.Enter or Key.Return)
            {
                saveButton.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Button.ClickEvent));
                e.Handled = true;
            }
            if (e.Key is Key.Escape)
            {
                ClosePreferenceModal();
                e.Handled = true;
            }
        };
        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 14, 0, 0),
        };
        buttons.Children.Add(cancelButton);
        buttons.Children.Add(saveButton);
        var content = new StackPanel();
        content.Children.Add(label);
        content.Children.Add(editor);
        content.Children.Add(buttons);
        ModalCard.Child = content;
        ModalOverlay.Visibility = Visibility.Visible;
        editor.Focus();
    }

    private void ClosePreferenceModal()
    {
        ModalOverlay.Visibility = Visibility.Collapsed;
        ModalCard.Child = null;
        modalEditor = null;
    }

    private void OnModalBackdropClick(object sender, MouseButtonEventArgs e)
    {
        ClosePreferenceModal();
    }

    private void SaveExtensionPreferences(ReadyExtension extension)
    {
        if (pendingPreferenceInputs.TryGetValue(extension.Id, out var inputs))
        {
            SaveExtensionPreferences(extension, inputs);
        }
    }

    private void SaveExtensionPreferences(ReadyExtension extension, Dictionary<string, FrameworkElement> inputs)
    {
        var schema = extension.Preferences;
        if (schema is null)
        {
            return;
        }
        var values = new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal);
        foreach (var entry in schema)
        {
            switch (entry.Type)
            {
                case "checkbox":
                    values[entry.Name] = System.Text.Json.JsonSerializer.SerializeToElement(((CheckBox)inputs[entry.Name]).IsChecked == true);
                    break;
                case "dropdown":
                    values[entry.Name] = System.Text.Json.JsonSerializer.SerializeToElement(
                        (string?)((ComboBoxItem?)((ComboBox)inputs[entry.Name]).SelectedItem)?.Tag ?? "");
                    break;
                case "password":
                    values[entry.Name] = System.Text.Json.JsonSerializer.SerializeToElement(((PasswordBox)inputs[entry.Name]).Password);
                    break;
                default:
                    values[entry.Name] = System.Text.Json.JsonSerializer.SerializeToElement(((TextBox)inputs[entry.Name]).Text);
                    break;
            }
        }
        preferencesStore.SetSlice(extension.Id, schema, values);
        var delivered = preferencesStore.Slice(extension.Id, schema)
            .ToDictionary(p => p.Key, p => p.Value);
        PreferencesChanged?.Invoke(extension.Id, delivered);
        showToast(extension.Name + " preferences saved");
    }

    public event Action<string, Dictionary<string, System.Text.Json.JsonElement>>? PreferencesChanged;
    public event Action<string, string, bool>? CommandToggled;
    private readonly Dictionary<string, Dictionary<string, FrameworkElement>> pendingPreferenceInputs = new(StringComparer.Ordinal);
    public event Action<string, string?>? CommandShortcutChanged;
    public Func<string, string>? DescribeCommandShortcut { get; set; }
    public Action? RefreshCommandShortcuts { get; set; }
    public Func<string, bool>? ShortcutConflict { get; set; }
    public Action? SuspendGlobalHotkeys { get; set; }
    public Action? RestoreGlobalHotkeys { get; set; }

    private void OnHotkeyGotFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        if (sender is TextBox box)
        {
            box.Text = "Press a key combination…";
        }
        hotkeyHint.Text = "Press Escape to cancel.";
    }

    private void OnHotkeyLostFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        var settings = hotkeySettings.Load();
        if (sender is TextBox box)
        {
            box.Text = Describe(settings.Modifier, settings.VirtualKey);
        }
        hotkeyHint.Text = string.Empty;
    }

    private void OnHotkeyPreviewKeyDown(object sender, KeyEventArgs e)
    {
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
            or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin or Key.Escape)
        {
            if (key == Key.Escape)
            {
                hotkeyHint.Text = "Cancelled.";
                if (sender is TextBox box)
                {
                    box.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
                }
            }
            e.Handled = true;
            return;
        }

        var modifier = ReadModifiers();
        var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(key);

        if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
        {
            hotkeyHint.Text = "That combination is reserved or unsafe. Ctrl, Alt or Win with another key is required.";
            e.Handled = true;
            return;
        }
        if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
        {
            hotkeyHint.Text = "Ctrl+Alt plus a letter or digit types characters on AltGr layouts — add Win or pick another key.";
            e.Handled = true;
            return;
        }

        if (applySummonHotkey(modifier, virtualKey))
        {
            var settings = hotkeySettings.Load();
            settings.Modifier = modifier;
            settings.VirtualKey = virtualKey;
            hotkeySettings.Save(settings);
            if (sender is TextBox box)
            {
                box.Text = Describe(modifier, virtualKey);
            }
            hotkeyHint.Text = "Hotkey updated.";
        }
        else
        {
            hotkeyHint.Text = "That combination is already registered by another app — hotkey unchanged.";
        }
        e.Handled = true;
    }

    private static uint ReadModifiers()
    {
        var modifier = 0u;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Control))
        {
            modifier |= HotkeyManager.MOD_CONTROL;
        }
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Alt))
        {
            modifier |= HotkeyManager.MOD_ALT;
        }
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
        {
            modifier |= HotkeyManager.MOD_SHIFT;
        }
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Windows))
        {
            modifier |= HotkeyManager.MOD_WIN;
        }
        return modifier;
    }

    public static string Describe(uint modifier, uint virtualKey)
    {
        var parts = new List<string>();
        if ((modifier & HotkeyManager.MOD_CONTROL) != 0) parts.Add("Ctrl");
        if ((modifier & HotkeyManager.MOD_ALT) != 0) parts.Add("Alt");
        if ((modifier & HotkeyManager.MOD_WIN) != 0) parts.Add("Win");
        if ((modifier & HotkeyManager.MOD_SHIFT) != 0) parts.Add("Shift");
        parts.Add(virtualKey switch
        {
            >= 0x30 and <= 0x39 => ((char)virtualKey).ToString(),
            >= 0x41 and <= 0x5A => ((char)virtualKey).ToString(),
            >= 0x70 and <= 0x87 => "F" + (virtualKey - 0x70 + 1),
            0x20 => "Space",
            0x25 => "Left",
            0x26 => "Up",
            0x27 => "Right",
            0x28 => "Down",
            0xBA => ";",
            0xBB => "=",
            0xBC => ",",
            0xBD => "-",
            0xBE => ".",
            0xBF => "/",
            0xDB => "[",
            0xDD => "]",
            0xDE => "'",
            _ => "0x" + virtualKey.ToString("X"),
        });
        return string.Join("+", parts);
    }

    private void OnLaunchAtLoginChanged(object sender, RoutedEventArgs e)
    {
        try
        {
            LoginLauncher.SetEnabled(sender is Wpf.Ui.Controls.ToggleSwitch toggle && toggle.IsChecked == true);
        }
        catch (Exception ex)
        {
            hotkeyHint.Text = "launch-at-login failed: " + ex.Message;
        }
    }

    private void OnClearClipboardHistory(object sender, RoutedEventArgs e)
    {
        clearClipboardHistory();
        showToast("Clipboard history cleared");
    }

    private void OnChromeDrag(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            try
            {
                DragMove();
            }
            catch (InvalidOperationException)
            {
                /* drag can race with a double click; harmless */
            }
        }
    }

    private void OnBackClick(object sender, RoutedEventArgs e) => GoBack();

    private void OnForwardClick(object sender, RoutedEventArgs e) => GoForward();

    private void OnMinimizeClick(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void OnCloseClick(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
