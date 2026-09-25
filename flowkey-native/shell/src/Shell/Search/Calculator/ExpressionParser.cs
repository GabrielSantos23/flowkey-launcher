using System.Globalization;

namespace FlowKey.Shell.Search.Calculator;

public static class ExpressionParser
{
    private enum TokenType
    {
        Number,
        Identifier,
        Operator,
        LeftParen,
        RightParen,
        Comma,
    }

    private sealed record Token(TokenType Type, string Text, double NumberValue);

    private static readonly Dictionary<string, double> Constants = new(StringComparer.Ordinal)
    {
        ["pi"] = Math.PI,
        ["τ"] = Math.Tau,
        ["tau"] = Math.Tau,
        ["e"] = Math.E,
        ["phi"] = (1 + Math.Sqrt(5)) / 2,
    };

    public static bool TryEvaluate(string expression, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(expression))
        {
            return false;
        }
        var tokens = Tokenize(expression);
        if (tokens is null || tokens.Count == 0)
        {
            return false;
        }
        var position = 0;
        if (!TryParseAdditive(tokens, ref position, out value) || position != tokens.Count)
        {
            return false;
        }
        return !double.IsNaN(value) && !double.IsInfinity(value);
    }

    private static List<Token>? Tokenize(string text)
    {
        var tokens = new List<Token>();
        var index = 0;
        while (index < text.Length)
        {
            var current = text[index];
            if (char.IsWhiteSpace(current))
            {
                index++;
                continue;
            }
            if (char.IsDigit(current) || (current == '.' && index + 1 < text.Length && char.IsDigit(text[index + 1])))
            {
                var start = index;
                while (index < text.Length && (char.IsDigit(text[index]) || text[index] == '.'))
                {
                    index++;
                }
                var literal = text[start..index];
                if (!double.TryParse(literal, CultureInfo.InvariantCulture, out var number))
                {
                    return null;
                }
                tokens.Add(new Token(TokenType.Number, literal, number));
                continue;
            }
            if (char.IsLetter(current) || current == 'τ')
            {
                if ((current == 'x' || current == 'X') && tokens.Count > 0
                    && tokens[^1].Type is TokenType.Number or TokenType.RightParen)
                {
                    tokens.Add(new Token(TokenType.Operator, "*", 0));
                    index++;
                    continue;
                }
                var start = index;
                while (index < text.Length && (char.IsLetterOrDigit(text[index]) || text[index] == 'τ'))
                {
                    index++;
                }
                tokens.Add(new Token(TokenType.Identifier, text[start..index], 0));
                continue;
            }
            switch (current)
            {
                case '(':
                    tokens.Add(new Token(TokenType.LeftParen, "(", 0));
                    break;
                case ')':
                    tokens.Add(new Token(TokenType.RightParen, ")", 0));
                    break;
                case ',':
                    tokens.Add(new Token(TokenType.Comma, ",", 0));
                    break;
                case '+' or '-' or '*' or '/' or '^' or '%':
                    tokens.Add(new Token(TokenType.Operator, current.ToString(), 0));
                    break;
                case '×':
                    tokens.Add(new Token(TokenType.Operator, "*", 0));
                    break;
                case '÷':
                    tokens.Add(new Token(TokenType.Operator, "/", 0));
                    break;
                default:
                    return null;
            }
            index++;
        }
        return tokens;
    }

    private static bool TryParseAdditive(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (!TryParseMultiplicative(tokens, ref position, out var left))
        {
            return false;
        }
        while (position < tokens.Count
            && tokens[position].Type == TokenType.Operator
            && tokens[position].Text is "+" or "-")
        {
            var op = tokens[position].Text;
            position++;
            if (!TryParseMultiplicative(tokens, ref position, out var right))
            {
                return false;
            }
            left = op == "+" ? left + right : left - right;
        }
        value = left;
        return true;
    }

    private static bool TryParseMultiplicative(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (!TryParseUnary(tokens, ref position, out var left))
        {
            return false;
        }
        while (position < tokens.Count)
        {
            var next = tokens[position];
            if (next.Type == TokenType.Operator && next.Text is "*" or "/")
            {
                position++;
                if (!TryParseUnary(tokens, ref position, out var right))
                {
                    return false;
                }
                left = next.Text == "*" ? left * right : left / right;
            }
            else if (next.Type == TokenType.LeftParen)
            {
                if (!TryParseUnary(tokens, ref position, out var juxtaposed))
                {
                    return false;
                }
                left *= juxtaposed;
            }
            else
            {
                break;
            }
        }
        value = left;
        return true;
    }

    private static bool TryParseUnary(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (position < tokens.Count
            && tokens[position].Type == TokenType.Operator
            && tokens[position].Text is "-" or "+")
        {
            var op = tokens[position].Text;
            position++;
            if (!TryParseUnary(tokens, ref position, out var operand))
            {
                return false;
            }
            value = op == "-" ? -operand : operand;
            return true;
        }
        return TryParsePower(tokens, ref position, out value);
    }

    private static bool TryParsePower(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (!TryParsePostfix(tokens, ref position, out var baseValue))
        {
            return false;
        }
        if (position < tokens.Count
            && tokens[position].Type == TokenType.Operator
            && tokens[position].Text == "^")
        {
            position++;
            if (!TryParseUnary(tokens, ref position, out var exponent))
            {
                return false;
            }
            value = Math.Pow(baseValue, exponent);
            return true;
        }
        value = baseValue;
        return true;
    }

    private static bool TryParsePostfix(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (!TryParsePrimary(tokens, ref position, out value))
        {
            return false;
        }
        while (position < tokens.Count
            && tokens[position].Type == TokenType.Operator
            && tokens[position].Text == "%")
        {
            position++;
            value /= 100;
        }
        return true;
    }

    private static bool TryParsePrimary(List<Token> tokens, ref int position, out double value)
    {
        value = 0;
        if (position >= tokens.Count)
        {
            return false;
        }
        var token = tokens[position];
        switch (token.Type)
        {
            case TokenType.Number:
                position++;
                value = ApplyScaleSuffix(tokens, ref position, token.NumberValue);
                return true;
            case TokenType.Identifier:
                var lower = token.Text.ToLowerInvariant();
                if (Constants.TryGetValue(lower, out var constant))
                {
                    position++;
                    value = constant;
                    return true;
                }
                if (position + 1 < tokens.Count && tokens[position + 1].Type == TokenType.LeftParen)
                {
                    position += 2;
                    var args = new List<double>();
                    if (position < tokens.Count && tokens[position].Type == TokenType.RightParen)
                    {
                        position++;
                        return TryCall(lower, args, out value);
                    }
                    while (true)
                    {
                        if (!TryParseAdditive(tokens, ref position, out var argument))
                        {
                            return false;
                        }
                        args.Add(argument);
                        if (position < tokens.Count && tokens[position].Type == TokenType.Comma)
                        {
                            position++;
                            continue;
                        }
                        if (position < tokens.Count && tokens[position].Type == TokenType.RightParen)
                        {
                            position++;
                            return TryCall(lower, args, out value);
                        }
                        return false;
                    }
                }
                return false;
            case TokenType.LeftParen:
                position++;
                if (!TryParseAdditive(tokens, ref position, out var inner))
                {
                    return false;
                }
                if (position >= tokens.Count || tokens[position].Type != TokenType.RightParen)
                {
                    return false;
                }
                position++;
                value = ApplyScaleSuffix(tokens, ref position, inner);
                return true;
            default:
                return false;
        }
    }

    private static double ApplyScaleSuffix(List<Token> tokens, ref int position, double number)
    {
        if (position < tokens.Count && tokens[position].Type == TokenType.Identifier)
        {
            var scale = tokens[position].Text switch
            {
                "k" or "K" => 1e3,
                "M" => 1e6,
                "b" or "B" => 1e9,
                _ => 0,
            };
            if (scale > 0)
            {
                position++;
                return number * scale;
            }
        }
        return number;
    }

    private static bool TryCall(string name, List<double> args, out double value)
    {
        value = 0;
        switch (name)
        {
            case "sqrt" when args.Count == 1:
                value = Math.Sqrt(args[0]);
                return true;
            case "cbrt" when args.Count == 1:
                value = Math.Cbrt(args[0]);
                return true;
            case "abs" when args.Count == 1:
                value = Math.Abs(args[0]);
                return true;
            case "round" when args.Count == 1:
                value = Math.Round(args[0], MidpointRounding.AwayFromZero);
                return true;
            case "round" when args.Count == 2:
                value = Math.Round(args[0], (int)Math.Clamp(args[1], 0, 15), MidpointRounding.AwayFromZero);
                return true;
            case "floor" when args.Count == 1:
                value = Math.Floor(args[0]);
                return true;
            case "ceil" or "ceiling" when args.Count == 1:
                value = Math.Ceiling(args[0]);
                return true;
            case "ln" when args.Count == 1:
                value = Math.Log(args[0]);
                return true;
            case "log" when args.Count == 1:
                value = Math.Log10(args[0]);
                return true;
            case "log2" when args.Count == 1:
                value = Math.Log2(args[0]);
                return true;
            case "exp" when args.Count == 1:
                value = Math.Exp(args[0]);
                return true;
            case "sign" when args.Count == 1:
                value = Math.Sign(args[0]);
                return true;
            case "min" when args.Count == 2:
                value = Math.Min(args[0], args[1]);
                return true;
            case "max" when args.Count == 2:
                value = Math.Max(args[0], args[1]);
                return true;
            default:
                return TryTrig(name, args, out value);
        }
    }

    private static bool TryTrig(string name, List<double> args, out double value)
    {
        value = 0;
        if (args.Count != 1)
        {
            return false;
        }
        var x = args[0];
        value = name switch
        {
            "sin" => Math.Sin(x),
            "cos" => Math.Cos(x),
            "tan" => Math.Tan(x),
            "asin" => Math.Asin(x),
            "acos" => Math.Acos(x),
            "atan" => Math.Atan(x),
            "sinh" => Math.Sinh(x),
            "cosh" => Math.Cosh(x),
            "tanh" => Math.Tanh(x),
            "asinh" => Math.Asinh(x),
            "acosh" => Math.Acosh(x),
            "atanh" => Math.Atanh(x),
            "cot" => 1 / Math.Tan(x),
            "sec" => 1 / Math.Cos(x),
            "csc" => 1 / Math.Sin(x),
            "coth" => 1 / Math.Tanh(x),
            "sech" => 1 / Math.Cosh(x),
            "csch" => 1 / Math.Sinh(x),
            "acot" => Math.Atan(1 / x),
            "asec" => Math.Acos(1 / x),
            "acsc" => Math.Asin(1 / x),
            _ => double.NaN,
        };
        return !double.IsNaN(value) || name is "acot" or "asec" or "acsc";
    }
}
