using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlowKey.Shell.Native;

/// <summary>
/// Everything the settings WebView page renders, produced by
/// <see cref="SettingsStateBuilder"/> and pushed through
/// <see cref="SettingsProtocol"/>. The page is a pure renderer: every value it
/// displays comes from this snapshot, and every mutation it offers is an
/// invoke op handled by the shell (SettingsOperations), mirroring the footer
/// state-push pattern.
/// </summary>
public sealed record SettingsState(
    List<SettingsNavItem> Nav,
    SettingsGeneralState General,
    SettingsExtensionsState Extensions,
    SettingsAboutState About,
    SettingsUpdateStatus Update,
    Dictionary<string, SettingsExtensionDetail> Details,
    SettingsPendingConsent? PendingInstall,
    SettingsPendingConsent? PendingReconsent,
    SettingsCaptureState? Capture);

public sealed record SettingsNavItem(string Key, string Label, FooterIconState? Icon);

public sealed record SettingsGeneralState(bool OpenAtLogin, string SummonHotkey, bool AutoUpdateCheck);

/// <summary>Human-readable update-check state; the page renders Message verbatim.</summary>
public sealed record SettingsUpdateStatus(string Phase, string Message, string? NewVersion = null, int? ProgressPercent = null);

public sealed record SettingsExtensionsState(
    List<SettingsFailureRow> LoadFailures,
    List<SettingsInstalledRow> Installed);

public sealed record SettingsFailureRow(string Id, string Message);

public sealed record SettingsInstalledRow(string Id, string Name, string Version, bool Enabled);

public sealed record SettingsAboutState(string Version, int ExtensionsLoaded);

public sealed record SettingsExtensionDetail(
    string Id,
    string Name,
    string? Description,
    string Version,
    FooterIconState? Icon,
    bool IsZipInstalled,
    bool ZipEnabled,
    string? InstalledAt,
    [property: JsonPropertyName("oauth")]
    List<SettingsOAuthRow> OAuth,
    List<SettingsPreferenceField> Preferences,
    IReadOnlyList<SettingsAppOption> AppChoices,
    List<SettingsCommandRow> Commands);

/// <summary>Status is checking | connected | disconnected.</summary>
public sealed record SettingsOAuthRow(string Provider, string Status, string? Error);

public sealed record SettingsPreferenceField(
    string Name,
    string Type,
    string Title,
    string? Label,
    string? Placeholder,
    bool Required,
    JsonElement? Value,
    List<SettingsPreferenceOption> Options);

public sealed record SettingsPreferenceOption(string Value, string Title);

public sealed record SettingsAppOption(string Label, string Value);

public sealed record SettingsCommandRow(string CommandKey, string CommandId, string Title, string? Shortcut, bool Enabled);

/// <summary>
/// A pending install or re-consent the page renders as a consent dialog. The
/// page can only confirm or cancel the pending plan — the shell builds the
/// stored consent record itself, so the page can never supply capabilities.
/// </summary>
public sealed record SettingsPendingConsent(
    string Kind,
    string ExtensionId,
    string Name,
    string Version,
    string? Description,
    List<string> NativeMethods,
    List<string> HttpHosts,
    [property: JsonPropertyName("oauth")]
    List<string> OAuth,
    List<string> FsPaths,
    List<string> UriSchemes,
    bool HasWebUi,
    List<string> ManifestWarnings);

/// <summary>An active hotkey recording: scope is summon | command.</summary>
public sealed record SettingsCaptureState(string Scope, string? CommandKey);
