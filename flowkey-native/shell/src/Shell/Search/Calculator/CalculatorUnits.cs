using System.Globalization;

namespace FlowKey.Shell.Search.Calculator;

public sealed record UnitInfo(string Canonical, string DisplayName, string Category, double ToBase, bool OffsetScale = false);

public static class CalculatorUnits
{
    private static readonly Dictionary<string, UnitInfo> Units = Build();

    private static Dictionary<string, UnitInfo> Build()
    {
        var map = new Dictionary<string, UnitInfo>(StringComparer.OrdinalIgnoreCase);
        void Add(UnitInfo unit, params string[] aliases)
        {
            map[unit.Canonical] = unit;
            foreach (var alias in aliases)
            {
                map[alias] = unit;
            }
        }

        Add(new UnitInfo("m", "Meters", "Length", 1), "meter", "meters", "metre", "metres");
        Add(new UnitInfo("km", "Kilometers", "Length", 1000), "kilometer", "kilometers", "kilometre", "kilometres");
        Add(new UnitInfo("cm", "Centimeters", "Length", 0.01), "centimeter", "centimeters");
        Add(new UnitInfo("mm", "Millimeters", "Length", 0.001), "millimeter", "millimeters");
        Add(new UnitInfo("mi", "Miles", "Length", 1609.344), "mile", "miles");
        Add(new UnitInfo("ft", "Feet", "Length", 0.3048), "foot", "feet");
        Add(new UnitInfo("in", "Inches", "Length", 0.0254), "inch", "inches");
        Add(new UnitInfo("yd", "Yards", "Length", 0.9144), "yard", "yards");
        Add(new UnitInfo("nmi", "Nautical miles", "Length", 1852), "nauticalmile", "nauticalmiles");

        Add(new UnitInfo("g", "Grams", "Mass", 1), "gram", "grams");
        Add(new UnitInfo("kg", "Kilograms", "Mass", 1000), "kilo", "kilos", "kilogram", "kilograms");
        Add(new UnitInfo("mg", "Milligrams", "Mass", 0.001), "milligram", "milligrams");
        Add(new UnitInfo("t", "Tonnes", "Mass", 1_000_000), "tonne", "tonnes", "metricton", "metrictons");
        Add(new UnitInfo("lb", "Pounds", "Mass", 453.59237), "lbs", "pound", "pounds");
        Add(new UnitInfo("oz", "Ounces", "Mass", 28.349523125), "ounce", "ounces");
        Add(new UnitInfo("st", "Stones", "Mass", 6350.29318), "stone", "stones");

        Add(new UnitInfo("c", "Celsius", "Temperature", 1, true), "celsius", "°c");
        Add(new UnitInfo("f", "Fahrenheit", "Temperature", 1, true), "fahrenheit", "°f");
        Add(new UnitInfo("k", "Kelvin", "Temperature", 1, true), "kelvin", "kelvins");

        Add(new UnitInfo("b", "Bytes", "Data", 1), "byte", "bytes");
        Add(new UnitInfo("kb", "Kilobytes", "Data", 1e3), "kilobyte", "kilobytes");
        Add(new UnitInfo("mb", "Megabytes", "Data", 1e6), "megabyte", "megabytes");
        Add(new UnitInfo("gb", "Gigabytes", "Data", 1e9), "gigabyte", "gigabytes");
        Add(new UnitInfo("tb", "Terabytes", "Data", 1e12), "terabyte", "terabytes");
        Add(new UnitInfo("kib", "Kibibytes", "Data", 1024), "kibibyte", "kibibytes");
        Add(new UnitInfo("mib", "Mebibytes", "Data", 1024 * 1024), "mebibyte", "mebibytes");
        Add(new UnitInfo("gib", "Gibibytes", "Data", 1024 * 1024 * 1024), "gibibyte", "gibibytes");
        Add(new UnitInfo("tib", "Tebibytes", "Data", 1024L * 1024 * 1024 * 1024), "tebibyte", "tebibytes");
        Add(new UnitInfo("bit", "Bits", "Data", 1.0 / 8), "bits");

        Add(new UnitInfo("s", "Seconds", "Duration", 1), "second", "seconds", "sec", "secs");
        Add(new UnitInfo("min", "Minutes", "Duration", 60), "minute", "minutes", "mins");
        Add(new UnitInfo("h", "Hours", "Duration", 3600), "hour", "hours", "hr", "hrs");
        Add(new UnitInfo("day", "Days", "Duration", 86400), "days");
        Add(new UnitInfo("week", "Weeks", "Duration", 604800), "weeks");
        Add(new UnitInfo("month", "Months", "Duration", 2_629_800), "months");
        Add(new UnitInfo("year", "Years", "Duration", 31_557_600), "years");

        Add(new UnitInfo("l", "Liters", "Volume", 1), "liter", "liters", "litre", "litres");
        Add(new UnitInfo("ml", "Milliliters", "Volume", 0.001), "milliliter", "milliliters", "millilitre", "millilitres");
        Add(new UnitInfo("gal", "Gallons", "Volume", 3.785411784), "gallon", "gallons");
        Add(new UnitInfo("qt", "Quarts", "Volume", 0.946352946), "quart", "quarts");
        Add(new UnitInfo("pt", "Pints", "Volume", 0.473176473), "pint", "pints");
        Add(new UnitInfo("cup", "Cups", "Volume", 0.2365882365), "cups");
        Add(new UnitInfo("floz", "Fluid ounces", "Volume", 0.0295735295625), "fluidounce", "fluidounces");

        Add(new UnitInfo("m2", "Square meters", "Area", 1), "sqm", "squaremeter", "squaremeters", "squaremetre", "squaremetres");
        Add(new UnitInfo("km2", "Square kilometers", "Area", 1e6), "sqkm", "squarekilometer", "squarekilometers");
        Add(new UnitInfo("ft2", "Square feet", "Area", 0.09290304), "sqft", "squarefoot", "squarefeet");
        Add(new UnitInfo("mi2", "Square miles", "Area", 2_589_988.110336), "sqmi", "squaremile", "squaremiles");
        Add(new UnitInfo("ha", "Hectares", "Area", 10_000), "hectare", "hectares");
        Add(new UnitInfo("acre", "Acres", "Area", 4046.8564224), "acres");

        Add(new UnitInfo("kmh", "Kilometers per hour", "Speed", 1), "kph", "km/h");
        Add(new UnitInfo("mph", "Miles per hour", "Speed", 1.609344), "mi/h");
        Add(new UnitInfo("ms", "Meters per second", "Speed", 3.6), "m/s");
        Add(new UnitInfo("kn", "Knots", "Speed", 1.852), "knot", "knots");
        return map;
    }

    public static bool IsTemperature(UnitInfo unit) => unit.Category == "Temperature";

    public static double ToBase(UnitInfo unit, double value)
    {
        if (!unit.OffsetScale)
        {
            return value * unit.ToBase;
        }
        return unit.Canonical switch
        {
            "c" => value,
            "f" => (value - 32) * 5 / 9,
            "k" => value - 273.15,
            _ => value,
        };
    }

    public static double FromBase(UnitInfo unit, double celsius)
    {
        if (!unit.OffsetScale)
        {
            return celsius / unit.ToBase;
        }
        return unit.Canonical switch
        {
            "c" => celsius,
            "f" => celsius * 9 / 5 + 32,
            "k" => celsius + 273.15,
            _ => celsius,
        };
    }

    public static bool TryParse(string text, out UnitInfo unit)
    {
        unit = Units.GetValueOrDefault(text.Trim());
        return unit is not null;
    }

    public static bool TryConvert(string query, out double value, out UnitInfo source, out UnitInfo target)
    {
        value = 0;
        source = null!;
        target = null!;
        var parts = query.Split([' ', '\t'], StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length is < 3 or > 4)
        {
            return false;
        }
        var connector = parts.Length == 3 ? parts[1] : parts[2];
        if (!connector.Equals("in", StringComparison.OrdinalIgnoreCase)
            && !connector.Equals("to", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        var targetText = parts[^1];
        if (!TryParse(targetText, out target))
        {
            return false;
        }
        var numberAndUnit = parts.Length == 3 ? parts[0] : parts[0] + " " + parts[1];
        var numberEnd = 0;
        while (numberEnd < numberAndUnit.Length
            && (char.IsDigit(numberAndUnit[numberEnd]) || numberAndUnit[numberEnd] == '.' || numberAndUnit[numberEnd] == ','))
        {
            numberEnd++;
        }
        if (numberEnd == 0)
        {
            return false;
        }
        if (!double.TryParse(numberAndUnit[..numberEnd].Replace(",", ""), CultureInfo.InvariantCulture, out value))
        {
            return false;
        }
        if (!TryParse(numberAndUnit[numberEnd..].Trim(), out source))
        {
            return false;
        }
        return source.Category == target.Category;
    }

    public static string FormatValue(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return value.ToString(CultureInfo.CurrentCulture);
        }
        var rounded = Math.Round(value, 10);
        if (rounded == Math.Floor(rounded) && Math.Abs(rounded) < 1e15)
        {
            return rounded.ToString("N0", CultureInfo.CurrentCulture);
        }
        var text = rounded.ToString("G12", CultureInfo.InvariantCulture);
        return text;
    }
}
