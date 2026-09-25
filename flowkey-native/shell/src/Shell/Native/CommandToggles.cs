using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public static class CommandToggles
{
    private static readonly object Gate = new();
    private static readonly string FilePath =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FlowKey.Shell",
            "command-toggles.json");

    private static Dictionary<string, bool> Load()
    {
        lock (Gate)
        {
            try
            {
                if (!File.Exists(FilePath))
                {
                    return [];
                }
                return JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(FilePath)) ?? [];
            }
            catch
            {
                return [];
            }
        }
    }

    private static void Save(Dictionary<string, bool> values)
    {
        lock (Gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(values));
        }
    }

    public static bool IsEnabled(string extensionId, string commandId)
    {
        var values = Load();
        return !values.TryGetValue(Key(extensionId, commandId), out var enabled) || enabled;
    }

    public static void SetEnabled(string extensionId, string commandId, bool enabled)
    {
        var values = Load();
        values[Key(extensionId, commandId)] = enabled;
        Save(values);
    }

    private static string Key(string extensionId, string commandId) => extensionId + ":" + commandId;
}
