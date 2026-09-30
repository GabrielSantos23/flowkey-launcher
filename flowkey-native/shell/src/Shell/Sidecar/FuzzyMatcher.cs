namespace FlowKey.Shell.Sidecar;

/// <summary>
/// Subsequence matcher with launcher-style scoring, shared by command and app
/// ranking. Scale: exact 120 → full prefix 100 → word-prefix 90 → subsequence
/// (clamped to 10..85, boundary/consecutive bonuses, gap penalties). One query
/// character may be skipped to absorb a typo, at a fixed penalty. Returns the
/// matched character indices (into the original text) so results can be
/// highlighted, or null when the query cannot match.
/// </summary>
public static class FuzzyMatcher
{
    public sealed record MatchResult(int Score, IReadOnlyList<int> Indices);

    private const int EmptyQueryScore = 1;
    private const int ExactScore = 120;
    private const int PrefixScore = 100;
    private const int WordPrefixScore = 90;
    private const int SubsequenceBase = 55;
    private const int SubsequenceFloor = 10;
    private const int SubsequenceCap = 85;
    private const int BoundaryBonus = 12;
    private const int ConsecutiveBonus = 8;
    private const int TypoPenalty = 20;

    public static MatchResult? Match(string? query, string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }
        var q = (query ?? "").Trim().ToLowerInvariant();
        if (q.Length == 0)
        {
            return new MatchResult(EmptyQueryScore, Array.Empty<int>());
        }
        var t = text.ToLowerInvariant();

        if (t == q)
        {
            return new MatchResult(ExactScore, ConsecutiveIndices(q.Length, 0));
        }
        if (t.StartsWith(q, StringComparison.Ordinal))
        {
            return new MatchResult(PrefixScore, ConsecutiveIndices(q.Length, 0));
        }

        if (FindWordPrefixIndices(q, t) is { } wordPrefix)
        {
            return new MatchResult(WordPrefixScore, wordPrefix);
        }

        if (ScoreSubsequence(q, t, text) is { } strict)
        {
            return new MatchResult(ClampSubsequence(strict.Score), strict.Indices);
        }

        // Typo tolerance: skipping exactly one query character covers extra or
        // wrong letters; keep the best-scoring variant (query strings are tiny).
        MatchResult? best = null;
        for (var skip = 0; skip < q.Length; skip++)
        {
            var reduced = q[..skip] + q[(skip + 1)..];
            if (reduced.Length == 0 || ScoreSubsequence(reduced, t, text) is not { } candidate)
            {
                continue;
            }
            var result = new MatchResult(ClampSubsequence(candidate.Score) - TypoPenalty, candidate.Indices);
            if (best is null || result.Score > best.Score)
            {
                best = result;
            }
        }
        return best;
    }

    private static IReadOnlyList<int> ConsecutiveIndices(int count, int start)
    {
        var indices = new int[count];
        for (var i = 0; i < count; i++)
        {
            indices[i] = start + i;
        }
        return indices;
    }

    private static IReadOnlyList<int>? FindWordPrefixIndices(string q, string t)
    {
        // Position 0 is covered by the full-prefix check above; a word starts
        // right after a non-alphanumeric character.
        for (var i = 1; i + q.Length <= t.Length; i++)
        {
            if (char.IsLetterOrDigit(t[i - 1]))
            {
                continue;
            }
            if (t.AsSpan(i).StartsWith(q, StringComparison.Ordinal))
            {
                return ConsecutiveIndices(q.Length, i);
            }
        }
        return null;
    }

    private static (int Score, List<int> Indices)? ScoreSubsequence(string q, string t, string original)
    {
        var indices = new List<int>(q.Length);
        var cursor = 0;
        foreach (var ch in q)
        {
            var idx = t.IndexOf(ch, cursor);
            if (idx < 0)
            {
                return null;
            }
            indices.Add(idx);
            cursor = idx + 1;
        }
        var score = SubsequenceBase;
        for (var k = 0; k < indices.Count; k++)
        {
            var idx = indices[k];
            if (IsBoundary(original, idx))
            {
                score += BoundaryBonus;
            }
            if (k > 0)
            {
                var gap = idx - indices[k - 1] - 1;
                score += gap == 0 ? ConsecutiveBonus : -gap;
            }
        }
        return (score, indices);
    }

    /// <summary>Word start, digit boundary, or a camelCase hump in the text.</summary>
    private static bool IsBoundary(string original, int idx) =>
        idx == 0
        || !char.IsLetterOrDigit(original[idx - 1])
        || (char.IsDigit(original[idx]) && !char.IsDigit(original[idx - 1]))
        || (idx + 1 < original.Length
            && char.IsUpper(original[idx])
            && char.IsLower(original[idx + 1])
            && !char.IsUpper(original[idx - 1]));

    private static int ClampSubsequence(int score) =>
        Math.Min(SubsequenceCap, Math.Max(SubsequenceFloor, score));
}
