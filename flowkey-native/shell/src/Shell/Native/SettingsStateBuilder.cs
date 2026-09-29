using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Native;

/// <summary>Everything <see cref="SettingsStateBuilder.Build"/> needs, resolved by the window.</summary>
public sealed record SettingsStateInput(
    IReadOnlyList<ReadyExtension> Extensions,
    IReadOnlyList<ReadyFailure> LoadFailures,
    HotkeySettings Hotkeys,
    bool OpenAtLogin,
    bool AutoUpdateCheck,
    SettingsUpdateStatus Update,
    Func<string, FooterIconState?> IconFor,
    Func<string, InstalledExtension?> InstalledFor,
    Func<string, string, SettingsOAuthRow> OAuthStatusFor,
    Func<string, IReadOnlyList<Protocol.PreferenceSchema>, Dictionary<string, System.Text.Json.JsonElement>> PreferencesFor,
    Func<IReadOnlyList<SettingsAppOption>> AppChoicesFor,
    Func<string, bool> CommandEnabled,
    SettingsPendingConsent? PendingInstall,
    SettingsPendingConsent? PendingReconsent,
    SettingsCaptureState? Capture);

/// <summary>
/// Builds the full settings page snapshot from store/service inputs — a pure
/// function so the whole page model is xunit-testable. Ported from the former
/// SettingsWindow page builders (BuildNavigation, BuildExtensionsPage,
/// BuildExtensionDetailPage, BuildAboutPage).
/// </summary>
public static class SettingsStateBuilder
{
    public static SettingsState Build(SettingsStateInput input)
    {
        var nav = new List<SettingsNavItem>
        {
            new("general", "General", null),
            new("extensions", "Extensions", null),
        };
        foreach (var extension in input.Extensions)
        {
            nav.Add(new SettingsNavItem("ext:" + extension.Id, extension.Name, input.IconFor(extension.Id)));
        }
        nav.Add(new SettingsNavItem("about", "About", null));

        var details = new Dictionary<string, SettingsExtensionDetail>(StringComparer.Ordinal);
        foreach (var extension in input.Extensions)
        {
            details[extension.Id] = BuildDetail(extension, input);
        }

        return new SettingsState(
            Nav: nav,
            General: new SettingsGeneralState(
                OpenAtLogin: input.OpenAtLogin,
                SummonHotkey: HotkeyCombo.Describe(input.Hotkeys.Modifier, input.Hotkeys.VirtualKey),
                AutoUpdateCheck: input.AutoUpdateCheck),
            Extensions: new SettingsExtensionsState(
                LoadFailures: input.LoadFailures
                    .Select(failure => new SettingsFailureRow(failure.Id, failure.Message))
                    .ToList(),
                Installed: input.Extensions
                    .Select(extension => input.InstalledFor(extension.Id))
                    .OfType<InstalledExtension>()
                    .Select(record => new SettingsInstalledRow(record.Id, record.Name, record.Version, record.Enabled))
                    .ToList()),
            About: new SettingsAboutState(
                Version: UpdateService.CurrentVersion(),
                ExtensionsLoaded: input.Extensions.Count),
            Update: input.Update,
            Details: details,
            PendingInstall: input.PendingInstall,
            PendingReconsent: input.PendingReconsent,
            Capture: input.Capture);
    }

    private static SettingsExtensionDetail BuildDetail(ReadyExtension extension, SettingsStateInput input)
    {
        var record = input.InstalledFor(extension.Id);
        var oauth = (extension.OAuth ?? new List<string>())
            .Select(provider => input.OAuthStatusFor(extension.Id, provider))
            .ToList();
        var current = extension.Preferences is { Count: > 0 }
            ? input.PreferencesFor(extension.Id, extension.Preferences)
            : new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal);
        var preferences = (extension.Preferences ?? new List<PreferenceSchema>())
            .Select(entry => new SettingsPreferenceField(
                Name: entry.Name,
                Type: entry.Type,
                Title: entry.Title,
                Label: entry.Label,
                Placeholder: entry.Placeholder,
                Required: entry.Required,
                Value: current.TryGetValue(entry.Name, out var value) ? value : null,
                Options: (entry.Options ?? new List<PreferenceOption>())
                    .Select(option => new SettingsPreferenceOption(option.Value, option.Title))
                    .ToList()))
            .ToList();
        var commands = extension.Commands
            .Select(command =>
            {
                var key = extension.Id + ":" + command.Id;
                input.Hotkeys.CommandShortcuts.TryGetValue(key, out var stored);
                return new SettingsCommandRow(
                    key,
                    command.Id,
                    command.Title,
                    stored,
                    input.CommandEnabled(key));
            })
            .ToList();
        return new SettingsExtensionDetail(
            Id: extension.Id,
            Name: extension.Name,
            Description: extension.Description,
            Version: extension.Version,
            Icon: input.IconFor(extension.Id),
            IsZipInstalled: record is not null,
            ZipEnabled: record?.Enabled ?? false,
            InstalledAt: record is null ? null : record.InstalledAt.ToString("yyyy-MM-dd"),
            OAuth: oauth,
            Preferences: preferences,
            AppChoices: input.AppChoicesFor(),
            Commands: commands);
    }

    /// <summary>Converts the UpdateService status into the page-renderable record.</summary>
    public static SettingsUpdateStatus FromUpdate(UpdateStatus status) => new(
        Phase: status.Phase switch
        {
            UpdatePhase.Checking => "checking",
            UpdatePhase.UpToDate => "upToDate",
            UpdatePhase.Available => "available",
            UpdatePhase.Downloading => "downloading",
            UpdatePhase.Ready => "ready",
            UpdatePhase.Error => "error",
            _ => "idle",
        },
        Message: DescribeUpdate(status),
        NewVersion: status.NewVersion,
        ProgressPercent: status.ProgressPercent);

    public static string DescribeUpdate(UpdateStatus status) => status.Phase switch
    {
        UpdatePhase.Checking => "Checking for updates…",
        UpdatePhase.UpToDate => "You're up to date",
        UpdatePhase.Available => status.NewVersion is null
            ? "A new version is available"
            : $"Version {status.NewVersion} is available — downloading…",
        UpdatePhase.Downloading => status.ProgressPercent is { } percent
            ? $"Downloading {status.NewVersion}… {percent}%"
            : "Downloading update…",
        UpdatePhase.Ready => "Update ready — FlowKey will restart to install",
        UpdatePhase.Error => "Update check failed: " + status.Message,
        _ => "Last checked automatically every 6 hours",
    };
}
