using System.Text.Json;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Native;

public sealed record SettingsOpOutcome(bool Ok, string? Error = null, bool RefreshExtensions = false)
{
    public static SettingsOpOutcome Fail(string error) => new(false, error);
    public static SettingsOpOutcome Succeed(bool refreshExtensions = false) => new(true, null, refreshExtensions);
}

/// <summary>
/// Executes settings-page operations against the shell's stores and services.
/// Ported from the former SettingsWindow code-behind so the logic is
/// testable: hotkey validation and persistence, preference slices, extension
/// enable/install/uninstall/consent. Async orchestration (OAuth, update
/// checks, file dialogs) stays in the window; everything here is synchronous.
/// </summary>
public sealed class SettingsOperations
{
    public const uint DefaultModifier = HotkeyManager.MOD_ALT;
    public const uint DefaultVirtualKey = 0x20;

    private readonly HotkeySettingsStore hotkeySettings;
    private readonly PreferencesStore preferencesStore;
    private readonly ExtensionPackageManager extensionManager;
    private IReadOnlyList<ReadyExtension> extensions;
    private readonly Action<string> showToast;
    private readonly Func<uint, uint, bool> applySummonHotkey;
    private readonly Action clearSummonHotkey;
    private readonly Func<string, bool> shortcutConflict;
    private readonly Action<bool> setLoginLauncher;
    private readonly Action clearClipboardHistory;
    private readonly Action<string, string, bool> setCommandToggle;

    /// <summary>Raised when a preference slice was persisted; the window forwards it to the sidecar push.</summary>
    public event Action<string, Dictionary<string, JsonElement>>? PreferencesChanged;
    /// <summary>Raised when a command shortcut was committed or cleared; the window forwards persistence + re-registration.</summary>
    public event Action<string, string?>? CommandShortcutChanged;
    /// <summary>Raised when a command enable toggle changed; the window forwards re-registration.</summary>
    public event Action<string, string, bool>? CommandToggled;

    public SettingsOperations(
        HotkeySettingsStore hotkeySettings,
        PreferencesStore preferencesStore,
        ExtensionPackageManager extensionManager,
        IReadOnlyList<ReadyExtension> extensions,
        Action<string> showToast,
        Func<uint, uint, bool> applySummonHotkey,
        Action clearSummonHotkey,
        Func<string, bool> shortcutConflict,
        Action<bool> setLoginLauncher,
        Action clearClipboardHistory,
        Action<string, string, bool> setCommandToggle)
    {
        this.hotkeySettings = hotkeySettings;
        this.preferencesStore = preferencesStore;
        this.extensionManager = extensionManager;
        this.extensions = extensions;
        this.showToast = showToast;
        this.applySummonHotkey = applySummonHotkey;
        this.clearSummonHotkey = clearSummonHotkey;
        this.shortcutConflict = shortcutConflict;
        this.setLoginLauncher = setLoginLauncher;
        this.clearClipboardHistory = clearClipboardHistory;
        this.setCommandToggle = setCommandToggle;
    }

    /// <summary>
    /// Replaces the ready-extension snapshot after a sidecar restart so ops
    /// keep resolving against the live registry without rebuilding the window.
    /// </summary>
    public void UpdateExtensions(IReadOnlyList<ReadyExtension> ready)
    {
        extensions = ready;
    }

    public SettingsOpOutcome SetOpenAtLogin(bool enabled)
    {
        try
        {
            setLoginLauncher(enabled);
            return SettingsOpOutcome.Succeed();
        }
        catch (Exception ex)
        {
            return SettingsOpOutcome.Fail("launch-at-login failed: " + ex.Message);
        }
    }

    public SettingsOpOutcome CommitSummonCapture(string combo) =>
        CommitSummon(combo, "That combination is already registered by another app — hotkey unchanged.");

    public SettingsOpOutcome ResetSummonHotkey() =>
        CommitSummon(
            HotkeyCombo.Describe(DefaultModifier, DefaultVirtualKey),
            "The default hotkey is already registered by another app");

    /// <summary>
    /// Removes the summon hotkey entirely: the global registration is dropped
    /// and the stored combo is cleared, so no summon hotkey is re-registered
    /// on the next start (the launcher stays reachable through the tray).
    /// </summary>
    public SettingsOpOutcome ClearSummonHotkey()
    {
        clearSummonHotkey();
        var settings = hotkeySettings.Load();
        settings.Modifier = 0;
        settings.VirtualKey = 0;
        hotkeySettings.Save(settings);
        return SettingsOpOutcome.Succeed();
    }

    private SettingsOpOutcome CommitSummon(string combo, string registrationFailureMessage)
    {
        if (!HotkeyCombo.TryParse(combo, out var modifier, out var virtualKey))
        {
            return SettingsOpOutcome.Fail("Incomplete combination — include Ctrl, Alt or Win with another key");
        }
        if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
        {
            return SettingsOpOutcome.Fail("Include Ctrl, Alt or Win with another key");
        }
        if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
        {
            return SettingsOpOutcome.Fail("AltGr risk — add Win or pick another key");
        }
        if (!applySummonHotkey(modifier, virtualKey))
        {
            return SettingsOpOutcome.Fail(registrationFailureMessage);
        }
        var settings = hotkeySettings.Load();
        settings.Modifier = modifier;
        settings.VirtualKey = virtualKey;
        hotkeySettings.Save(settings);
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome CommitCommandCapture(string commandKey, string combo)
    {
        if (!HotkeyCombo.TryParse(combo, out var modifier, out var virtualKey))
        {
            return SettingsOpOutcome.Fail("Incomplete combination — include Ctrl, Alt or Win with another key");
        }
        if (HotkeyManager.IsReservedCombo(modifier, virtualKey))
        {
            return SettingsOpOutcome.Fail("Include Ctrl, Alt or Win with another key");
        }
        if (HotkeyManager.IsAltGrRisky(modifier, virtualKey))
        {
            return SettingsOpOutcome.Fail("AltGr risk — add Win or pick another key");
        }
        if (shortcutConflict(combo))
        {
            return SettingsOpOutcome.Fail("Conflicts with the summon hotkey");
        }
        var duplicate = hotkeySettings
            .Load()
            .CommandShortcuts
            .FirstOrDefault(kv => kv.Value.Equals(combo, StringComparison.OrdinalIgnoreCase) && kv.Key != commandKey);
        if (duplicate.Key is not null)
        {
            return SettingsOpOutcome.Fail("Already used by another command");
        }
        CommandShortcutChanged?.Invoke(commandKey, combo);
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome ClearCommandShortcut(string commandKey)
    {
        CommandShortcutChanged?.Invoke(commandKey, null);
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome ToggleCommand(string commandKey, bool enabled)
    {
        var separator = commandKey.IndexOf(':');
        if (separator <= 0 || separator == commandKey.Length - 1)
        {
            return SettingsOpOutcome.Fail("Unknown command: " + commandKey);
        }
        var extensionId = commandKey[..separator];
        var commandId = commandKey[(separator + 1)..];
        setCommandToggle(extensionId, commandId, enabled);
        CommandToggled?.Invoke(extensionId, commandId, enabled);
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome SetPreferences(string extensionId, Dictionary<string, JsonElement> values)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension?.Preferences is not { Count: > 0 } schema)
        {
            return SettingsOpOutcome.Fail("Unknown extension preferences: " + extensionId);
        }
        preferencesStore.SetSlice(extensionId, schema, values);
        var delivered = preferencesStore.Slice(extensionId, schema)
            .ToDictionary(pair => pair.Key, pair => pair.Value);
        PreferencesChanged?.Invoke(extensionId, delivered);
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome SetExtensionEnabled(string extensionId, bool enabled)
    {
        extensionManager.SetEnabled(extensionId, enabled);
        return SettingsOpOutcome.Succeed(refreshExtensions: true);
    }

    public SettingsOpOutcome UninstallExtension(string extensionId)
    {
        if (!extensionManager.Uninstall(extensionId))
        {
            return SettingsOpOutcome.Fail("Uninstall failed");
        }
        return SettingsOpOutcome.Succeed(refreshExtensions: true);
    }

    /// <summary>Installs a pending plan with the consent record built from the plan itself.</summary>
    public SettingsOpOutcome InstallPackage(ExtensionPackageInstaller.InstallPlan plan, string packagePath)
    {
        var outcome = extensionManager.Install(
            plan,
            packagePath,
            new ExtensionConsent(plan.NativeMethods, plan.HttpHosts, plan.OAuth, plan.FsPaths, plan.UriSchemes));
        if (!outcome.Ok)
        {
            return SettingsOpOutcome.Fail("Install failed: " + (outcome.ErrorMessage ?? "unknown error"));
        }
        return SettingsOpOutcome.Succeed(refreshExtensions: true);
    }

    /// <summary>Re-consents an installed extension with its current effective declarations.</summary>
    public SettingsOpOutcome UpdateConsent(string extensionId)
    {
        var extension = extensions.FirstOrDefault(candidate => candidate.Id == extensionId);
        if (extension is null || extensionManager.GetInstalled(extensionId) is null)
        {
            return SettingsOpOutcome.Fail("Unknown extension: " + extensionId);
        }
        extensionManager.UpdateConsent(
            extensionId,
            new ExtensionConsent(
                extension.NativeMethods,
                extension.HttpHosts,
                extension.OAuth ?? new List<string>(),
                extension.FsPaths ?? new List<string>(),
                extension.UriSchemes ?? new List<string>()));
        return SettingsOpOutcome.Succeed();
    }

    public SettingsOpOutcome ClearClipboardHistory()
    {
        clearClipboardHistory();
        return SettingsOpOutcome.Succeed();
    }

    public void ShowToast(string message) => showToast(message);
}
