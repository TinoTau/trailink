using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.DTOs;
using Trailink.Api.Services;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Tests;

public class WeatherTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public WeatherTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData(0, 0, "晴")]
    [InlineData(1, 5, "少云")]
    [InlineData(2, 10, "多云")]
    [InlineData(3, 20, "阴")]
    [InlineData(45, 0, "雾")]
    [InlineData(61, 50, "降雨50%")]
    [InlineData(81, 70, "降雨70%")]
    [InlineData(53, null, "降雨")]
    [InlineData(73, 40, "降雪40%")]
    [InlineData(95, 80, "雷雨80%")]
    public void Describe_weather_code(int code, int? chance, string expected)
    {
        Assert.Equal(expected, WeatherText.Describe(code, chance));
    }

    [Fact]
    public void Places_match_by_name_or_mark_only()
    {
        Assert.Equal("特", Places.Find("特卡波")?.Mark);
        Assert.Equal("皇后镇", Places.Find(" 皇 ")?.Name);
        Assert.Null(Places.Find("库克山"));
        Assert.Null(Places.Find(null));
    }

    [Fact]
    public void Parse_reads_every_place_in_request_order()
    {
        var locations = ForecastPoints.All.Select((_, index) => new
        {
            daily = new
            {
                time = new[] { "2036-03-01", "2036-03-02" },
                weather_code = new int?[] { index == 2 ? 61 : 0, null },
                precipitation_probability_max = new int?[] { index == 2 ? 55 : 0, 10 }
            }
        });
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(locations));

        var days = OpenMeteoClient.Parse(json.RootElement);

        Assert.Equal(ForecastPoints.All.Count, days.Count);
        Assert.Equal("降雨55%", days[("特", new DateOnly(2036, 3, 1))]);
        Assert.Equal("晴", days[("基", new DateOnly(2036, 3, 1))]);
        Assert.False(days.ContainsKey(("基", new DateOnly(2036, 3, 2))));
    }

    private static List<WeatherText.Hour> Day(double rain = 0, double cloud = 0, double temperature = 10, double visibility = 20000, int hours = 24) =>
        Enumerable.Range(0, hours).Select(hour => new WeatherText.Hour(hour, rain / 24, cloud, temperature, visibility)).ToList();

    [Fact]
    public void Summarize_hourly_forecast()
    {
        Assert.Equal("晴", WeatherText.Summarize(Day(cloud: 10)));
        Assert.Equal("少云", WeatherText.Summarize(Day(cloud: 30)));
        Assert.Equal("多云", WeatherText.Summarize(Day(cloud: 60)));
        Assert.Equal("阴", WeatherText.Summarize(Day(cloud: 95)));
        Assert.Equal("雾", WeatherText.Summarize(Day(cloud: 95, visibility: 400)));
        Assert.Equal("降雨6mm", WeatherText.Summarize(Day(rain: 6.2, cloud: 95)));
        Assert.Equal("降雪3mm", WeatherText.Summarize(Day(rain: 2.5, temperature: -2)));
        Assert.Equal("少云", WeatherText.Summarize(Day(rain: 0.6, cloud: 30)));
        Assert.Null(WeatherText.Summarize(Day(cloud: 10, hours: 12)));
    }

    [Fact]
    public void MetService_parse_reads_time_by_point_tables_in_new_zealand_days()
    {
        // 新西兰 2036-03-01 0 点（夏令时 UTC+13）起 48 小时；第 3 个地点（特）第一天每小时 0.5 mm。
        var from = new DateTimeOffset(2036, 2, 29, 11, 0, 0, TimeSpan.Zero);
        var times = Enumerable.Range(0, 48).Select(hour => from.AddHours(hour).ToString("yyyy-MM-ddTHH:mm:ssZ")).ToList();
        var points = ForecastPoints.All.Count;
        object Variable(Func<int, int, double?> value) => new
        {
            dimensions = new[] { "time", "point" },
            data = times.SelectMany((_, time) => Enumerable.Range(0, points).Select(point => value(time, point))).ToList(),
            noData = times.SelectMany((_, time) => Enumerable.Range(0, points).Select(point => value(time, point) is null ? 1 : 0)).ToList()
        };
        var body = new Dictionary<string, object>
        {
            ["dimensions"] = new
            {
                point = new { data = ForecastPoints.All.Select(point => new { lon = point.Longitude, lat = point.Latitude }) },
                time = new { data = times }
            },
            ["variables"] = new Dictionary<string, object>
            {
                ["precipitation.rate"] = Variable((time, point) => point == 2 && time < 24 ? 0.5 : 0),
                ["cloud.cover"] = Variable((time, point) => point == 0 && time >= 24 ? null : 10),
                ["air.temperature.at-2m"] = Variable((_, _) => 288.15),
                ["air.visibility"] = Variable((_, _) => 20000)
            }
        };
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(body));

        var days = MetServiceClient.Parse(json.RootElement);

        Assert.Equal("降雨12mm", days[("特", new DateOnly(2036, 3, 1))]);
        Assert.Equal("晴", days[("特", new DateOnly(2036, 3, 2))]);
        Assert.Equal("晴", days[("基", new DateOnly(2036, 3, 1))]);
        Assert.False(days.ContainsKey(("基", new DateOnly(2036, 3, 2))));
        Assert.Equal(points * 2 - 1, days.Count);
    }

    [Fact]
    public void MetNorway_parse_spreads_six_hour_blocks_over_new_zealand_days()
    {
        // 新西兰 2036-03-01 15:00（UTC 02:00）起：今天剩下 9 个逐小时段，每小时 0.5 mm、带雷暴；
        // 之后每 6 小时一段，3 月 2 日整天每段 3 mm、0 °C（降雪），3 月 3 日只有 12 小时（预报末尾，不写）。
        var start = new DateTimeOffset(2036, 3, 1, 2, 0, 0, TimeSpan.Zero);
        (DateTimeOffset At, object Json) Entry(DateTimeOffset time, string period, string symbol, double rain, double temperature) => (time, new
        {
            time = time.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            data = new Dictionary<string, object>
            {
                ["instant"] = new { details = new { air_temperature = temperature, cloud_area_fraction = 90.0 } },
                [period] = new { summary = new { symbol_code = symbol }, details = new { precipitation_amount = rain } }
            }
        });
        var series = Enumerable.Range(0, 9).Select(hour => Entry(start.AddHours(hour), "next_1_hours", "rainandthunder", 0.5, 12))
            .Concat(Enumerable.Range(0, 6).Select(block => Entry(start.AddHours(9 + block * 6), "next_6_hours", "snow", 3, 0)))
            .Append(Entry(start.AddHours(9), "next_6_hours", "rain", 99, 12)) // 已被覆盖的时刻，跳过
            .OrderBy(entry => entry.At)
            .Select(entry => entry.Json)
            .ToList();
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(new { properties = new { timeseries = series } }));

        var days = MetNorwayClient.Parse(json.RootElement, new DateOnly(2036, 3, 1));

        Assert.Equal("雷雨5mm", days[new DateOnly(2036, 3, 1)]);
        Assert.Equal("降雪12mm", days[new DateOnly(2036, 3, 2)]);
        Assert.False(days.ContainsKey(new DateOnly(2036, 3, 3)));
    }

    [Fact]
    public void MetService_parse_refuses_a_partial_answer()
    {
        using var json = JsonDocument.Parse("""{"dimensions":{"point":{"data":[{"lon":1,"lat":2}]},"time":{"data":[]}},"variables":{}}""");
        Assert.Throws<InvalidDataException>(() => MetServiceClient.Parse(json.RootElement));
    }

    [Theory]
    [InlineData("特卡波", "库克山直升机", ForecastPoints.MountCook)]
    [InlineData("瓦", "库克山雪上飞机 + 冰川降落", ForecastPoints.MountCook)]
    [InlineData("奥马鲁", "库克山观光飞行", ForecastPoints.MountCook)]
    [InlineData("特卡波", "库克山胡克谷徒步", ForecastPoints.MountCook)]
    [InlineData("瓦纳卡", "库克", ForecastPoints.MountCook)]
    [InlineData("特卡波", "好牧羊人教堂", "特")]
    [InlineData("基督城", "库克山直升机", "基")]
    [InlineData("蒂阿瑙", "米尔福德峡湾游船", ForecastPoints.Milford)]
    [InlineData("皇", "神奇峡湾", ForecastPoints.Milford)]
    [InlineData("皇后镇", "天际缆车", "皇")]
    [InlineData("瓦纳卡", "米尔福德峡湾游船", "瓦")]
    [InlineData("奥", "", ForecastPoints.Oamaru)]
    [InlineData("库克山", "库克山直升机", null)]
    [InlineData("奥拉基", "", null)]
    public void Weather_point_follows_stay_and_activity(string stay, string activity, string? expected)
    {
        Assert.Equal(expected, WeatherRules.PointFor(stay, [activity]));
    }

    [Fact]
    public void Parse_refuses_a_partial_answer()
    {
        using var json = JsonDocument.Parse("""[{"daily":{"time":[],"weather_code":[],"precipitation_probability_max":[]}}]""");
        Assert.Throws<InvalidDataException>(() => OpenMeteoClient.Parse(json.RootElement));
    }

    [Fact]
    public void Next_refresh_is_at_seventeen_past_every_third_new_zealand_hour()
    {
        var now = new DateTimeOffset(2036, 3, 1, 0, 0, 0, TimeSpan.Zero);
        var wait = WeatherRefresh.UntilNextSlot(now);
        var at = TimeZoneInfo.ConvertTime(now + wait, BusinessDate.Zone);

        Assert.InRange(wait, TimeSpan.Zero, TimeSpan.FromHours(3) + TimeSpan.FromMinutes(5));
        Assert.Equal(2, at.Hour % 3);
        Assert.InRange(at.Minute, 17, 22);
    }

    [Fact]
    public async Task Day_shows_weather_of_its_preset_place()
    {
        var date = new DateOnly(2036, 4, 2);
        var forecasts = _factory.Services.GetRequiredService<WeatherForecasts>();
        forecasts.Replace(new Dictionary<(string, DateOnly), string>
        {
            [("特", date)] = "降雨60%",
            [("特", date.AddDays(2))] = "晴",
            [(ForecastPoints.MountCook, date.AddDays(2))] = "降雪70%",
            [(ForecastPoints.Oamaru, date.AddDays(3))] = "多云",
        }, DateTimeOffset.UtcNow);

        var client = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(client);
        var order = await (await client.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = date, GuestCount = 1 }))
            .Content.ReadFromJsonAsync<OrderReadDto>();
        foreach (var (offset, place) in new[] { (0, "特卡波"), (1, "库克山"), (2, "特卡波"), (3, "奥马鲁") })
        {
            var created = await (await client.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = date.AddDays(offset),
                EndLocation = place
            })).Content.ReadFromJsonAsync<ItineraryDayReadDto>();
            if (offset == 2)
            {
                (await client.PostAsJsonAsync($"/api/orders/{order.Id}/days/{created!.Id}/activities", new OrderActivityWriteDto
                {
                    Content = "库克山直升机"
                })).EnsureSuccessStatusCode();
            }
        }

        var read = await client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order!.Id}");
        Assert.Equal("降雨60%", read!.Days.Single(day => day.ServiceDate == date).Weather);
        Assert.Null(read.Days.Single(day => day.ServiceDate == date.AddDays(1)).Weather);
        Assert.Equal("降雪70%", read.Days.Single(day => day.ServiceDate == date.AddDays(2)).Weather);
        Assert.Equal("多云", read.Days.Single(day => day.ServiceDate == date.AddDays(3)).Weather);

        var listed = await client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders");
        Assert.Equal("降雪70%", listed!.Single(item => item.Id == order.Id).Days.Single(day => day.ServiceDate == date.AddDays(2)).Weather);

        var places = await client.GetFromJsonAsync<List<PlaceDto>>("/api/places");
        var source = await client.GetFromJsonAsync<WeatherSourceDto>("/api/weather/source");
        Assert.Equal("MET Norway", source!.Name);
        Assert.Equal(Places.All.Select(place => place.Name), places!.Select(place => place.Name));
    }
}
