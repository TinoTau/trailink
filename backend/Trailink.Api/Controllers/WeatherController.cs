using Microsoft.AspNetCore.Mvc;
using Trailink.Api.DTOs;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/weather")]
public class WeatherController(IWeatherSource source) : ControllerBase
{
    /// <summary>当前使用的天气数据来源；来源需要密钥但没有配置（不查天气）时返回 204。</summary>
    [HttpGet("source")]
    [ProducesResponseType<WeatherSourceDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public IActionResult Source() =>
        source.Ready
            ? Ok(new WeatherSourceDto { Name = source.CreditName, Url = source.CreditUrl })
            : NoContent();
}
