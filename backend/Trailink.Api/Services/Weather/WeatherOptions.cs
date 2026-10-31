namespace Trailink.Api.Services.Weather;

public sealed class WeatherOptions
{
    public const string MetNorway = "MetNorway";
    public const string MetService = "MetService";
    public const string OpenMeteo = "OpenMeteo";

    /// <summary>
    /// 天气来源，默认 <see cref="MetNorway"/>（挪威气象局，免费、允许商用，不需要密钥）。
    /// 另外两个需要付费订阅才能用于线上：<see cref="MetService"/>（新西兰气象局）、<see cref="OpenMeteo"/>。
    /// </summary>
    public string Source { get; set; } = MetNorway;

    /// <summary>接口地址。留空时用来源自己的正式地址；本机演示可指向假接口。</summary>
    public string? BaseUrl { get; set; }

    /// <summary>MetService、Open-Meteo 的密钥，只放在环境变量 <c>Weather__ApiKey</c> 里，不进 Git。</summary>
    public string? ApiKey { get; set; }

    public bool HasApiKey => !string.IsNullOrWhiteSpace(ApiKey);

    /// <summary>实际请求的地址：配置了 <see cref="BaseUrl"/> 就用它，否则用来源的正式地址。</summary>
    public string UrlOr(string sourceDefault) => (string.IsNullOrWhiteSpace(BaseUrl) ? sourceDefault : BaseUrl).TrimEnd('/');

    /// <summary>按 <see cref="Source"/> 生成查询客户端。</summary>
    public IWeatherSource CreateSource(HttpClient http) => Source switch
    {
        MetNorway => new MetNorwayClient(http, this),
        MetService => new MetServiceClient(http, this),
        OpenMeteo => new OpenMeteoClient(http, this),
        _ => throw new InvalidOperationException($"不认识的天气来源：{Source}，应为 {MetNorway}、{MetService} 或 {OpenMeteo}。")
    };
}

/// <summary>
/// 一次查询全部 <see cref="ForecastPoints"/> 的逐日天气短词。
/// 各来源给出的短词格式可以不同（例如「降雨6mm」或「降雨50%」），页面照原样显示。
/// </summary>
public interface IWeatherSource
{
    /// <summary>可以查询（需要密钥的来源已配置密钥）。为 false 时不查询，日历不显示天气。</summary>
    bool Ready { get; }

    /// <summary>页面上注明的数据来源。</summary>
    string CreditName { get; }

    string CreditUrl { get; }

    /// <summary>结果按（查询地点键，新西兰日期）给出短词。返回不完整时抛异常，整批作废。</summary>
    Task<Dictionary<(string Point, DateOnly Date), string>> FetchAsync(CancellationToken cancellationToken);
}
