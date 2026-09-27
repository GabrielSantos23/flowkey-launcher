using FlowKey.Shell.Protocol;
using FlowKey.Shell.Windows;
using Xunit;

namespace FlowKey.Shell.Tests;

public class CommandArgumentParserTests
{
    private static CommandInfo Command(params CommandArgument[] arguments) => new()
    {
        Id = "sync",
        Title = "Sync",
        Mode = "background",
        Arguments = [.. arguments],
    };

    private static CommandArgument Text(string name, string placeholder, bool required = false) => new()
    {
        Name = name,
        Type = "text",
        Placeholder = placeholder,
        Required = required,
    };

    [Fact]
    public void ParsesPositionalValuesInDeclarationOrder()
    {
        var command = Command(Text("direction", "Direction"), Text("vault", "Vault name"));

        var result = MainWindow.ParseCommandArguments(command, "push \"My Vault\"", out var error);

        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal("push", result!["direction"]);
        Assert.Equal("My Vault", result["vault"]);
    }

    [Fact]
    public void RejectsMoreValuesThanDeclaredArguments()
    {
        var command = Command(Text("direction", "Direction"));

        var result = MainWindow.ParseCommandArguments(command, "push extra", out var error);

        Assert.Null(result);
        Assert.Contains("at most 1", error);
    }

    [Fact]
    public void RejectsMissingRequiredValues()
    {
        var command = Command(Text("direction", "Direction", required: true));

        var result = MainWindow.ParseCommandArguments(command, "   ", out var error);

        Assert.Null(result);
        Assert.Contains("Missing value", error);
    }

    [Fact]
    public void RejectsDropdownValuesOutsideDeclaredData()
    {
        var command = Command(new CommandArgument
        {
            Name = "direction",
            Type = "dropdown",
            Placeholder = "Direction",
            Required = true,
            Data = [new PreferenceOption { Value = "push", Title = "Push" }],
        });

        var result = MainWindow.ParseCommandArguments(command, "sideways", out var error);

        Assert.Null(result);
        Assert.Contains("not a valid Direction", error);
        Assert.Contains("push", error);
    }

    [Fact]
    public void AcceptsDropdownValuesFromDeclaredData()
    {
        var command = Command(new CommandArgument
        {
            Name = "direction",
            Type = "dropdown",
            Placeholder = "Direction",
            Data = [new PreferenceOption { Value = "push", Title = "Push" }],
        });

        var result = MainWindow.ParseCommandArguments(command, "push", out var error);

        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal("push", result!["direction"]);
    }
}
