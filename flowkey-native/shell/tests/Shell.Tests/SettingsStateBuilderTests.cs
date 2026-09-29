using System.Text.Json;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public class SettingsStateBuilderTests
{
    private static ReadyExtension Extension(string id, string name, string? icon = null) => new()
    {
        Id = id,
        Name = name,
        Version = "2.0.0",
        Description = "A test extension",
        Icon = icon,
        Commands =
        [
            new CommandInfo { Id = "open", Title = "Open " + name },
            new CommandInfo { Id = "close", Title = "Close " + name },
        ],
    };

    private static SettingsStateInput Input(
        List<ReadyExtension> extensions,
        HotkeySettings? hotkeys = null,
        Dictionary<string, InstalledExtension>? installed = null,
        Func<string, FooterIconState?>? iconFor = null) => new(
        Extensions: extensions,
        LoadFailures: [new ReadyFailure { Id = "broken", Message = "nope" }],
        Hotkeys: hotkeys ?? new HotkeySettings(),
        OpenAtLogin: true,
        AutoUpdateCheck: true,
        Update: new SettingsUpdateStatus("idle", "Last checked automatically every 6 hours"),
        IconFor: iconFor ?? (_ => new FooterIconState("emoji", Emoji: "🧩")),
        InstalledFor: extensionId => installed?.GetValueOrDefault(extensionId),
        OAuthStatusFor: (extensionId, provider) => new SettingsOAuthRow(provider, "checking", null),
        PreferencesFor: (extensionId, schema) =>
        {
            var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var entry in schema)
            {
                values[entry.Name] = JsonSerializer.SerializeToElement("stored-" + entry.Name);
            }
            return values;
        },
        AppChoicesFor: () => [new SettingsAppOption("Terminal", "C:\\wt.exe")],
        CommandEnabled: key => key != "alpha:close",
        PendingInstall: null,
        PendingReconsent: null,
        Capture: null);

    [Fact]
    public void NavListsStaticPagesThenExtensionsThenAbout()
    {
        var state = SettingsStateBuilder.Build(Input([Extension("alpha", "Alpha"), Extension("beta", "Beta")]));
        Assert.Equal(
            ["general", "extensions", "ext:alpha", "ext:beta", "about"],
            state.Nav.Select(entry => entry.Key));
        Assert.Equal("Alpha", state.Nav[2].Label);
        Assert.Equal("emoji", state.Nav[2].Icon?.Kind);
    }

    [Fact]
    public void GeneralStateDescribesSummonHotkey()
    {
        var hotkeys = new HotkeySettings { Modifier = 0x0003, VirtualKey = 0x20 };
        var state = SettingsStateBuilder.Build(Input([Extension("alpha", "Alpha")], hotkeys));
        Assert.Equal("Ctrl+Alt+Space", state.General.SummonHotkey);
        Assert.True(state.General.OpenAtLogin);
        Assert.True(state.General.AutoUpdateCheck);
    }

    [Fact]
    public void ExtensionDetailCarriesPreferencesCommandsAndInstalledState()
    {
        var extension = Extension("alpha", "Alpha");
        extension.Preferences =
        [
            new PreferenceSchema { Name = "token", Type = "password", Title = "Token", Required = true },
            new PreferenceSchema
            {
                Name = "mode",
                Type = "dropdown",
                Title = "Mode",
                Options = [new PreferenceOption { Value = "fast", Title = "Fast" }],
            },
        ];
        extension.OAuth = ["spotify"];
        var installed = new InstalledExtension(
            "alpha", "Alpha", "1.0.0", @"C:\ext\alpha", Enabled: false,
            new DateTimeOffset(2026, 9, 29, 0, 0, 0, TimeSpan.Zero),
            new ExtensionConsent([], [], [], [], []));
        var state = SettingsStateBuilder.Build(Input(
            [extension],
            installed: new Dictionary<string, InstalledExtension> { ["alpha"] = installed }));

        var detail = state.Details["alpha"];
        Assert.True(detail.IsZipInstalled);
        Assert.False(detail.ZipEnabled);
        Assert.Equal("2026-09-29", detail.InstalledAt);
        Assert.Equal("password", Assert.Single(detail.Preferences, field => field.Name == "token").Type);
        Assert.Equal("stored-token", Assert.Single(detail.Preferences, field => field.Name == "token").Value?.GetString());
        Assert.Equal("fast", Assert.Single(detail.Preferences, field => field.Name == "mode").Options[0].Value);
        Assert.Equal("checking", Assert.Single(detail.OAuth).Status);
        Assert.Equal("C:\\wt.exe", Assert.Single(detail.AppChoices).Value);

        var close = Assert.Single(detail.Commands, row => row.CommandId == "close");
        Assert.False(close.Enabled, "CommandEnabled fake disables alpha:close");
        var open = Assert.Single(detail.Commands, row => row.CommandId == "open");
        Assert.True(open.Enabled);
    }

    [Fact]
    public void ExtensionsPageListsFailuresAndInstalledRows()
    {
        var alpha = Extension("alpha", "Alpha");
        var installed = new InstalledExtension(
            "alpha", "Alpha", "2.0.0", @"C:\ext\alpha", Enabled: true,
            DateTimeOffset.UtcNow, new ExtensionConsent([], [], [], [], []));
        var state = SettingsStateBuilder.Build(Input(
            [alpha],
            installed: new Dictionary<string, InstalledExtension> { ["alpha"] = installed }));
        Assert.Equal("broken", Assert.Single(state.Extensions.LoadFailures).Id);
        var row = Assert.Single(state.Extensions.Installed);
        Assert.Equal(("alpha", "Alpha", "2.0.0", true), (row.Id, row.Name, row.Version, row.Enabled));
    }

    [Fact]
    public void FromUpdateMapsPhasesToPageStatus()
    {
        Assert.Equal("checking", SettingsStateBuilder.FromUpdate(new UpdateStatus(UpdatePhase.Checking, null, null, null, null)).Phase);
        var available = SettingsStateBuilder.FromUpdate(new UpdateStatus(UpdatePhase.Available, "1.0.0", "1.1.0", null, null));
        Assert.Equal("available", available.Phase);
        Assert.Equal("1.1.0", available.NewVersion);
        Assert.Contains("1.1.0", available.Message);
        Assert.Equal("upToDate", SettingsStateBuilder.FromUpdate(new UpdateStatus(UpdatePhase.UpToDate, "1.0.0", null, null, null)).Phase);
        var error = SettingsStateBuilder.FromUpdate(new UpdateStatus(UpdatePhase.Error, null, null, null, "network down"));
        Assert.Contains("network down", error.Message);
        Assert.Equal("idle", SettingsStateBuilder.FromUpdate(new UpdateStatus(UpdatePhase.Idle, null, null, null, null)).Phase);
    }
}
