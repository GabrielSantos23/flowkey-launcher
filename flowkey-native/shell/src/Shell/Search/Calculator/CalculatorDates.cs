using System.Globalization;

namespace FlowKey.Shell.Search.Calculator;

public sealed record TimeZonePlace(string DisplayName, string IanaId, string AbbrevStandard, string AbbrevDaylight, string[] Aliases);

public static class CalculatorDates
{
    private static readonly TimeZonePlace[] Places =
    [
        new("Sydney, Australia", "Australia/Sydney", "AEST", "AEDT", ["sydney", "syd", "australia", "aussie"]),
        new("Melbourne, Australia", "Australia/Melbourne", "AEST", "AEDT", ["melbourne", "mel"]),
        new("Brisbane, Australia", "Australia/Brisbane", "AEST", "AEST", ["brisbane", "bne"]),
        new("Perth, Australia", "Australia/Perth", "AWST", "AWST", ["perth", "per"]),
        new("Auckland, New Zealand", "Pacific/Auckland", "NZST", "NZDT", ["auckland", "akl", "new zealand"]),
        new("Tokyo, Japan", "Asia/Tokyo", "JST", "JST", ["tokyo", "tyo", "japan"]),
        new("Seoul, South Korea", "Asia/Seoul", "KST", "KST", ["seoul", "icn", "south korea", "korea"]),
        new("Singapore", "Asia/Singapore", "SGT", "SGT", ["singapore", "sin"]),
        new("Hong Kong", "Asia/Hong_Kong", "HKT", "HKT", ["hong kong", "hkg"]),
        new("Shanghai, China", "Asia/Shanghai", "CST", "CST", ["shanghai", "pvg", "china"]),
        new("Beijing, China", "Asia/Shanghai", "CST", "CST", ["beijing", "pek"]),
        new("Taipei, Taiwan", "Asia/Taipei", "CST", "CST", ["taipei", "tpe", "taiwan"]),
        new("Bangkok, Thailand", "Asia/Bangkok", "ICT", "ICT", ["bangkok", "bkk", "thailand"]),
        new("Jakarta, Indonesia", "Asia/Jakarta", "WIB", "WIB", ["jakarta", "cgk", "indonesia"]),
        new("Manila, Philippines", "Asia/Manila", "PHT", "PHT", ["manila", "mnl", "philippines"]),
        new("Kuala Lumpur, Malaysia", "Asia/Kuala_Lumpur", "MYT", "MYT", ["kuala lumpur", "kul", "malaysia"]),
        new("Mumbai, India", "Asia/Kolkata", "IST", "IST", ["mumbai", "bom", "india"]),
        new("New Delhi, India", "Asia/Kolkata", "IST", "IST", ["delhi", "new delhi", "del"]),
        new("Dubai, UAE", "Asia/Dubai", "GST", "GST", ["dubai", "dxb", "uae"]),
        new("Tel Aviv, Israel", "Asia/Jerusalem", "IST", "IDT", ["tel aviv", "tlv", "israel"]),
        new("Istanbul, Türkiye", "Europe/Istanbul", "TRT", "TRT", ["istanbul", "ist", "turkey"]),
        new("Moscow, Russia", "Europe/Moscow", "MSK", "MSK", ["moscow", "mow", "russia"]),
        new("Athens, Greece", "Europe/Athens", "EET", "EEST", ["athens", "ath", "greece"]),
        new("Helsinki, Finland", "Europe/Helsinki", "EET", "EEST", ["helsinki", "hel", "finland"]),
        new("Stockholm, Sweden", "Europe/Stockholm", "CET", "CEST", ["stockholm", "arn", "sweden"]),
        new("Oslo, Norway", "Europe/Oslo", "CET", "CEST", ["oslo", "osl", "norway"]),
        new("Copenhagen, Denmark", "Europe/Copenhagen", "CET", "CEST", ["copenhagen", "cph", "denmark"]),
        new("Berlin, Germany", "Europe/Berlin", "CET", "CEST", ["berlin", "munich", "frankfurt", "germany"]),
        new("Zurich, Switzerland", "Europe/Zurich", "CET", "CEST", ["zurich", "zrh", "switzerland"]),
        new("Madrid, Spain", "Europe/Madrid", "CET", "CEST", ["madrid", "barcelona", "spain"]),
        new("Lisbon, Portugal", "Europe/Lisbon", "WET", "WEST", ["lisbon", "lis", "portugal"]),
        new("Rome, Italy", "Europe/Rome", "CET", "CEST", ["rome", "milan", "italy"]),
        new("Amsterdam, Netherlands", "Europe/Amsterdam", "CET", "CEST", ["amsterdam", "ams", "netherlands"]),
        new("Brussels, Belgium", "Europe/Brussels", "CET", "CEST", ["brussels", "bru", "belgium"]),
        new("Paris, France", "Europe/Paris", "CET", "CEST", ["paris", "cdg", "france"]),
        new("London, United Kingdom", "Europe/London", "GMT", "BST", ["london", "lon", "lhr", "uk", "united kingdom", "england"]),
        new("Dublin, Ireland", "Europe/Dublin", "GMT", "IST", ["dublin", "dub", "ireland"]),
        new("Warsaw, Poland", "Europe/Warsaw", "CET", "CEST", ["warsaw", "waw", "poland"]),
        new("Prague, Czechia", "Europe/Prague", "CET", "CEST", ["prague", "prg", "czechia", "czech republic"]),
        new("Vienna, Austria", "Europe/Vienna", "CET", "CEST", ["vienna", "vie", "austria"]),
        new("Budapest, Hungary", "Europe/Budapest", "CET", "CEST", ["budapest", "bud", "hungary"]),
        new("Bucharest, Romania", "Europe/Bucharest", "EET", "EEST", ["bucharest", "otpen", "romania"]),
        new("Kyiv, Ukraine", "Europe/Kyiv", "EET", "EEST", ["kyiv", "kiev", "ukraine"]),
        new("Reykjavik, Iceland", "Atlantic/Reykjavik", "GMT", "GMT", ["reykjavik", "kef", "iceland"]),
        new("Cape Town, South Africa", "Africa/Johannesburg", "SAST", "SAST", ["cape town", "johannesburg", "south africa"]),
        new("Nairobi, Kenya", "Africa/Nairobi", "EAT", "EAT", ["nairobi", "kenya"]),
        new("Lagos, Nigeria", "Africa/Lagos", "WAT", "WAT", ["lagos", "nigeria"]),
        new("Cairo, Egypt", "Africa/Cairo", "EET", "EEST", ["cairo", "egypt"]),
        new("Buenos Aires, Argentina", "America/Argentina/Buenos_Aires", "ART", "ART", ["buenos aires", "eze", "argentina"]),
        new("Santiago, Chile", "America/Santiago", "CLT", "CLST", ["santiago", "scl", "chile"]),
        new("Lima, Peru", "America/Lima", "PET", "PET", ["lima", "peru"]),
        new("Bogotá, Colombia", "America/Bogota", "COT", "COT", ["bogota", "bog", "colombia"]),
        new("Mexico City, Mexico", "America/Mexico_City", "CST", "CST", ["mexico city", "mex", "mexico"]),
        new("Caracas, Venezuela", "America/Caracas", "VET", "VET", ["caracas", "venezuela"]),
        new("São Paulo, Brazil", "America/Sao_Paulo", "BRT", "BRST", ["sao paulo", "são paulo", "sao", "gru", "sp", "brazil", "brasil", "bra"]),
        new("Rio de Janeiro, Brazil", "America/Sao_Paulo", "BRT", "BRST", ["rio de janeiro", "rio", "gig", "rj"]),
        new("Brasília, Brazil", "America/Sao_Paulo", "BRT", "BRST", ["brasilia", "brasília", "bsb"]),
        new("Belo Horizonte, Brazil", "America/Sao_Paulo", "BRT", "BRST", ["belo horizonte", "cnf", "bh"]),
        new("Salvador, Brazil", "America/Bahia", "BRT", "BRT", ["salvador", "ssa"]),
        new("Recife, Brazil", "America/Recife", "BRT", "BRT", ["recife", "rec"]),
        new("Fortaleza, Brazil", "America/Fortaleza", "BRT", "BRT", ["fortaleza", "for"]),
        new("Manaus, Brazil", "America/Manaus", "AMT", "AMT", ["manaus", "mao"]),
        new("New York, United States", "America/New_York", "EST", "EDT", ["new york", "nyc", "ny", "jfk", "ewr", "lga", "united states", "us", "usa", "u.s.", "usa", "america"]),
        new("Boston, United States", "America/New_York", "EST", "EDT", ["boston", "bos"]),
        new("Washington, United States", "America/New_York", "EST", "EDT", ["washington", "iad", "dca"]),
        new("Miami, United States", "America/New_York", "EST", "EDT", ["miami", "mia"]),
        new("Atlanta, United States", "America/New_York", "EST", "EDT", ["atlanta", "atl"]),
        new("Toronto, Canada", "America/Toronto", "EST", "EDT", ["toronto", "yyz", "canada"]),
        new("Montreal, Canada", "America/Toronto", "EST", "EDT", ["montreal", "yul"]),
        new("Vancouver, Canada", "America/Vancouver", "PST", "PDT", ["vancouver", "yvr"]),
        new("Chicago, United States", "America/Chicago", "CST", "CDT", ["chicago", "ord", "mdw"]),
        new("Dallas, United States", "America/Chicago", "CST", "CDT", ["dallas", "dfw", "houston", "iah"]),
        new("Denver, United States", "America/Denver", "MST", "MDT", ["denver", "phoenix", "phx", "arizona"]),
        new("Los Angeles, United States", "America/Los_Angeles", "PST", "PDT", ["los angeles", "la", "lax", "california"]),
        new("San Francisco, United States", "America/Los_Angeles", "PST", "PDT", ["san francisco", "sf", "sfo", "sjc", "san jose"]),
        new("Seattle, United States", "America/Los_Angeles", "PST", "PDT", ["seattle", "sea"]),
        new("Las Vegas, United States", "America/Los_Angeles", "PST", "PDT", ["las vegas", "las"]),
        new("Honolulu, United States", "Pacific/Honolulu", "HST", "HST", ["honolulu", "hnl", "hawaii"]),
        new("Anchorage, United States", "America/Anchorage", "AKST", "AKDT", ["anchorage", "anc", "alaska"]),
    ];

    private static readonly Dictionary<string, (int Month, int Day)> NamedDates = new(StringComparer.OrdinalIgnoreCase)
    {
        ["christmas"] = (12, 25),
        ["new year"] = (1, 1),
        ["halloween"] = (10, 31),
        ["valentines"] = (2, 14),
        ["valentine"] = (2, 14),
    };

    public static TimeZonePlace? FindPlace(string query)
    {
        var normalized = query.Trim().ToLowerInvariant();
        foreach (var place in Places)
        {
            if (place.Aliases.Any(alias => alias == normalized))
            {
                return place;
            }
        }
        foreach (var place in Places)
        {
            var name = place.DisplayName.ToLowerInvariant();
            if (name.StartsWith(normalized + ",") || name == normalized)
            {
                return place;
            }
        }
        foreach (var place in Places)
        {
            if (place.Aliases.Any(alias => alias.StartsWith(normalized, StringComparison.Ordinal)))
            {
                return place;
            }
        }
        return null;
    }

    public static bool TryEvaluate(
        string query,
        Func<DateTime> clock,
        out string expressionBadge,
        out string result,
        out string resultBadge,
        out bool isTimeZone)
    {
        expressionBadge = "";
        result = "";
        resultBadge = "";
        isTimeZone = false;
        var normalized = query.Trim().ToLowerInvariant();
        var now = clock();

        if (normalized is "now" or "time")
        {
            expressionBadge = "Now";
            result = now.ToString("h:mm tt", CultureInfo.CurrentCulture);
            resultBadge = "Local time";
            return true;
        }
        if (normalized == "today")
        {
            expressionBadge = "Today";
            result = now.ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture);
            resultBadge = "Date";
            return true;
        }
        if (normalized == "tomorrow" || normalized == "yesterday")
        {
            var day = normalized == "tomorrow" ? now.AddDays(1) : now.AddDays(-1);
            expressionBadge = normalized == "tomorrow" ? "Tomorrow" : "Yesterday";
            result = day.ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture);
            resultBadge = "Date";
            return true;
        }

        if (TryRelative(normalized, now, out var relativeWhen, out var relativeBadge))
        {
            expressionBadge = relativeBadge;
            result = relativeWhen.Date == relativeWhen
                ? relativeWhen.ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture)
                : relativeWhen.ToString("dddd, dd MMMM yyyy h:mm tt", CultureInfo.CurrentCulture);
            resultBadge = relativeWhen.Date == relativeWhen ? "Date" : "Local time";
            return true;
        }

        if (normalized.StartsWith("days until ", StringComparison.Ordinal)
            && TryParseDate(normalized["days until ".Length..], now, out var target))
        {
            while (target.Date < now.Date)
            {
                target = target.AddYears(1);
            }
            var days = (target.Date - now.Date).Days;
            expressionBadge = target.ToString("dddd, dd MMMM yyyy", CultureInfo.CurrentCulture);
            result = days == 1 ? "1 day" : $"{days} days";
            resultBadge = "Countdown";
            return true;
        }

        if (normalized.StartsWith("time in ", StringComparison.Ordinal))
        {
            var place = FindPlace(normalized["time in ".Length..]);
            if (place is not null && TryZoneInfo(place, now, out var zone, out var abbreviation))
            {
                var local = TimeZoneInfo.ConvertTime(now, zone);
                expressionBadge = place.DisplayName;
                result = local.ToString("h:mm tt", CultureInfo.CurrentCulture);
                resultBadge = abbreviation;
                isTimeZone = true;
                return true;
            }
        }

        return false;
    }

    private static bool TryRelative(string normalized, DateTime now, out DateTime when, out string badge)
    {
        when = now;
        badge = "";
        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 3 && tokens[0] == "in" && TryQuantity(tokens[1], tokens[2], now, out var futureIn))
        {
            when = IsDateUnit(tokens[2]) ? futureIn.Date : futureIn;
            badge = TitleCase(tokens[1] + " " + tokens[2]) + " from now";
            return true;
        }
        if (tokens.Length == 4 && tokens[2] == "from" && tokens[3] == "now" && TryQuantity(tokens[0], tokens[1], now, out var future))
        {
            if (IsDateUnit(tokens[1]))
            {
                future = future.Date;
            }
            when = future;
            badge = TitleCase(tokens[0] + " " + tokens[1]) + " from now";
            return true;
        }
        if (tokens.Length == 3 && tokens[2] == "ago" && TryQuantity(tokens[0], tokens[1], now, out var past))
        {
            var span = past - now;
            when = IsDateUnit(tokens[1]) ? (now - span).Date : now - span;
            badge = TitleCase(tokens[0] + " " + tokens[1]) + " ago";
            return true;
        }
        return false;
    }

    private static bool IsDateUnit(string unitText)
    {
        var unit = unitText.TrimEnd('s');
        return unit is "day" or "week" or "month" or "year";
    }

    private static bool TryQuantity(string countText, string unitText, DateTime now, out DateTime when)
    {
        when = now;
        if (!long.TryParse(countText, out var count) || count < 0)
        {
            return false;
        }
        var unit = unitText.TrimEnd('s');
        when = unit switch
        {
            "second" or "sec" => now.AddSeconds(count),
            "minute" or "min" => now.AddMinutes(count),
            "hour" or "hr" => now.AddHours(count),
            "day" => now.AddDays(count),
            "week" => now.AddDays(count * 7),
            "month" => now.AddMonths((int)count),
            "year" => now.AddYears((int)count),
            _ => now,
        };
        return when != now || count == 0;
    }

    private static bool TryParseDate(string text, DateTime now, out DateTime date)
    {
        date = now;
        var normalized = text.Trim();
        if (NamedDates.TryGetValue(normalized, out var named))
        {
            date = new DateTime(now.Year, named.Month, named.Day);
            return true;
        }
        string[] formats = ["yyyy-MM-dd", "d MMM", "d MMMM", "MMM d", "MMMM d", "dd/MM", "d/M"];
        if (DateTime.TryParseExact(
                normalized,
                formats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var parsed))
        {
            if (parsed.Year == 1)
            {
                parsed = parsed.AddYears(now.Year - 1);
            }
            date = parsed;
            return true;
        }
        return false;
    }

    private static bool TryZoneInfo(TimeZonePlace place, DateTime localNow, out TimeZoneInfo zone, out string abbreviation)
    {
        zone = null!;
        abbreviation = "";
        try
        {
            zone = TimeZoneInfo.FindSystemTimeZoneById(place.IanaId);
            abbreviation = zone.IsDaylightSavingTime(TimeZoneInfo.ConvertTime(localNow, zone))
                ? place.AbbrevDaylight
                : place.AbbrevStandard;
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
        catch (InvalidTimeZoneException)
        {
            return false;
        }
    }

    private static string TitleCase(string text)
    {
        return CultureInfo.CurrentCulture.TextInfo.ToTitleCase(text);
    }
}
