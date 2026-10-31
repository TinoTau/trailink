using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;

namespace Trailink.Api.Services.Weather;

/// <summary>
/// MetService（新西兰气象局）Point Forecast API。
/// <list type="bullet">
/// <item>一次请求查全部地点、从新西兰今天 0 点起 10 天的逐小时降水、云量、气温、能见度，再按新西兰日期汇总成短词，如「降雨6mm」。</item>
/// <item>这个接口没有降水概率，所以降水写当天累计毫米数。</item>
/// <item>计费：每次请求 = 变量数 × 地点数 = 4 × 10 = 40 单位，一天 8 次，一个月约 1 万单位。
/// 免费 Starter 档每月 5 万单位，只能用于测试；正式上线至少要 Basic 档。</item>
/// </list>
/// </summary>
public sealed class MetServiceClient(HttpClient http, WeatherOptions settings) : IWeatherSource
{
    public const string DefaultBaseUrl = "https://forecast-v2.metoceanapi.com";
    public const int ForecastDays = 10;

    private const string Rain = "precipitation.rate";
    private const string Cloud = "cloud.cover";
    private const string Temperature = "air.temperature.at-2m";
    private const string Visibility = "air.visibility";
    private static readonly string[] Variables = [Rain, Cloud, Temperature, Visibility];

    public bool Ready => settings.HasApiKey;

    public string CreditName => "MetService";

    public string CreditUrl => "https://www.metservice.com/";

    public async Task<Dictionary<(string Point, DateOnly Date), string>> FetchAsync(CancellationToken cancellationToken)
    {
        var from = TimeZoneInfo.ConvertTimeToUtc(BusinessDate.Today.ToDateTime(TimeOnly.MinValue), BusinessDate.Zone);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{settings.UrlOr(DefaultBaseUrl)}/point/time")
        {
            Content = JsonContent.Create(new
            {
                points = ForecastPoints.All.Select(point => new { lon = point.Longitude, lat = point.Latitude }),
                variables = Variables,
                time = new
                {
                    from = from.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
                    interval = "1h",
                    repeat = ForecastDays * 24
                }
            })
        };
        request.Headers.Add("x-api-key", settings.ApiKey);
        using var response = await http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return Parse(json.RootElement);
    }

    /// <summary>
    /// 返回里 <c>dimensions.point</c> 与请求顺序一致；每个变量的 <c>data</c> 按自己的 <c>dimensions</c> 顺序排开，
    /// <c>noData</c> 不为 0 的值不用。地点数或数据长度不对就整批作废。
    /// </summary>
    public static Dictionary<(string Point, DateOnly Date), string> Parse(JsonElement root)
    {
        var dimensions = root.GetProperty("dimensions");
        var pointCount = dimensions.GetProperty("point").GetProperty("data").GetArrayLength();
        if (pointCount != ForecastPoints.All.Count)
        {
            throw new InvalidDataException($"天气接口返回 {pointCount} 个地点，应为 {ForecastPoints.All.Count} 个。");
        }

        var times = dimensions.GetProperty("time").GetProperty("data").EnumerateArray()
            .Select(item => TimeZoneInfo.ConvertTime(
                DateTimeOffset.Parse(item.GetString()!, CultureInfo.InvariantCulture), BusinessDate.Zone))
            .ToList();
        var variables = root.GetProperty("variables");
        var values = Variables.ToDictionary(name => name, name => Read(variables.GetProperty(name), times.Count, pointCount));

        var result = new Dictionary<(string, DateOnly), string>();
        for (var point = 0; point < pointCount; point++)
        {
            var hours = times.Select((time, index) => (
                Date: DateOnly.FromDateTime(time.DateTime),
                Hour: new WeatherText.Hour(
                    time.Hour,
                    values[Rain][index, point],
                    values[Cloud][index, point],
                    values[Temperature][index, point] - 273.15,
                    values[Visibility][index, point])));
            foreach (var day in hours.GroupBy(item => item.Date))
            {
                var text = WeatherText.Summarize(day.Select(item => item.Hour).ToList());
                if (text is not null)
                {
                    result[(ForecastPoints.All[point].Key, day.Key)] = text;
                }
            }
        }

        return result;
    }

    /// <summary>读成 [时间, 地点] 的二维表，缺值为 null。</summary>
    private static double?[,] Read(JsonElement variable, int timeCount, int pointCount)
    {
        var order = variable.GetProperty("dimensions").EnumerateArray().Select(item => item.GetString()).ToList();
        var data = variable.GetProperty("data").EnumerateArray().ToList();
        var noData = variable.GetProperty("noData").EnumerateArray().ToList();
        if (data.Count != timeCount * pointCount || noData.Count != data.Count)
        {
            throw new InvalidDataException($"天气接口返回的数据长度 {data.Count}，应为 {timeCount * pointCount}。");
        }

        var timeFirst = order.IndexOf("time") < order.IndexOf("point");
        var table = new double?[timeCount, pointCount];
        for (var time = 0; time < timeCount; time++)
        {
            for (var point = 0; point < pointCount; point++)
            {
                var index = timeFirst ? time * pointCount + point : point * timeCount + time;
                table[time, point] = noData[index].GetInt32() == 0 && data[index].ValueKind == JsonValueKind.Number
                    ? data[index].GetDouble()
                    : null;
            }
        }

        return table;
    }
}
