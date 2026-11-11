using System.Text;

namespace Trailink.Api.Services.Recognition;

/// <summary>活动库里的一项，交给模型和匹配用。</summary>
public sealed record LibraryItem(Guid Id, string? NameZh, string? NameEn, IReadOnlyList<string> Places)
{
    public string Name => ActivityLibrary.DisplayName(NameZh, NameEn);
}

/// <summary>
/// 模型没关联上活动库时再按名字找一遍：中文名、英文名任一个出现在识别出的名字里（或反过来），
/// 忽略空格、标点和大小写。名字越长越可信；当天的住宿地是这项活动的目的地时加分。
/// 太短的名字（如「游船」）只有目的地也对上时才算；最高分有两项并列时不关联，留给调度员。
/// </summary>
public static class LibraryMatcher
{
    /// <summary>不看目的地也能算数的最短长度：中文 3 个字，英文 5 个字母。</summary>
    private const int MinCjk = 3;
    private const int MinLatin = 5;

    public static Guid? Match(string content, IEnumerable<string?> places, IReadOnlyList<LibraryItem> library)
    {
        var text = Normalize(content);
        if (text.Length == 0)
        {
            return null;
        }

        var dayPlaces = places.Select(Normalize).Where(place => place.Length > 0).ToList();
        Guid? best = null;
        var bestScore = 0;
        var tie = false;
        foreach (var item in library)
        {
            var placeHit = item.Places.Select(Normalize).Any(place => place.Length > 0 && dayPlaces.Any(day => day.Contains(place) || place.Contains(day)));
            var score = 0;
            foreach (var name in new[] { item.NameZh, item.NameEn })
            {
                var key = Normalize(name);
                if (key.Length == 0)
                {
                    continue;
                }

                var overlap = text.Contains(key) ? key : key.Contains(text) ? text : null;
                if (overlap is null || (!LongEnough(overlap) && !(placeHit && overlap.Length >= 2)))
                {
                    continue;
                }

                score = Math.Max(score, Weight(overlap) * 10 + (placeHit ? 5 : 0) + (overlap == key && overlap == text ? 3 : 0));
            }

            if (score == 0)
            {
                continue;
            }

            if (score > bestScore)
            {
                (best, bestScore, tie) = (item.Id, score, false);
            }
            else if (score == bestScore && best != item.Id)
            {
                tie = true;
            }
        }

        return tie ? null : best;
    }

    /// <summary>只留字母、数字和汉字，英文转小写。</summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var c in value)
        {
            if (char.IsLetterOrDigit(c))
            {
                builder.Append(char.ToLowerInvariant(c));
            }
        }

        return builder.ToString();
    }

    private static bool IsCjk(char c) => c >= 0x2E80;

    /// <summary>一个汉字的分量约等于两个英文字母。</summary>
    private static int Weight(string key) => key.Sum(c => IsCjk(c) ? 2 : 1);

    private static bool LongEnough(string key) =>
        key.Count(IsCjk) >= MinCjk || key.Count(c => !IsCjk(c)) >= MinLatin;
}
