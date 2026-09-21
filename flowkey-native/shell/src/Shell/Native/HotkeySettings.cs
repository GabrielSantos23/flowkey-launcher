using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlowKey.Shell.Native;

public sealed class HotkeySettings
{
    public uint Modifier { get; set; } = 0x0003;
    public uint VirtualKey { get; set; } = 0x20;
    public Dictionary<string, string> CommandShortcuts { get; set; } = new(StringComparer.Ordinal);
}

public sealed class HotkeySettingsStore
{
    private readonly string filePath;
    private readonly object gate = new();

    public HotkeySettingsStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "hotkeys.json");
    }

    private static JsonSerializerOptions JsonOptions { get; } = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public HotkeySettings Load()
    {
        lock (gate)
        {
            try
            {
                if (File.Exists(filePath))
                {
                    return JsonSerializer.Deserialize<HotkeySettings>(File.ReadAllText(filePath), JsonOptions) ?? new HotkeySettings();
                }
            }
            catch
            {
                /* fall through to defaults */
            }
            return new HotkeySettings();
        }
    }

    public void Save(HotkeySettings settings)
    {
        lock (gate)
        {
            File.WriteAllText(filePath, JsonSerializer.Serialize(settings, JsonOptions));
        }
    }
}

public static class LoginLauncher
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "FlowKey";

    public static bool IsEnabled()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(ValueName) is string;
    }

    public static void SetEnabled(bool enabled)
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe))
        {
            return;
        }
        using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled)
        {
            key.SetValue(ValueName, "\"" + exe + "\"");
        }
        else
        {
            key.DeleteValue(ValueName, false);
        }
    }
}
