namespace Trailink.Api.DTOs;

/// <summary>页面上注明的天气数据来源。</summary>
public class WeatherSourceDto
{
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
}
