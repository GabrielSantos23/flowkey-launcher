using FlowKey.Shell.Sidecar;

namespace FlowKey.Shell.Search.Calculator;

public sealed record CalculatorResult(
    string Expression,
    string ExpressionBadge,
    string Result,
    string ResultBadge,
    string CopyText);

public sealed class CalculatorRow : UiRow
{
    public const string CopyAnswerActionId = "__copyanswer__";

    public string Expression { get; init; } = "";
    public string ExpressionBadge { get; init; } = "";
    public string Result { get; init; } = "";
    public string ResultBadge { get; init; } = "";
    public string CopyText { get; init; } = "";

    public static CalculatorRow From(CalculatorResult result)
    {
        return new CalculatorRow
        {
            Expression = result.Expression,
            ExpressionBadge = result.ExpressionBadge,
            Result = result.Result,
            ResultBadge = result.ResultBadge,
            CopyText = result.CopyText,
        };
    }
}
