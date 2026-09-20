using System.Text.Json;

namespace FlowKey.Shell.Protocol;

public sealed class InitMessage
{
    public string Type { get; set; } = "init";
    public int ProtocolVersion { get; set; }
    public string ExtensionsDir { get; set; } = "";
    public Dictionary<string, Dictionary<string, JsonElement>> Preferences { get; set; } = [];
}

public sealed class SearchMessage
{
    public string Type { get; set; } = "search";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string Query { get; set; } = "";
}

public sealed class ActionMessage
{
    public string Type { get; set; } = "action";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string ActionId { get; set; } = "";
    public UiItem? Item { get; set; }
}

public sealed class PreferencesMessage
{
    public string Type { get; set; } = "preferences";
    public string ExtensionId { get; set; } = "";
    public Dictionary<string, JsonElement> Values { get; set; } = [];
}

public sealed class ReadyMessage
{
    public string Type { get; set; } = "ready";
    public int ProtocolVersion { get; set; }
    public List<ReadyExtension> Extensions { get; set; } = [];
}

public sealed class ReadyExtension
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public List<CommandInfo> Commands { get; set; } = [];
    public List<string> NativeMethods { get; set; } = [];
    public List<string> HttpHosts { get; set; } = [];
}

public sealed class CommandInfo
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
}

public sealed class UiMessage
{
    public string Type { get; set; } = "ui";
    public string RequestId { get; set; } = "";
    public UiTree Tree { get; set; } = new ListTree();
}

public sealed class ErrorMessage
{
    public string Type { get; set; } = "error";
    public string RequestId { get; set; } = "";
    public ProtocolError Error { get; set; } = new();
}

public sealed class NativeCallMessage
{
    public string Type { get; set; } = "nativeCall";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string Method { get; set; } = "";
    public Dictionary<string, JsonElement>? Params { get; set; }
}

public sealed class NativeResultMessage
{
    public string Type { get; set; } = "nativeResult";
    public string RequestId { get; set; } = "";
    public bool Ok { get; set; }
    public JsonElement? Result { get; set; }
    public ProtocolError? Error { get; set; }
}

public sealed class ProtocolError
{
    public string Code { get; set; } = "";
    public string Message { get; set; } = "";
}

public sealed class LogMessage
{
    public string Type { get; set; } = "log";
    public string Level { get; set; } = "info";
    public string Message { get; set; } = "";
}
