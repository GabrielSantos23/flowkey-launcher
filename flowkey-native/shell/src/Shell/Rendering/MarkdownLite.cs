using System.Text;

namespace FlowKey.Shell.Rendering;

public abstract record MdNode;

public sealed record MdHeading(int Level, MdInline[] Inlines) : MdNode;

public sealed record MdParagraph(MdInline[] Inlines) : MdNode;
public sealed record Hr : MdNode;

public sealed record MdListItem(int? Number, MdInline[] Inlines) : MdNode;

public sealed record MdCodeBlock(string Text) : MdNode;

public sealed record MdTruncationNotice : MdNode;

public abstract record MdInline
{
    public record Text(string Value) : MdInline;
    public record Bold(string Value) : MdInline;
    public record Italic(string Value) : MdInline;
    public record Dim(string Value) : MdInline;
    public record Code(string Value) : MdInline;
    public record Link(string Label, string Href) : MdInline;
}

public sealed class MarkdownResult
{
    public List<MdNode> Nodes { get; } = new();
    public bool Truncated { get; set; }
}

public static class MarkdownLite
{
    public const int MaxSourceChars = 100_000;
    public const int MaxNodes = 2_000;
    public const int MaxLinkLength = 2048;

    public static MarkdownResult Parse(string? source)
    {
        var result = new MarkdownResult();
        if (string.IsNullOrEmpty(source))
        {
            return result;
        }
        var text = source.Length > MaxSourceChars ? source[..MaxSourceChars] : source;
        var truncated = source.Length > MaxSourceChars;

        var lines = text.Split('\n');
        var i = 0;
        while (i < lines.Length)
        {
            if (result.Nodes.Count >= MaxNodes)
            {
                truncated = true;
                break;
            }
            var line = lines[i].TrimEnd('\r');
            if (string.IsNullOrWhiteSpace(line))
            {
                i++;
                continue;
            }
            if (System.Text.RegularExpressions.Regex.IsMatch(line, "^-{3,}$"))
            {
                result.Nodes.Add(new Hr());
                i++;
                continue;
            }
            var heading = TryParseHeading(line);
            if (heading is not null)
            {
                result.Nodes.Add(heading);
                i++;
                continue;
            }
            if (line.StartsWith("```", StringComparison.Ordinal))
            {
                var code = new StringBuilder();
                i++;
                while (i < lines.Length && !lines[i].TrimEnd('\r').StartsWith("```", StringComparison.Ordinal))
                {
                    code.AppendLine(lines[i].TrimEnd('\r'));
                    i++;
                }
                if (i < lines.Length)
                {
                    i++;
                }
                result.Nodes.Add(new MdCodeBlock(code.ToString()));
                continue;
            }
            var listMatch = TryParseListItem(line);
            if (listMatch is not null)
            {
                result.Nodes.Add(listMatch);
                i++;
                continue;
            }
            var paragraph = new StringBuilder();
            while (i < lines.Length && !string.IsNullOrWhiteSpace(lines[i])
                && TryParseHeading(lines[i]) is null
                && !lines[i].TrimEnd('\r').StartsWith("```", StringComparison.Ordinal)
                && TryParseListItem(lines[i]) is null)
            {
                paragraph.AppendLine(lines[i].TrimEnd('\r'));
                i++;
                if (result.Nodes.Count + 1 >= MaxNodes)
                {
                    break;
                }
            }
            result.Nodes.Add(new MdParagraph(ParseInlines(paragraph.ToString(), result).ToArray()));
        }

        if (truncated)
        {
            result.Nodes.Add(new MdTruncationNotice());
        }
        result.Truncated = truncated;
        return result;
    }

    private static MdHeading? TryParseHeading(string line)
    {
        var level = 0;
        while (level < line.Length && line[level] == '#')
        {
            level++;
        }
        if (level is < 1 or > 3 || level >= line.Length || line[level] != ' ')
        {
            return null;
        }
        return new MdHeading(level, ParseInlines(line[(level + 1)..], null).ToArray());
    }

    private static MdListItem? TryParseListItem(string line)
    {
        if (line.StartsWith("- ", StringComparison.Ordinal))
        {
            return new MdListItem(null, ParseInlines(line[2..], null).ToArray());
        }
        var dot = line.IndexOf(". ", StringComparison.Ordinal);
        if (dot is > 0 and <= 4 && line[..dot].All(char.IsDigit))
        {
            return new MdListItem(int.Parse(line[..dot]), ParseInlines(line[(dot + 2)..], null).ToArray());
        }
        return null;
    }

    private static List<MdInline> ParseInlines(string text, MarkdownResult? result)
    {
        var inlines = new List<MdInline>();
        var plain = new StringBuilder();
        var i = 0;
        while (i < text.Length)
        {
            var c = text[i];
            if (c == '`')
            {
                var close = text.IndexOf('`', i + 1);
                if (close > i + 1)
                {
                    FlushPlain(plain, inlines);
                    inlines.Add(new MdInline.Code(text[(i + 1)..close]));
                    i = close + 1;
                    continue;
                }
            }
            if (c == '*' && i + 1 < text.Length && text[i + 1] == '*')
            {
                var close = text.IndexOf("**", i + 2, StringComparison.Ordinal);
                if (close > i + 2)
                {
                    FlushPlain(plain, inlines);
                    inlines.Add(new MdInline.Bold(text[(i + 2)..close]));
                    i = close + 2;
                    continue;
                }
            }
            if (c == '~' && i + 1 < text.Length && text[i + 1] == '~')
            {
                var close = text.IndexOf("~~", i + 2, StringComparison.Ordinal);
                if (close > i + 2)
                {
                    FlushPlain(plain, inlines);
                    inlines.Add(new MdInline.Dim(text[(i + 2)..close]));
                    i = close + 2;
                    continue;
                }
            }
            if (c == '*')
            {
                var close = text.IndexOf('*', i + 1);
                if (close > i + 1)
                {
                    FlushPlain(plain, inlines);
                    inlines.Add(new MdInline.Italic(text[(i + 1)..close]));
                    i = close + 1;
                    continue;
                }
            }
            if (c == '[')
            {
                var closeBracket = text.IndexOf(']', i + 1);
                if (closeBracket > i + 1 && closeBracket + 1 < text.Length && text[closeBracket + 1] == '(')
                {
                    var closeParen = text.IndexOf(')', closeBracket + 2);
                    if (closeParen > closeBracket + 2)
                    {
                        FlushPlain(plain, inlines);
                        inlines.Add(new MdInline.Link(text[(i + 1)..closeBracket], text[(closeBracket + 2)..closeParen]));
                        i = closeParen + 1;
                        continue;
                    }
                }
            }
            plain.Append(c);
            i++;
        }
        FlushPlain(plain, inlines);
        return inlines;
    }

    private static void FlushPlain(StringBuilder plain, List<MdInline> inlines)
    {
        if (plain.Length > 0)
        {
            inlines.Add(new MdInline.Text(plain.ToString()));
            plain.Clear();
        }
    }

    public static bool IsLinkOpenable(string href, out string canonicalUrl, out string? reason)
    {
        canonicalUrl = "";
        reason = null;
        if (href.Length > MaxLinkLength)
        {
            reason = "link too long";
            return false;
        }
        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri))
        {
            reason = "unparseable link";
            return false;
        }
        if (uri.Scheme is not ("http" or "https"))
        {
            reason = $"scheme '{uri.Scheme}' blocked";
            return false;
        }
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            reason = "credentials in link";
            return false;
        }
        canonicalUrl = uri.AbsoluteUri;
        return true;
    }
}
