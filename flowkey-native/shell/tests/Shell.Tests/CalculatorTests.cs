using System.Globalization;
using System.IO;
using FlowKey.Shell.Search.Calculator;
using Xunit;

namespace FlowKey.Shell.Tests;

public class CalculatorTests : IDisposable
{
    private static readonly DateTime FixedNow = new(2026, 9, 23, 21, 30, 0);
    private readonly string directory;

    public CalculatorTests()
    {
        directory = Path.Combine(Path.GetTempPath(), "flowkey-calc-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(directory, true);
        }
        catch (IOException)
        {
        }
    }

    private CalculatorEvaluator Evaluator()
    {
        return new CalculatorEvaluator(directory, () => FixedNow, Rates());
    }

    private CurrencyRates Rates()
    {
        File.WriteAllText(
            Path.Combine(directory, "rates.json"),
            """{"fetchedAtUnixMs":1758660000000,"rates":{"USD":1,"JPY":150,"GBP":0.8,"EUR":0.9,"BRL":5}}""");
        return new CurrencyRates(directory);
    }

    [Theory]
    [InlineData("2+3*4", "14")]
    [InlineData("(2+3)*4", "20")]
    [InlineData("2^3^2", "512")]
    [InlineData("-3^2", "-9")]
    [InlineData("sqrt(625)", "25")]
    [InlineData("50%", "0.5")]
    [InlineData("2+2", "4")]
    public void EvaluatesArithmeticExpressions(string query, string expected)
    {
        var result = Evaluator().Evaluate(query);
        Assert.NotNull(result);
        Assert.Equal(expected, result!.Result);
    }

    [Fact]
    public void AppliesThousandScaleSuffixes()
    {
        var result = Evaluator().Evaluate("10k+5");
        Assert.NotNull(result);
        Assert.Equal(10005d.ToString("N0", CultureInfo.CurrentCulture), result!.Result);
    }

    [Theory]
    [InlineData("2x2", "4")]
    [InlineData("3x4x5", "60")]
    [InlineData("2X3", "6")]
    [InlineData("2×3", "6")]
    [InlineData("10÷4", "2.5")]
    [InlineData("2(3+4)", "14")]
    [InlineData("(1+2)(3+4)", "21")]
    public void EvaluatesImplicitMultiplication(string query, string expected)
    {
        var result = Evaluator().Evaluate(query);
        Assert.NotNull(result);
        Assert.Equal(expected, result!.Result);
    }

    [Fact]
    public void RejectsIncompleteExpressions()
    {
        Assert.Null(Evaluator().Evaluate("2+"));
        Assert.Null(Evaluator().Evaluate("sqrt("));
        Assert.Null(Evaluator().Evaluate("foo(1)"));
    }

    [Fact]
    public void SupportsFunctionsAndConstants()
    {
        Assert.True(ExpressionParser.TryEvaluate("abs(-5)", out var abs));
        Assert.Equal(5, abs);
        Assert.True(ExpressionParser.TryEvaluate("round(2.5)", out var rounded));
        Assert.Equal(3, rounded);
        Assert.True(ExpressionParser.TryEvaluate("log(100)", out var log));
        Assert.Equal(2, log);
        Assert.True(ExpressionParser.TryEvaluate("sin(0)", out var sin));
        Assert.Equal(0, sin);
        Assert.True(ExpressionParser.TryEvaluate("cosh(0)", out var cosh));
        Assert.Equal(1, cosh);
        Assert.True(ExpressionParser.TryEvaluate("pi", out var pi));
        Assert.Equal(Math.PI, pi, 10);
        Assert.False(ExpressionParser.TryEvaluate("acos(2)", out _));
    }

    [Theory]
    [InlineData("12% of 321", "38.52")]
    [InlineData("20% off 80", "64")]
    [InlineData("15% tip on 42", "48.3")]
    public void EvaluatesPercentagePhrases(string query, string expected)
    {
        var result = Evaluator().Evaluate(query);
        Assert.NotNull(result);
        Assert.Equal("Percentage", result!.ExpressionBadge);
        Assert.Equal(expected, result.Result);
    }

    [Fact]
    public void EvaluatesRatioPhrases()
    {
        var result = Evaluator().Evaluate("ratio of 3 to 5");
        Assert.NotNull(result);
        Assert.Equal("Ratio", result!.ExpressionBadge);
        Assert.Equal("0.6", result.Result);
    }

    [Fact]
    public void ConvertsMassBetweenKilogramsAndPounds()
    {
        var result = Evaluator().Evaluate("10kg in pound");
        Assert.NotNull(result);
        Assert.Equal("Kilograms", result!.ExpressionBadge);
        Assert.Equal("Pounds", result.ResultBadge);
        Assert.Equal("22.0462262185 lb", result.Result);
    }

    [Theory]
    [InlineData("10 ft in m", "3.048 m")]
    [InlineData("100c in f", "212 f")]
    [InlineData("100f in c", "37.7777777778 c")]
    [InlineData("90 min in h", "1.5 h")]
    [InlineData("1,000 kg in lb", "2204.62262185 lb")]
    public void ConvertsUnits(string query, string expected)
    {
        var result = Evaluator().Evaluate(query);
        Assert.NotNull(result);
        Assert.Equal(expected, result!.Result);
    }

    [Fact]
    public void ConvertsGigabytesToMegabytes()
    {
        var result = Evaluator().Evaluate("5gb in mb");
        Assert.NotNull(result);
        Assert.Equal(5000d.ToString("N0", CultureInfo.CurrentCulture) + " mb", result!.Result);
    }

    [Fact]
    public void RejectsCrossCategoryConversions()
    {
        Assert.Null(Evaluator().Evaluate("5kg in m"));
        Assert.Null(Evaluator().Evaluate("5gb in kg"));
    }

    [Fact]
    public void ConvertsCurrencyFromExplicitCodes()
    {
        var result = Evaluator().Evaluate("100 usd in gbp");
        Assert.NotNull(result);
        Assert.Equal("USD", result!.ExpressionBadge);
        Assert.Equal("£" + (80m).ToString("N0", CultureInfo.CurrentCulture), result.Result);
    }

    [Fact]
    public void ConvertsCurrencyFromSymbolWithPercent()
    {
        var result = Evaluator().Evaluate("12% of $321 in jpy");
        Assert.NotNull(result);
        Assert.Equal("Percentage", result!.ExpressionBadge);
        Assert.Equal("¥" + (5778m).ToString("N0", CultureInfo.CurrentCulture), result.Result);
        Assert.Equal("¥" + (5778m).ToString("N0", CultureInfo.CurrentCulture), result.CopyText);
    }

    [Fact]
    public void ConvertsSymbolAmountToZeroDecimalCurrency()
    {
        var result = Evaluator().Evaluate("$321 in jpy");
        Assert.NotNull(result);
        Assert.Equal("¥" + (48150m).ToString("N0", CultureInfo.CurrentCulture), result!.Result);
    }

    [Fact]
    public void KeepsDecimalsForNonZeroDecimalCurrencies()
    {
        var result = Evaluator().Evaluate("$10.10 in gbp");
        Assert.NotNull(result);
        Assert.Equal("£" + (8.08m).ToString("N2", CultureInfo.CurrentCulture), result!.Result);
    }

    [Fact]
    public void CurrencyQueriesWithoutRatesProduceNoCard()
    {
        var empty = new CurrencyRates(directory);
        var evaluator = new CalculatorEvaluator(directory, () => FixedNow, empty);
        Assert.Null(evaluator.Evaluate("100 usd in gbp"));
    }

    [Fact]
    public void CurrencyQueriesWithoutSourceCurrencyProduceNoCard()
    {
        Assert.Null(Evaluator().Evaluate("100 in gbp"));
    }

    [Fact]
    public void ReportsCurrentTimeAndDates()
    {
        var result = Evaluator().Evaluate("now");
        Assert.NotNull(result);
        Assert.Equal(FixedNow.ToString("h:mm tt", CultureInfo.CurrentCulture), result!.Result);

        var tomorrow = Evaluator().Evaluate("tomorrow");
        Assert.NotNull(tomorrow);
        Assert.Equal(FixedNow.AddDays(1).ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture), tomorrow!.Result);
    }

    [Fact]
    public void ResolvesTimeZonesByCityAndAirportCode()
    {
        var result = Evaluator().Evaluate("time in syd");
        Assert.NotNull(result);
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney");
        var expected = TimeZoneInfo.ConvertTime(FixedNow, zone);
        Assert.Equal(expected.ToString("h:mm tt", CultureInfo.CurrentCulture), result!.Result);
        Assert.Equal("Sydney, Australia", result.ExpressionBadge);
        Assert.True(result.ResultBadge is "AEST" or "AEDT");

        Assert.NotNull(Evaluator().Evaluate("time in sao paulo"));
        Assert.Null(Evaluator().Evaluate("time in nowhere"));
    }

    [Fact]
    public void ResolvesTimeZonesByCountryName()
    {
        foreach (var query in new[] { "time in brazil", "time in brasil", "time in australia", "time in usa" })
        {
            var result = Evaluator().Evaluate(query);
            Assert.NotNull(result);
        }
        var brazil = Evaluator().Evaluate("time in brazil");
        Assert.NotNull(brazil);
        Assert.Equal("São Paulo, Brazil", brazil!.ExpressionBadge);
    }

    [Fact]
    public void ResolvesTimeZonesWhileTypingAPrefix()
    {
        var result = Evaluator().Evaluate("time in braz");
        Assert.NotNull(result);
        Assert.Equal("São Paulo, Brazil", result!.ExpressionBadge);
    }

    [Fact]
    public void ConvertsCurrencyWithSymbolAfterTheAmount()
    {
        var result = Evaluator().Evaluate("100$ in brl");
        Assert.NotNull(result);
        Assert.Equal("USD", result!.ExpressionBadge);
        Assert.Equal("R$" + (500m).ToString("N0", CultureInfo.CurrentCulture), result.Result);
    }

    [Fact]
    public void ConvertsCurrencyBySpokenNames()
    {
        var euro = Evaluator().Evaluate("100 brl in euro");
        Assert.NotNull(euro);
        Assert.Equal("BRL", euro!.ExpressionBadge);
        var expected = "€" + (100m * 0.9m / 5m).ToString("N0", CultureInfo.CurrentCulture);
        Assert.Equal(expected, euro.Result);

        var dollars = Evaluator().Evaluate("100 reais in dollars");
        Assert.NotNull(dollars);
        Assert.Equal("BRL", dollars!.ExpressionBadge);
        Assert.Equal("$" + (20m).ToString("N0", CultureInfo.CurrentCulture), dollars.Result);
    }

    [Fact]
    public void CountsDaysUntilDates()
    {
        var result = Evaluator().Evaluate("days until 31 Dec");
        Assert.NotNull(result);
        Assert.Equal("99 days", result!.Result);

        var christmas = Evaluator().Evaluate("days until christmas");
        Assert.NotNull(christmas);
        Assert.Equal("93 days", christmas!.Result);
    }

    [Theory]
    [InlineData("3 days from now")]
    [InlineData("in 3 days")]
    [InlineData("2 weeks ago")]
    [InlineData("in 3 months")]
    public void EvaluatesRelativeDates(string query)
    {
        Assert.NotNull(Evaluator().Evaluate(query));
    }

    [Fact]
    public void RelativeDatesComputeTheRightDay()
    {
        var result = Evaluator().Evaluate("3 days from now");
        Assert.NotNull(result);
        Assert.Equal(FixedNow.AddDays(3).ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture), result!.Result);
        Assert.Equal("Saturday", FixedNow.AddDays(3).ToString("dddd", CultureInfo.CurrentCulture));
    }

    [Fact]
    public void NonCalculatorQueriesProduceNoCard()
    {
        Assert.Null(Evaluator().Evaluate("spotify"));
        Assert.Null(Evaluator().Evaluate("hello world"));
        Assert.Null(Evaluator().Evaluate("2"));
        Assert.Null(Evaluator().Evaluate(""));
    }

    [Fact]
    public void CopyTextMatchesTheResult()
    {
        var result = Evaluator().Evaluate("2+3*4");
        Assert.NotNull(result);
        Assert.Equal(result!.Result, result.CopyText);
        var row = CalculatorRow.From(result);
        Assert.Equal(result.Result, row.CopyText);
        Assert.Equal(result.ExpressionBadge, row.ExpressionBadge);
    }
}
