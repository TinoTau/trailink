namespace Trailink.Api.Services.Weather;

/// <summary>把一天的天气写成日历格子里的一个短词，如「晴」「多云」「降雨6mm」「降雨50%」。</summary>
public static class WeatherText
{
    /// <summary>Open-Meteo：按 WMO 天气代码和当天最大降水概率（0–100）。</summary>
    public static string Describe(int code, int? precipitationChance)
    {
        var chance = precipitationChance is int value ? $"{value}%" : string.Empty;
        return code switch
        {
            0 => "晴",
            1 => "少云",
            2 => "多云",
            3 => "阴",
            45 or 48 => "雾",
            >= 71 and <= 77 or 85 or 86 => $"降雪{chance}",
            >= 95 => $"雷雨{chance}",
            >= 51 and <= 67 or >= 80 and <= 82 => $"降雨{chance}",
            _ => "多云",
        };
    }

    /// <summary>
    /// 新西兰时间某一小时的预报。降水 mm/h，云量 %，气温 °C，能见度 m；缺值为 null。
    /// <paramref name="Thunder"/>：这一小时预报有雷暴（只有 MET Norway 给出）。
    /// </summary>
    public sealed record Hour(int LocalHour, double? Rain, double? Cloud, double? TemperatureC, double? Visibility, bool Thunder = false);

    /// <summary>白天按 7:00–19:00 算云量和雾；今天已经过了白天时，用剩下的小时。</summary>
    private static bool Daytime(Hour hour) => hour.LocalHour is >= 7 and < 19;

    /// <summary>
    /// MetService、MET Norway：按逐小时预报汇总一天。
    /// <list type="number">
    /// <item>全天累计降水 ≥ 1 mm：写「降雨 / 降雪 / 雷雨 + 毫米数」。下雨那几个小时有雷暴算雷雨；否则平均气温 ≤ 1 °C 算降雪。</item>
    /// <item>白天能见度低于 1000 米的有 3 小时以上：「雾」。</item>
    /// <item>否则按白天平均云量：&lt;20% 晴，&lt;50% 少云，&lt;80% 多云，其余阴。</item>
    /// </list>
    /// <paramref name="fullDay"/> 为 true 时，降水数据不到 20 小时（比如预报最后一天不完整）就不写，返回 null；
    /// 为 false 用于今天只剩几个小时的预报，有数据就写。
    /// </summary>
    public static string? Summarize(IReadOnlyList<Hour> hours, bool fullDay = true)
    {
        var rainy = hours.Where(hour => hour.Rain is not null).ToList();
        if (rainy.Count < (fullDay ? 20 : 1))
        {
            return null;
        }

        var total = rainy.Sum(hour => hour.Rain!.Value);
        if (total >= 1)
        {
            var wet = rainy.Where(hour => hour.Rain >= 0.1 && hour.TemperatureC is not null).ToList();
            var kind = rainy.Any(hour => hour.Thunder && hour.Rain > 0) ? "雷雨"
                : wet.Count > 0 && wet.Average(hour => hour.TemperatureC!.Value) <= 1 ? "降雪"
                : "降雨";
            return $"{kind}{(int)Math.Round(total, MidpointRounding.AwayFromZero)}mm";
        }

        var daytime = hours.Where(Daytime).ToList();
        if (daytime.Count == 0)
        {
            daytime = hours.ToList();
        }
        if (daytime.Count(hour => hour.Visibility < 1000) >= 3)
        {
            return "雾";
        }

        var clouds = daytime.Where(hour => hour.Cloud is not null).Select(hour => hour.Cloud!.Value).ToList();
        if (clouds.Count == 0)
        {
            return null;
        }

        return clouds.Average() switch
        {
            < 20 => "晴",
            < 50 => "少云",
            < 80 => "多云",
            _ => "阴",
        };
    }
}
