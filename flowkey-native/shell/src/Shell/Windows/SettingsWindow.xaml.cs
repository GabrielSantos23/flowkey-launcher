using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using Brush = System.Windows.Media.Brush;
using Button = System.Windows.Controls.Button;
using CheckBox = System.Windows.Controls.CheckBox;
using ComboBox = System.Windows.Controls.ComboBox;
using ComboBoxItem = System.Windows.Controls.ComboBoxItem;
using PasswordBox = System.Windows.Controls.PasswordBox;
using TextBox = System.Windows.Controls.TextBox;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Windows;

public partial class SettingsWindow : Window
{
    private readonly HotkeyManager hotkeyManager;
    private readonly HotkeySettingsStore hotkeySettings;
    private readonly PreferencesStore preferencesStore;
    private readonly IReadOnlyList<ReadyExtension> extensions;
    private readonly Action clearClipboardHistory;
    private readonly Action<string> showToast;
    private readonly Func<uint, uint, bool> applySummonHotkey;

    private uint captureModifier;
    private uint captureKey;

    public SettingsWindow(
        HotkeyManager hotkeyManager,
        HotkeySettingsStore hotkeySettings,
        PreferencesStore preferencesStore,
        IReadOnlyList<ReadyExtension> extensions,
        Action clearClipboardHistory,
        Action<string> showToast,
        Func<uint, uint, bool> applySummonHotkey)
    {
        InitializeComponent();
        this.hotkeyManager = hotkeyManager;
        this.hotkeySettings = hotkeySettings;
        this.preferencesStore = preferencesStore;
        this.extensions = extensions;
        this.clearClipboardHistory = clearClipboardHistory;
        this.showToast = showToast;
        this.applySummonHotkey = applySummonHotkey;

        var settings = hotkeySettings.Load();
        HotkeyBox.Text = Describe(settings.Modifier, settings.VirtualKey);

        LaunchAtLogin.IsChecked = LoginLauncher.IsEnabled();
        BuildExtensionForms();
        BuildCommandShortcutRows();
    }

    private void BuildCommandShortcutRows()
    {
        if (RefreshCommandShortcuts is null)
        {
            return;
        }
        RefreshCommandShortcuts();
        ExtensionsPanel.Children.Add(new TextBlock
        {
            Text = "Per-command shortcuts",
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 14, 0, 6),
        });
        var settings = hotkeySettings.Load();
        var bound = new HashSet<string>(StringComparer.Ordinal);
        foreach (var extension in extensions)
        {
            foreach (var command in extension.Commands)
            {
                var key = extension.Id + ":" + command.Id;
                settings.CommandShortcuts.TryGetValue(key, out var stored);
                AddShortcutRow(command.Title, stored, key);
                bound.Add(key);
            }
        }
        foreach (var key in settings.CommandShortcuts.Keys)
        {
            if (!bound.Contains(key))
            {
                AddShortcutRow(key + " (orphan — command no longer exists)", settings.CommandShortcuts[key], key);
            }
        }
    }

    private void AddShortcutRow(string title, string? stored, string key)
    {
        AddShortcutRowCore(title, stored, key);
    }

    private void AddShortcutRowCore(string title, string? stored, string key)
    {
        var row = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 2) };
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

        var hintText = new TextBlock { FontSize = 11, Foreground = FindResource("DimTextBrush") as Brush, VerticalAlignment = VerticalAlignment.Center, MaxWidth = 140, TextWrapping = TextWrapping.Wrap };
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

        ExtensionsPanel.Children.Add(row);
    }

    private void BuildExtensionForms()
    {
        foreach (var extension in extensions)
        {
            if ((extension.Preferences?.Count ?? 0) == 0)
            {
                continue;
            }
            ExtensionsPanel.Children.Add(new TextBlock
            {
                Text = (extension.Icon ?? "•") + "  " + extension.Name + "  —  " + extension.Id,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4),
            });
            var valuesPanel = new StackPanel();
            var schema = extension.Preferences!;
            var current = preferencesStore.Slice(extension.Id, schema);
            var inputs = new Dictionary<string, FrameworkElement>(StringComparer.Ordinal);
            foreach (var entry in schema)
            {
                valuesPanel.Children.Add(new TextBlock { Text = entry.Title, FontSize = 12, Foreground = FindResource("DimTextBrush") as Brush });
                FrameworkElement input;
                switch (entry.Type)
                {
                    case "checkbox":
                        var checkBox = new CheckBox { Foreground = FindResource("TextBrush") as Brush };
                        checkBox.IsChecked = current.TryGetValue(entry.Name, out var cb) ? cb.GetBoolean() : entry.Default?.GetBoolean() ?? false;
                        input = checkBox;
                        break;
                    case "dropdown":
                        var combo = new ComboBox();
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
                valuesPanel.Children.Add(input);
            }
            var saveButton = new Button { Content = "Save" };
            var capturedSchema = schema;
            var capturedExtensionId = extension.Id;
            saveButton.Click += (_, _) =>
            {
                var values = new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal);
                foreach (var entry in capturedSchema)
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
                preferencesStore.SetSlice(capturedExtensionId, capturedSchema, values);
                var delivered = preferencesStore.Slice(capturedExtensionId, capturedSchema)
                    .ToDictionary(p => p.Key, p => p.Value);
                PreferencesChanged?.Invoke(capturedExtensionId, delivered);
                showToast(extension.Name + " preferences saved");
            };
            ExtensionsPanel.Children.Add(valuesPanel);
            ExtensionsPanel.Children.Add(saveButton);
        }
    }

    public event Action<string, Dictionary<string, System.Text.Json.JsonElement>>? PreferencesChanged;
    public event Action<string, string?>? CommandShortcutChanged;
    public Func<string, string>? DescribeCommandShortcut { get; set; }
    public Action? RefreshCommandShortcuts { get; set; }
    public Func<string, bool>? ShortcutConflict { get; set; }

    private void OnHotkeyGotFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        HotkeyBox.Text = "Press a key combination…";
        HotkeyHint.Text = "Press Escape to cancel.";
    }

    private void OnHotkeyLostFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        var settings = hotkeySettings.Load();
        HotkeyBox.Text = Describe(settings.Modifier, settings.VirtualKey);
    }

    private void OnHotkeyPreviewKeyDown(object sender, KeyEventArgs e)
    {
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
            or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin or Key.Escape)
        {
            if (key == Key.Escape)
            {
                HotkeyBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
            }
            e.Handled = true;
            return;
        }

        var modifier = ReadModifiers();
        var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(key);

        if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
        {
            HotkeyHint.Text = "That combination is reserved or unsafe. Ctrl, Alt or Win with another key is required.";
            e.Handled = true;
            return;
        }
        if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
        {
            HotkeyHint.Text = "Ctrl+Alt plus a letter or digit types characters on AltGr layouts — add Win or pick another key.";
            e.Handled = true;
            return;
        }

        if (applySummonHotkey(modifier, virtualKey))
        {
            var settings = hotkeySettings.Load();
            settings.Modifier = modifier;
            settings.VirtualKey = virtualKey;
            hotkeySettings.Save(settings);
            HotkeyBox.Text = Describe(modifier, virtualKey);
            HotkeyHint.Text = "Hotkey updated.";
        }
        else
        {
            HotkeyHint.Text = "That combination is already registered by another app — hotkey unchanged.";
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
            _ => "0x" + virtualKey.ToString("X"),
        });
        return string.Join("+", parts);
    }

    private void OnLaunchAtLoginChanged(object sender, RoutedEventArgs e)
    {
        try
        {
            LoginLauncher.SetEnabled(LaunchAtLogin.IsChecked == true);
        }
        catch (Exception ex)
        {
            HotkeyHint.Text = "launch-at-login failed: " + ex.Message;
        }
    }

    private void OnClearClipboardHistory(object sender, RoutedEventArgs e)
    {
        clearClipboardHistory();
        showToast("Clipboard history cleared");
    }
}
