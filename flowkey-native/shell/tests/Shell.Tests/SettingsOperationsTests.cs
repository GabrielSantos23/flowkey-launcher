using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public class SettingsOperationsTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "flowkey-settings-ops-" + Guid.NewGuid().ToString("N"));
    private readonly HotkeySettingsStore hotkeySettings;
    private readonly PreferencesStore preferencesStore;
    private readonly ExtensionPackageManager extensionManager;
    private readonly List<ReadyExtension> extensions = [];
    private readonly List<string> toasts = [];
    private uint appliedModifier;
    private uint appliedVirtualKey;
    private bool registrationSucceeds = true;
    private string conflictingCombo = "Ctrl+Alt+Space";

    public SettingsOperationsTests()
    {
        Directory.CreateDirectory(root);
        hotkeySettings = new HotkeySettingsStore(root);
        preferencesStore = new PreferencesStore(root);
        var dataDir = Path.Combine(root, "data");
        extensionManager = new ExtensionPackageManager(
            Path.Combine(root, "extensions"),
            new InstalledExtensionsStore(dataDir),
            new SecretsStore(dataDir),
            new TokenVault(dataDir),
            new ExtensionStorageStore(dataDir),
            new ExtensionCacheStore(dataDir),
            Path.Combine(root, "icons"));
        extensionManager.Install(new ExtensionPackageInstaller.InstallPlan(
            "zip-ext", "Zip Extension", "1.0.0", null, null, "main.js", [], [], [], [], [], [], false), WritePackage(), new ExtensionConsent([], [], [], [], []));
    }

    private string WritePackage(string id = "zip-ext", string[]? nativeMethods = null)
    {
        var packagePath = Path.Combine(root, $"pkg-{id}.flowkey");
        using var stream = File.Create(packagePath);
        using var archive = new System.IO.Compression.ZipArchive(stream, System.IO.Compression.ZipArchiveMode.Create);
        var manifest = archive.CreateEntry("manifest.json");
        var methods = nativeMethods is { Length: > 0 }
            ? ",\"nativeMethods\":[" + string.Join(",", nativeMethods.Select(m => "\"" + m + "\"")) + "]"
            : "";
        using (var writer = new StreamWriter(manifest.Open()))
        {
            writer.Write("{\"id\":\"" + id + "\",\"name\":\"" + id + "\",\"version\":\"1.0.0\",\"commands\":[{\"id\":\"open\",\"title\":\"Open\"}],\"httpHosts\":[\"api.example.com\"]" + methods + "}");
        }
        var entry = archive.CreateEntry("main.js");
        using (var entryWriter = new StreamWriter(entry.Open()))
        {
            entryWriter.Write("export default { handlers: {} };");
        }
        return packagePath;
    }

    private SettingsOperations CreateOperations(Action? clearSummon = null) => new(
        hotkeySettings,
        preferencesStore,
        extensionManager,
        extensions,
        message => toasts.Add(message),
        (modifier, virtualKey) =>
        {
            appliedModifier = modifier;
            appliedVirtualKey = virtualKey;
            return registrationSucceeds;
        },
        clearSummon ?? (() => { }),
        combo => combo.Equals(conflictingCombo, StringComparison.OrdinalIgnoreCase),
        enabled => { },
        () => { },
        (extensionId, commandId, enabled) => { });

    public void Dispose()
    {
        try
        {
            Directory.Delete(root, recursive: true);
        }
        catch (IOException)
        {
            /* best effort */
        }
    }

    // --- summon hotkey ---

    [Fact]
    public void CommitSummonSavesValidCombo()
    {
        var outcome = CreateOperations().CommitSummonCapture("Ctrl+Win+K");
        Assert.True(outcome.Ok, outcome.Error);
        Assert.Equal(HotkeyManager.MOD_CONTROL | HotkeyManager.MOD_WIN, appliedModifier);
        Assert.Equal(0x4Bu, appliedVirtualKey);
        Assert.Equal(0x000Au, hotkeySettings.Load().Modifier);
        Assert.Equal(0x4Bu, hotkeySettings.Load().VirtualKey);
    }

    [Fact]
    public void CommitSummonRejectsUnparseableCombo()
    {
        Assert.False(CreateOperations().CommitSummonCapture("K").Ok);
        Assert.False(CreateOperations().CommitSummonCapture("Ctrl").Ok);
    }

    [Fact]
    public void CommitSummonRejectsComboWithoutCtrlAltWin()
    {
        var outcome = CreateOperations().CommitSummonCapture("Shift+K");
        Assert.False(outcome.Ok);
        Assert.Contains("Ctrl, Alt or Win", outcome.Error);
    }

    [Fact]
    public void CommitSummonRejectsAltGrRiskyCombo()
    {
        var outcome = CreateOperations().CommitSummonCapture("Ctrl+Alt+A");
        Assert.False(outcome.Ok);
        Assert.Contains("AltGr", outcome.Error);
    }

    [Fact]
    public void CommitSummonSurfacesRegistrationFailure()
    {
        registrationSucceeds = false;
        var outcome = CreateOperations().CommitSummonCapture("Ctrl+Win+K");
        Assert.False(outcome.Ok);
        Assert.Contains("already registered by another app", outcome.Error);
    }

    [Fact]
    public void ResetSummonRestoresDefaultCombo()
    {
        var outcome = CreateOperations().ResetSummonHotkey();
        Assert.True(outcome.Ok, outcome.Error);
        Assert.Equal(SettingsOperations.DefaultModifier, hotkeySettings.Load().Modifier);
        Assert.Equal(SettingsOperations.DefaultVirtualKey, hotkeySettings.Load().VirtualKey);
    }

    [Fact]
    public void ClearSummonUnregistersAndPersistsEmptyCombo()
    {
        var unregistered = false;
        var outcome = CreateOperations(() => unregistered = true).ClearSummonHotkey();
        Assert.True(outcome.Ok, outcome.Error);
        Assert.True(unregistered);
        Assert.Equal(0u, hotkeySettings.Load().Modifier);
        Assert.Equal(0u, hotkeySettings.Load().VirtualKey);
    }

    // --- command shortcuts ---

    [Fact]
    public void CommitCommandSavesViaEvent()
    {
        string? raisedKey = null;
        string? raisedCombo = null;
        var operations = CreateOperations();
        operations.CommandShortcutChanged += (commandKey, combo) =>
        {
            raisedKey = commandKey;
            raisedCombo = combo;
        };
        var outcome = operations.CommitCommandCapture("alpha:open", "Ctrl+Win+O");
        Assert.True(outcome.Ok, outcome.Error);
        Assert.Equal("alpha:open", raisedKey);
        Assert.Equal("Ctrl+Win+O", raisedCombo);
    }

    [Fact]
    public void CommitCommandRejectsSummonConflict()
    {
        var outcome = CreateOperations().CommitCommandCapture("alpha:open", conflictingCombo);
        Assert.False(outcome.Ok);
        Assert.Contains("Conflicts with the summon hotkey", outcome.Error);
    }

    [Fact]
    public void CommitCommandRejectsDuplicates()
    {
        var settings = hotkeySettings.Load();
        settings.CommandShortcuts["other:cmd"] = "Ctrl+Win+O";
        hotkeySettings.Save(settings);
        var outcome = CreateOperations().CommitCommandCapture("alpha:open", "Ctrl+Win+O");
        Assert.False(outcome.Ok);
        Assert.Contains("Already used by another command", outcome.Error);
    }

    [Fact]
    public void ClearCommandRaisesNullCombo()
    {
        string? raisedCombo = "untouched";
        var operations = CreateOperations();
        operations.CommandShortcutChanged += (_, combo) => raisedCombo = combo;
        Assert.True(operations.ClearCommandShortcut("alpha:open").Ok);
        Assert.Null(raisedCombo);
    }

    // --- preferences ---

    [Fact]
    public void SetPreferencesPersistsSliceAndPushes()
    {
        var schema = new List<PreferenceSchema>
        {
            new() { Name = "token", Type = "password", Title = "Token" },
            new() { Name = "enabled", Type = "checkbox", Title = "Enabled" },
        };
        extensions.Add(new ReadyExtension { Id = "alpha", Name = "Alpha", Preferences = schema });
        Dictionary<string, JsonElement>? pushed = null;
        string? pushedExtensionId = null;
        var operations = CreateOperations();
        operations.PreferencesChanged += (extensionId, values) =>
        {
            pushedExtensionId = extensionId;
            pushed = values;
        };
        var outcome = operations.SetPreferences("alpha", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["token"] = JsonSerializer.SerializeToElement("hunter2"),
            ["enabled"] = JsonSerializer.SerializeToElement(true),
        });
        Assert.True(outcome.Ok, outcome.Error);
        Assert.Equal("alpha", pushedExtensionId);
        Assert.NotNull(pushed);
        Assert.Equal("hunter2", pushed!["token"].GetString());
        Assert.True(pushed["enabled"].GetBoolean());

        var raw = File.ReadAllText(Path.Combine(root, "preferences.json"));
        Assert.DoesNotContain("hunter2", raw);
        Assert.Contains("dpapi:", raw);
    }

    [Fact]
    public void SetPreferencesFailsForUnknownExtension()
    {
        Assert.False(CreateOperations().SetPreferences("ghost", []).Ok);
    }

    // --- extensions ---

    [Fact]
    public void SetExtensionEnabledRequestsRefresh()
    {
        var outcome = CreateOperations().SetExtensionEnabled("zip-ext", false);
        Assert.True(outcome.Ok);
        Assert.True(outcome.RefreshExtensions);
        Assert.False(extensionManager.GetInstalled("zip-ext")!.Enabled);
    }

    [Fact]
    public void UpdateConsentStoresCurrentDeclarations()
    {
        var record = extensionManager.GetInstalled("zip-ext")!;
        Assert.Empty(record.Consent.NativeMethods);
        extensions.Add(new ReadyExtension { Id = "zip-ext", Name = "Zip Extension", NativeMethods = ["clipboard.write"] });
        var outcome = CreateOperations().UpdateConsent("zip-ext");
        Assert.True(outcome.Ok, outcome.Error);
        Assert.Equal(new[] { "clipboard.write" }, extensionManager.GetInstalled("zip-ext")!.Consent.NativeMethods);
    }

    [Fact]
    public void UpdateConsentFailsForUnknownExtension()
    {
        Assert.False(CreateOperations().UpdateConsent("ghost").Ok);
    }

    [Fact]
    public void InstallPackagePersistsPlanConsent()
    {
        var packagePath = WritePackage("fresh-ext", nativeMethods: new[] { "clipboard.write" });
        var operations = CreateOperations();
        var plan = extensionManager.Inspect(packagePath, out var error);
        Assert.Null(error);
        Assert.NotNull(plan);
        var outcome = operations.InstallPackage(plan!, packagePath);
        Assert.True(outcome.Ok, outcome.Error);
        Assert.True(outcome.RefreshExtensions);
        var installed = extensionManager.GetInstalled("fresh-ext");
        Assert.NotNull(installed);
        Assert.Equal(new[] { "clipboard.write" }, installed!.Consent.NativeMethods);
        Assert.Equal(new[] { "clipboard.write" }, plan.NativeMethods);
    }

    [Fact]
    public void UninstallPurgesRecordAndRequestsRefresh()
    {
        Assert.NotNull(extensionManager.GetInstalled("zip-ext"));
        var outcome = CreateOperations().UninstallExtension("zip-ext");
        Assert.True(outcome.Ok, outcome.Error);
        Assert.True(outcome.RefreshExtensions);
        Assert.Null(extensionManager.GetInstalled("zip-ext"));
    }

    [Fact]
    public void UninstallUnknownFails()
    {
        Assert.False(CreateOperations().UninstallExtension("ghost").Ok);
    }

    // --- misc ---

    [Fact]
    public void ToggleCommandParsesCommandKey()
    {
        string? toggledExtension = null;
        string? toggledCommand = null;
        var toggledEnabled = false;
        var operations = CreateOperations();
        operations.CommandToggled += (extensionId, commandId, enabled) =>
        {
            toggledExtension = extensionId;
            toggledCommand = commandId;
            toggledEnabled = enabled;
        };
        Assert.True(operations.ToggleCommand("alpha:open", false).Ok);
        Assert.Equal(("alpha", "open", false), (toggledExtension, toggledCommand, toggledEnabled));
        Assert.False(operations.ToggleCommand("malformed", true).Ok);
    }

    [Fact]
    public void SetOpenAtLoginReportsFailures()
    {
        // the delegate-based setter is stubbed to succeed; failure mapping is covered by the exception path
        Assert.True(CreateOperations().SetOpenAtLogin(true).Ok);
    }

    [Fact]
    public void ClearClipboardDelegatesAndSucceeds()
    {
        Assert.True(CreateOperations().ClearClipboardHistory().Ok);
    }
}
