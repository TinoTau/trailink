namespace Trailink.Api.Services.Weather;

/// <summary>
/// 定时刷新天气。
/// <list type="bullet">
/// <item>启动后 1 分钟内查一次（随机错开），之后按新西兰时间每 3 小时一次：02:17、05:17 … 23:17，再加 0–5 分钟随机偏移，避开整点高峰。</item>
/// <item>一次请求包含全部 10 个地点，一天 8 次。各来源的计费见 <see cref="MetServiceClient"/>、<see cref="OpenMeteoClient"/>。</item>
/// <item>失败时 5、15、45 分钟后重试，仍失败就等下一个整点时段；期间保留上一批数据。</item>
/// <item>需要密钥的来源没有配置密钥时不查询，只记一条日志，日历上不显示天气。</item>
/// </list>
/// </summary>
public sealed class WeatherRefresh(
    IWeatherSource source,
    WeatherForecasts forecasts,
    ILogger<WeatherRefresh> logger) : BackgroundService
{
    private static readonly TimeSpan[] RetryDelays = [TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15), TimeSpan.FromMinutes(45)];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!source.Ready)
        {
            logger.LogWarning("天气来源 {Source} 没有配置 Weather:ApiKey，不查询天气。", source.CreditName);
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(Random.Shared.Next(5, 60)), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                await RefreshWithRetryAsync(stoppingToken);
                await Task.Delay(UntilNextSlot(DateTimeOffset.UtcNow), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // 程序正常退出。
        }
    }

    private async Task RefreshWithRetryAsync(CancellationToken stoppingToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var days = await source.FetchAsync(stoppingToken);
                forecasts.Replace(days, DateTimeOffset.UtcNow);
                logger.LogInformation("天气已更新（{Source}）：{Count} 个地点日", source.CreditName, days.Count);
                return;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                if (attempt >= RetryDelays.Length)
                {
                    logger.LogError(exception, "天气查询连续失败，等下一个时段再试，先保留上一批数据");
                    return;
                }

                logger.LogWarning(exception, "天气查询失败，{Delay} 后重试", RetryDelays[attempt]);
                await Task.Delay(RetryDelays[attempt], stoppingToken);
            }
        }
    }

    /// <summary>到下一个新西兰时间 hh:17（hh 为 2、5、8 … 23）再加 0–5 分钟随机偏移。</summary>
    public static TimeSpan UntilNextSlot(DateTimeOffset nowUtc)
    {
        var local = TimeZoneInfo.ConvertTime(nowUtc, BusinessDate.Zone);
        var slot = new DateTimeOffset(local.Year, local.Month, local.Day, local.Hour, 17, 0, local.Offset);
        while (slot <= local || slot.Hour % 3 != 2)
        {
            slot = slot.AddHours(1);
        }

        return slot - local + TimeSpan.FromSeconds(Random.Shared.Next(0, 300));
    }
}
