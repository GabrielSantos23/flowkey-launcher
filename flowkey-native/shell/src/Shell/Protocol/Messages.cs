using System.Text.Json;

namespace FlowKey.Shell.Protocol;

public sealed class InitMessage
{
    public string Type { get; set; } = "init";
    public int ProtocolVersion { get; set; }
    public string ExtensionsDir { get; set; } = "";
    public Dictionary<string, Dictionary<string, JsonElement>> Preferences { get; set; } = [];
    /// <summary>Installed extension ids the shell has disabled; the sidecar must not load them.</summary>
    public List<string> DisabledExtensions { get; set; } = [];
}

public sealed class SearchMessage
{
    public string Type { get; set; } = "search";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string Query { get; set; } = "";
    public string? CommandId { get; set; }
    public string? FilterValue { get; set; }
}

public sealed class ActionMessage
{
    public string Type { get; set; } = "action";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string ActionId { get; set; } = "";
    public UiItem? Item { get; set; }
    public Dictionary<string, string>? Arguments { get; set; }
    /// <summary>Current form field values, sent by the shell while a form view is active.</summary>
    public Dictionary<string, JsonElement>? FormValues { get; set; }
}

public sealed class PreferencesMessage
{
    public string Type { get; set; } = "preferences";
    public string ExtensionId { get; set; } = "";
    public Dictionary<string, JsonElement> Values { get; set; } = [];
}

public sealed class ReadyFailure
{
    public string Id { get; set; } = "";
    public string Message { get; set; } = "";
}

public sealed class ReadyMessage
{
    public string Type { get; set; } = "ready";
    public int ProtocolVersion { get; set; }
    public List<ReadyExtension> Extensions { get; set; } = [];
    /// <summary>Installed extensions that were discovered but failed to load.</summary>
    public List<ReadyFailure> Failures { get; set; } = [];
}

public sealed class PreferenceSchema
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "text";
    public string Title { get; set; } = "";
    public JsonElement? Default { get; set; }
    public bool Required { get; set; }
    public List<PreferenceOption>? Options { get; set; }
    public string? Label { get; set; }
    public string? Placeholder { get; set; }
}

public sealed class PreferenceOption
{
    public string Value { get; set; } = "";
    public string Title { get; set; } = "";
}

public sealed class ReadyExtension
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Description { get; set; }
    public string? Icon { get; set; }
    public List<PreferenceSchema>? Preferences { get; set; }
    public List<CommandInfo> Commands { get; set; } = [];
    public List<string> NativeMethods { get; set; } = [];
    public List<string> HttpHosts { get; set; } = [];
    public List<string>? OAuth { get; set; } = [];
    public List<string>? FsPaths { get; set; } = [];
    public List<string>? UriSchemes { get; set; } = [];
}

public sealed class CommandInfo
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Subtitle { get; set; }
    public List<string>? Keywords { get; set; }
    public string? Mode { get; set; }
    public string? Icon { get; set; }
    public string? IconColor { get; set; }
    public bool? DisabledByDefault { get; set; }
    /// <summary>Background refresh cadence in seconds (>= 60, background commands only).</summary>
    public int? Interval { get; set; }
    public List<CommandArgument>? Arguments { get; set; }
}

public sealed class CommandArgument
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "text";
    public string Placeholder { get; set; } = "";
    public bool? Required { get; set; }
    public List<PreferenceOption>? Data { get; set; }
}

public sealed class AckMessage
{
    public string Type { get; set; } = "ack";
    public string RequestId { get; set; } = "";
}

public sealed class UiMessage
{
    public string Type { get; set; } = "ui";
    public string RequestId { get; set; } = "";
    public UiTree Tree { get; set; } = new ListTree();
}

public sealed class UiPushMessage
{
    public string Type { get; set; } = "uiPush";
    public string ExtensionId { get; set; } = "";
    public string CommandId { get; set; } = "";
    public string Query { get; set; } = "";
    public string? FilterValue { get; set; }
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

public sealed class WindowCommandMessage
{
    public string Type { get; set; } = "windowCommand";
    public string ExtensionId { get; set; } = "";
    /// <summary>closeMainWindow | popToRoot | clearSearchBar</summary>
    public string Command { get; set; } = "";
}

public sealed class LaunchCommandMessage
{
    public string Type { get; set; } = "launchCommand";
    public string ExtensionId { get; set; } = "";
    public string CommandId { get; set; } = "";
    public string? Query { get; set; }
}

public sealed class WebViewMessage
{
    public string Type { get; set; } = "webView";
    public string RequestId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string CommandId { get; set; } = "";
    /// <summary>Web bundle filename inside the extension package.</summary>
    public string Entry { get; set; } = "";
    public WebViewProps Props { get; set; } = new();
}

public sealed class ExtensionEnvironment
{
    public string ExtensionId { get; set; } = "";
    public string ExtensionName { get; set; } = "";
    public string ExtensionVersion { get; set; } = "";
    public string? CommandId { get; set; }
    public string? CommandMode { get; set; }
    public bool? IsDevelopment { get; set; }
}

public sealed class WebViewProps
{
    public string Query { get; set; } = "";
    public string? FilterValue { get; set; }
    public Dictionary<string, string>? Arguments { get; set; }
    public Dictionary<string, JsonElement> Preferences { get; set; } = new();
    public ExtensionEnvironment Environment { get; set; } = new();
}

public sealed class WebCallMessage
{
    public string Type { get; set; } = "webCall";
    public string BridgeId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
    public string Method { get; set; } = "";
    /// <summary>Bridge-level deadline for the relayed call (null = sidecar default).</summary>
    public int? TimeoutMs { get; set; }
    public Dictionary<string, JsonElement>? Params { get; set; }
}

public sealed class WebResultMessage
{
    public string Type { get; set; } = "webResult";
    public string BridgeId { get; set; } = "";
    public bool Ok { get; set; }
    public JsonElement? Result { get; set; }
    public ProtocolError? Error { get; set; }
}

public sealed class WebAbortMessage
{
    public string Type { get; set; } = "webAbort";
    public string BridgeId { get; set; } = "";
    public string ExtensionId { get; set; } = "";
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
