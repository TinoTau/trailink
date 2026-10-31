using System.Globalization;
using System.Text.Json;

namespace Trailink.Api.Services.Weather;

/// <summary>
/// MET Norway（挪威气象局）Locationforecast 2.0。
/// <list type="bullet">
/// <item>免费，数据按 CC BY 4.0 / NLOD 授权，允许商用，页面注明「MET Norway」即可；不需要密钥。</item>
/// <item>使用条款：请求头 User-Agent 要写明应用名和网站（在 Program.cs 统一设置）；坐标最多 4 位小数；
/// 每秒不超过 20 次。每个地点一次请求，10 个地点逐个查，每 3 小时一轮，远低于限制。</item>
/// <item>预报约 9–10 天：前 2 天多为逐小时，之后每 6 小时一段。每段降水平均摊到每小时，再按新西兰日期汇总成短词，如「降雨6mm」。
/// 这个接口在新西兰没有降水概率。</item>
/// </list>
/// </summary>
public sealed class MetNorwayClient(HttpClient http, WeatherOptions settings) : IWeatherSource
{
    public const string DefaultBaseUrl = "https://api.met.no";

    public bool Ready => true;

    public string CreditName => "MET Norway";

    public string CreditUrl => "https://www.met.no/en";

    public async Task<Dictionary<(string Point, DateOnly Date), string>> FetchAsync(CancellationToken cancellationToken)
    {
        var today = BusinessDate.Today;
        var result = new Dictionary<(string, DateOnly), string>();
        foreach (var point in ForecastPoints.All)
        {
            var url = $"{settings.UrlOr(DefaultBaseUrl)}/weatherapi/locationforecast/2.0/compact" +
                      $"?lat={point.Latitude.ToString("0.####", CultureInfo.InvariantCulture)}" +
                      $"&lon={point.Longitude.ToString("0.####", CultureInfo.InvariantCulture)}";
            using var response = await http.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            foreach (var (date, text) in Parse(json.RootElement, today))
            {
                result[(point.Key, date)] = text;
            }
        }

        return result;
    }

    /// <summary>
    /// 一个地点的返回。每个时刻取 <c>next_1_hours</c>，没有就取 <c>next_6_hours</c>；已经被上一段覆盖的时刻跳过。
    /// 今天（<paramref name="today"/>）只剩几个小时也照样汇总；其他日期不足 20 小时（预报最后一天）不写。
    /// </summary>
    public static Dictionary<DateOnly, string> Parse(JsonElement root, DateOnly today)
    {
        var hours = new List<(DateOnly Date, WeatherText.Hour Hour)>();
        var coveredUntil = DateTimeOffset.MinValue;
        foreach (var entry in root.GetProperty("properties").GetProperty("timeseries").EnumerateArray())
        {
            var time = DateTimeOffset.Parse(entry.GetProperty("time").GetString()!, CultureInfo.InvariantCulture);
            var data = entry.GetProperty("data");
            var (span, period) = data.TryGetProperty("next_1_hours", out var one) ? (1, one)
                : data.TryGetProperty("next_6_hours", out var six) ? (6, six)
                : (0, default);
            if (time < coveredUntil || span == 0)
            {
                continue;
            }

            var instant = data.GetProperty("instant").GetProperty("details");
            var symbol = period.GetProperty("summary").GetProperty("symbol_code").GetString() ?? string.Empty;
            var rain = Number(period.TryGetProperty("details", out var details) ? details : default, "precipitation_amount") / span;
            for (var hour = 0; hour < span; hour++)
            {
                var local = TimeZoneInfo.ConvertTime(time.AddHours(hour), BusinessDate.Zone);
                hours.Add((DateOnly.FromDateTime(local.DateTime), new WeatherText.Hour(
                    local.Hour,
                    rain,
                    Number(instant, "cloud_area_fraction"),
                    Number(instant, "air_temperature"),
                    symbol.StartsWith("fog", StringComparison.Ordinal) ? 0 : null,
                    symbol.Contains("thunder", StringComparison.Ordinal))));
            }

            coveredUntil = time.AddHours(span);
        }

        var result = new Dictionary<DateOnly, string>();
        foreach (var day in hours.GroupBy(item => item.Date))
        {
            var text = WeatherText.Summarize(day.Select(item => item.Hour).ToList(), fullDay: day.Key != today);
            if (text is not null)
            {
                result[day.Key] = text;
            }
        }

        return result;
    }

    private static double? Number(JsonElement details, string name) =>
        details.ValueKind == JsonValueKind.Object &&
        details.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;
}
