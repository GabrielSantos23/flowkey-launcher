using System.Globalization;

namespace FlowKey.Shell.Search.Calculator;

public sealed class CalculatorEvaluator
{
    private static readonly (string Symbol, string Code)[] Symbols =
    [
        ("R$", "BRL"),
        ("$", "USD"),
        ("€", "EUR"),
        ("£", "GBP"),
        ("¥", "JPY"),
        ("₹", "INR"),
        ("₩", "KRW"),
        ("₺", "TRY"),
        ("₪", "ILS"),
        ("zł", "PLN"),
        ("฿", "THB"),
        ("₱", "PHP"),
    ];

    private static readonly Dictionary<string, string> DisplaySymbols = new(StringComparer.OrdinalIgnoreCase)
    {
        ["USD"] = "$",
        ["EUR"] = "€",
        ["GBP"] = "£",
        ["JPY"] = "¥",
        ["CNY"] = "CN¥",
        ["KRW"] = "₩",
        ["INR"] = "₹",
        ["BRL"] = "R$",
        ["TRY"] = "₺",
        ["ILS"] = "₪",
        ["PLN"] = "zł",
        ["THB"] = "฿",
        ["PHP"] = "₱",
        ["AUD"] = "A$",
        ["CAD"] = "C$",
        ["NZD"] = "NZ$",
        ["HKD"] = "HK$",
        ["SGD"] = "S$",
        ["MXN"] = "MX$",
        ["SEK"] = "kr",
        ["NOK"] = "kr",
        ["DKK"] = "kr",
        ["ISK"] = "kr",
        ["CZK"] = "Kč",
        ["HUF"] = "Ft",
        ["RON"] = "lei",
        ["IDR"] = "Rp",
        ["MYR"] = "RM",
    };

    private static readonly HashSet<string> ZeroDecimalCurrencies = new(StringComparer.OrdinalIgnoreCase)
    {
        "JPY",
        "KRW",
        "ISK",
        "CLP",
        "VND",
    };

    private static readonly Dictionary<string, string> CurrencyNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["dollar"] = "USD",
        ["dollars"] = "USD",
        ["euro"] = "EUR",
        ["euros"] = "EUR",
        ["real"] = "BRL",
        ["reais"] = "BRL",
        ["pound"] = "GBP",
        ["pounds"] = "GBP",
        ["sterling"] = "GBP",
        ["yen"] = "JPY",
        ["yuan"] = "CNY",
        ["renminbi"] = "CNY",
        ["won"] = "KRW",
        ["rupee"] = "INR",
        ["rupees"] = "INR",
        ["peso"] = "MXN",
        ["pesos"] = "MXN",
        ["franc"] = "CHF",
        ["francs"] = "CHF",
        ["krona"] = "SEK",
        ["kronor"] = "SEK",
        ["krone"] = "NOK",
        ["kroner"] = "NOK",
        ["koruna"] = "CZK",
        ["forint"] = "HUF",
        ["zloty"] = "PLN",
        ["zlotys"] = "PLN",
        ["leu"] = "RON",
        ["lev"] = "BGN",
        ["lira"] = "TRY",
        ["shekel"] = "ILS",
        ["shekels"] = "ILS",
        ["rand"] = "ZAR",
        ["rupiah"] = "IDR",
        ["baht"] = "THB",
        ["dong"] = "VND",
        ["ringgit"] = "MYR",
        ["aussie"] = "AUD",
        ["aussiedollar"] = "AUD",
        ["loonie"] = "CAD",
        ["kiwi"] = "NZD",
        ["singaporedollar"] = "SGD",
        ["hongkongdollar"] = "HKD",
    };

    private static string? ResolveCurrencyWord(string word)
    {
        var normalized = word.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }
        if (normalized.Length == 3 && normalized.All(char.IsLetter))
        {
            return normalized.ToUpperInvariant();
        }
        if (CurrencyNames.TryGetValue(normalized, out var byExact))
        {
            return byExact;
        }
        if (normalized.EndsWith('s') && CurrencyNames.TryGetValue(normalized[..^1], out var bySingular))
        {
            return bySingular;
        }
        return null;
    }

    private readonly CurrencyRates rates;
    private readonly Func<DateTime> clock;

    public event Action? RatesUpdated;

    public CalculatorEvaluator(string dataDirectory, Func<DateTime>? clock = null, CurrencyRates? rates = null)
    {
        this.clock = clock ?? (() => DateTime.Now);
        this.rates = rates ?? new CurrencyRates(dataDirectory);
        this.rates.Updated += () => RatesUpdated?.Invoke();
    }

    public CalculatorResult? Evaluate(string query)
    {
        var trimmed = query.Trim();
        if (trimmed.Length < 2 || trimmed.Contains('\n'))
        {
            return null;
        }
        var currency = TryCurrency(trimmed);
        if (currency is not null)
        {
            return currency;
        }
        var dates = TryDates(trimmed);
        if (dates is not null)
        {
            return dates;
        }
        var units = TryUnits(trimmed);
        if (units is not null)
        {
            return units;
        }
        var percent = TryPercent(trimmed);
        if (percent is not null)
        {
            return percent;
        }
        return TryMath(trimmed);
    }

    private CalculatorResult? TryDates(string query)
    {
        if (!CalculatorDates.TryEvaluate(query, clock, out var badge, out var result, out var resultBadge, out _))
        {
            return null;
        }
        return new CalculatorResult(query, badge, result, resultBadge, result);
    }

    private CalculatorResult? TryUnits(string query)
    {
        if (!CalculatorUnits.TryConvert(query, out var value, out var source, out var target))
        {
            return null;
        }
        var converted = CalculatorUnits.FromBase(target, CalculatorUnits.ToBase(source, value));
        var text = CalculatorUnits.FormatValue(converted) + " " + target.Canonical;
        return new CalculatorResult(query, source.DisplayName, text, target.DisplayName, text);
    }

    private CalculatorResult? TryMath(string query)
    {
        if (!query.Any(char.IsDigit) || !ExpressionParser.TryEvaluate(query, out var value))
        {
            return null;
        }
        var text = FormatNumber(value);
        return new CalculatorResult(query, "Calculation", text, "Result", text);
    }

    private CalculatorResult? TryPercent(string query)
    {
        var normalized = query.Trim();
        if (normalized.StartsWith("ratio of ", StringComparison.OrdinalIgnoreCase))
        {
            return TryRatio(normalized[9..].Trim(), normalized);
        }
        if (!TryPercentParts(normalized, out var percent, out var mode, out var amountText, out var leftBadge))
        {
            return null;
        }
        if (!TryParseAmount(amountText, out var amount, out _))
        {
            return null;
        }
        var value = ApplyPercent(amount, percent, mode);
        var text = FormatNumber((double)value);
        return new CalculatorResult(normalized, leftBadge, text, "Result", text);
    }

    private static CalculatorResult? TryRatio(string tail, string expression)
    {
        var parts = tail.Split(" to ");
        if (parts.Length != 2
            || !decimal.TryParse(parts[0].Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var left)
            || !decimal.TryParse(parts[1].Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var right)
            || right == 0)
        {
            return null;
        }
        var text = FormatNumber((double)(left / right));
        return new CalculatorResult(expression, "Ratio", text, "Result", text);
    }

    private CalculatorResult? TryCurrency(string query)
    {
        var splitIndex = LastCurrencySeparator(query);
        if (splitIndex < 0)
        {
            return null;
        }
        var target = ResolveCurrencyWord(query[(splitIndex + 4)..]);
        if (target is null)
        {
            return null;
        }
        var left = query[..splitIndex].Trim();
        if (TryPercentParts(left, out var percent, out var mode, out var amountText, out var leftBadge))
        {
            if (!TryParseAmount(amountText, out var amount, out var source) || source.Length == 0)
            {
                return null;
            }
            var value = ApplyPercent(amount, percent, mode);
            var converted = ConvertMoney(value, source, target);
            if (converted is null)
            {
                return null;
            }
            var text = FormatMoney(converted.Value, target);
            return new CalculatorResult(query, leftBadge, text, "Result", text);
        }
        if (!TryParseAmount(left, out var plainAmount, out var plainSource) || plainSource.Length == 0)
        {
            return null;
        }
        var plainConverted = ConvertMoney(plainAmount, plainSource, target);
        if (plainConverted is null)
        {
            return null;
        }
        var plainText = FormatMoney(plainConverted.Value, target);
        return new CalculatorResult(query, plainSource, plainText, "Result", plainText);
    }

    private decimal? ConvertMoney(decimal amount, string source, string target)
    {
        rates.EnsureFresh();
        if (!rates.TryGetRate(source, out var sourceRate) || !rates.TryGetRate(target, out var targetRate))
        {
            return null;
        }
        return amount * targetRate / sourceRate;
    }

    private static bool TryPercentParts(string text, out decimal percent, out string mode, out string amountText, out string badge)
    {
        percent = 0;
        mode = "of";
        amountText = "";
        badge = "";
        var normalized = text.Trim();
        var percentIndex = normalized.IndexOf('%');
        if (percentIndex <= 0)
        {
            return false;
        }
        if (!decimal.TryParse(normalized[..percentIndex].Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out percent))
        {
            return false;
        }
        var remainder = normalized[(percentIndex + 1)..].TrimStart();
        if (remainder.StartsWith("of ", StringComparison.OrdinalIgnoreCase))
        {
            mode = "of";
            amountText = remainder[3..].Trim();
        }
        else if (remainder.StartsWith("off ", StringComparison.OrdinalIgnoreCase))
        {
            mode = "off";
            amountText = remainder[4..].Trim();
        }
        else if (remainder.StartsWith("tip on ", StringComparison.OrdinalIgnoreCase))
        {
            mode = "tip";
            amountText = remainder[7..].Trim();
        }
        else
        {
            return false;
        }
        badge = "Percentage";
        return amountText.Length > 0;
    }

    private static decimal ApplyPercent(decimal amount, decimal percent, string mode)
    {
        return mode switch
        {
            "off" => amount * (1 - percent / 100),
            "tip" => amount * (1 + percent / 100),
            _ => amount * percent / 100,
        };
    }

    private static int LastCurrencySeparator(string query)
    {
        var inIndex = query.LastIndexOf(" in ", StringComparison.OrdinalIgnoreCase);
        var toIndex = query.LastIndexOf(" to ", StringComparison.OrdinalIgnoreCase);
        return Math.Max(inIndex, toIndex);
    }

    private static bool TryParseAmount(string text, out decimal value, out string currency)
    {
        value = 0;
        currency = "";
        var normalized = text.Trim();
        if (normalized.Length == 0)
        {
            return false;
        }
        foreach (var (symbol, code) in Symbols)
        {
            if (normalized.StartsWith(symbol, StringComparison.Ordinal))
            {
                currency = code;
                normalized = normalized[symbol.Length..].Trim();
                break;
            }
        }
        if (currency.Length == 0)
        {
            foreach (var (symbol, code) in Symbols)
            {
                if (normalized.EndsWith(symbol, StringComparison.Ordinal))
                {
                    currency = code;
                    normalized = normalized[..^symbol.Length].Trim();
                    break;
                }
            }
        }
        if (currency.Length == 0)
        {
            var spaceIndex = normalized.LastIndexOf(' ');
            if (spaceIndex > 0)
            {
                var candidate = normalized[(spaceIndex + 1)..].Trim();
                var resolved = ResolveCurrencyWord(candidate);
                if (resolved is not null)
                {
                    currency = resolved;
                    normalized = normalized[..spaceIndex].Trim();
                }
            }
        }
        var scale = 1m;
        if (normalized.Length > 1)
        {
            var last = normalized[^1];
            if (last is 'k' or 'K')
            {
                scale = 1_000m;
                normalized = normalized[..^1];
            }
            else if (last == 'M')
            {
                scale = 1_000_000m;
                normalized = normalized[..^1];
            }
            else if (last is 'b' or 'B')
            {
                scale = 1_000_000_000m;
                normalized = normalized[..^1];
            }
        }
        if (!decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out value))
        {
            return false;
        }
        value *= scale;
        return true;
    }

    private static string FormatMoney(decimal value, string currency)
    {
        var symbol = DisplaySymbols.TryGetValue(currency, out var known) ? known : currency;
        var decimals = ZeroDecimalCurrencies.Contains(currency)
            ? 0
            : decimal.Round(value, 2) == decimal.Floor(value) ? 0 : 2;
        return symbol + value.ToString($"N{decimals}", CultureInfo.CurrentCulture);
    }

    private static string FormatNumber(double value)
    {
        if (Math.Abs(value) < 1e15 && value == Math.Floor(value))
        {
            return value.ToString("N0", CultureInfo.CurrentCulture);
        }
        return Math.Round(value, 10).ToString("G10", CultureInfo.InvariantCulture);
    }
}
