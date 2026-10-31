using System.Globalization;
using System.Text.Json;

namespace Trailink.Api.Services.Weather;

/// <summary>
/// Open-Meteo 商用接口：一次请求查全部地点 14 天的天气代码和最大降水概率，短词如「降雨50%」。
/// 一次请求只算 1 次调用。
/// </summary>
public sealed class OpenMeteoClient(HttpClient http, WeatherOptions settings) : IWeatherSource
{
    public const string DefaultBaseUrl = "https://customer-api.open-meteo.com";
    public const int ForecastDays = 14;

    public bool Ready => settings.HasApiKey;

    public string CreditName => "Open-Meteo.com";

    public string CreditUrl => "https://open-meteo.com/";

    public async Task<Dictionary<(string Point, DateOnly Date), string>> FetchAsync(CancellationToken cancellationToken)
    {
        var url = $"{settings.UrlOr(DefaultBaseUrl)}/v1/forecast" +
                  $"?latitude={Join(ForecastPoints.All.Select(point => point.Latitude))}" +
                  $"&longitude={Join(ForecastPoints.All.Select(point => point.Longitude))}" +
                  "&daily=weather_code,precipitation_probability_max" +
                  "&timezone=Pacific%2FAuckland" +
                  $"&forecast_days={ForecastDays}" +
                  $"&apikey={Uri.EscapeDataString(settings.ApiKey ?? string.Empty)}";
        using var response = await http.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return Parse(json.RootElement);
    }

    /// <summary>
    /// 多个地点时返回数组，顺序与请求里的坐标一致；只有一个地点时返回单个对象。
    /// 某一天缺代码就跳过那一天，不猜。
    /// </summary>
    public static Dictionary<(string Point, DateOnly Date), string> Parse(JsonElement root)
    {
        var locations = root.ValueKind == JsonValueKind.Array ? root.EnumerateArray().ToList() : [root];
        if (locations.Count != ForecastPoints.All.Count)
        {
            throw new InvalidDataException($"天气接口返回 {locations.Count} 个地点，应为 {ForecastPoints.All.Count} 个。");
        }

        var result = new Dictionary<(string, DateOnly), string>();
        for (var index = 0; index < locations.Count; index++)
        {
            var daily = locations[index].GetProperty("daily");
            var dates = daily.GetProperty("time").EnumerateArray().ToList();
            var codes = daily.GetProperty("weather_code").EnumerateArray().ToList();
            var chances = daily.GetProperty("precipitation_probability_max").EnumerateArray().ToList();
            for (var day = 0; day < dates.Count; day++)
            {
                if (codes[day].ValueKind != JsonValueKind.Number)
                {
                    continue;
                }

                int? chance = chances[day].ValueKind == JsonValueKind.Number ? (int)Math.Round(chances[day].GetDouble()) : null;
                var date = DateOnly.ParseExact(dates[day].GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                result[(ForecastPoints.All[index].Key, date)] = WeatherText.Describe(codes[day].GetInt32(), chance);
            }
        }

        return result;
    }

    private static string Join(IEnumerable<decimal> values) =>
        string.Join(',', values.Select(value => value.ToString("0.####", CultureInfo.InvariantCulture)));
}
