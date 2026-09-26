using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

/// <summary>
/// Pins the C# manifest validator to the exact accept/reject behavior of
/// @flowkey/native-sdk via the shared contract fixture.
/// </summary>
public class ExtensionManifestValidatorTests
{
    [Fact]
    public void EveryValidFixtureManifestPasses()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(ContractPaths.ManifestFixture));
        var valid = fixture.RootElement.GetProperty("valid");
        Assert.True(valid.GetArrayLength() > 0, "fixture must contain valid cases");
        foreach (var entry in valid.EnumerateArray())
        {
            var manifest = entry.GetProperty("manifest");
            var result = ExtensionManifestValidator.Validate(manifest);
            Assert.True(result.Errors.Count == 0,
                $"valid case '{entry.GetProperty("name").GetString()}' failed: {Describe(result.Errors)}");
        }
    }

    [Fact]
    public void EveryInvalidFixtureManifestFailsOnExpectedFieldAndCode()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(ContractPaths.ManifestFixture));
        var invalid = fixture.RootElement.GetProperty("invalid");
        Assert.True(invalid.GetArrayLength() > 0, "fixture must contain invalid cases");
        foreach (var entry in invalid.EnumerateArray())
        {
            var result = ExtensionManifestValidator.Validate(entry.GetProperty("manifest"));
            var expectedField = entry.GetProperty("expectedField").GetString()!;
            var expectedCode = entry.GetProperty("expectedCode").GetString()!;
            Assert.Contains(result.Errors, e => e.Field == expectedField && e.Code == expectedCode);
        }
    }

    [Fact]
    public void NonObjectManifestFails()
    {
        using var document = JsonDocument.Parse("42");
        var result = ExtensionManifestValidator.Validate(document.RootElement);
        Assert.Single(result.Errors);
        Assert.Equal("notAnObject", result.Errors[0].Code);
    }

    private static string Describe(IReadOnlyList<ManifestIssue> errors) =>
        string.Join("; ", errors.Select(e => $"{e.Field}: {e.Code}"));
}

public class NativeMethodPolicyTests
{
    [Theory]
    [InlineData("clipboard.write", "clipboard.write", true)]
    [InlineData("clipboard.write", "clipboard.read", false)]
    [InlineData("clipboard.*", "clipboard.write", true)]
    [InlineData("storage.*", "storage.get", true)]
    [InlineData("storage.*", "storage.get.deep", true)]
    [InlineData("storage.*", "clipboard.write", false)]
    [InlineData("clipboard.*", "write", false)]
    public void DeclarationMatchingSupportsWildcards(string declared, string method, bool expected)
    {
        Assert.Equal(expected, NativeMethodPolicy.IsDeclared([declared], method));
    }

    [Fact]
    public void EmptyDeclarationsNeverMatch()
    {
        Assert.False(NativeMethodPolicy.IsDeclared(Array.Empty<string>(), "clipboard.write"));
    }
}

public class SemVerTests
{
    [Theory]
    [InlineData("1.0.0", true)]
    [InlineData("0.2.1-beta.1", true)]
    [InlineData("1.0.0+build.5", true)]
    [InlineData("1.0", false)]
    [InlineData("not-a-version", false)]
    [InlineData("", false)]
    public void TripleParsing(string version, bool expected)
    {
        Assert.Equal(expected, SemVer.TryParseTriple(version, out _));
    }

    [Theory]
    [InlineData("1.0.1", "1.0.0", true)]
    [InlineData("1.1.0", "1.0.9", true)]
    [InlineData("2.0.0", "1.9.9", true)]
    [InlineData("1.0.0", "1.0.0", false)]
    [InlineData("1.0.0", "1.0.1", false)]
    [InlineData("0.9.0", "1.0.0", false)]
    public void StrictlyNewerComparison(string candidate, string current, bool expected)
    {
        Assert.Equal(expected, SemVer.IsStrictlyNewer(candidate, current));
    }
}
