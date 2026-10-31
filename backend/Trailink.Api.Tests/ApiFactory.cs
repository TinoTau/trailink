using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Tests;

/// <summary>测试不定时查询天气（默认来源 MET Norway 不需要密钥，否则每次跑测试都会去请求外部接口）。</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureServices(services =>
            services.Remove(services.Single(service =>
                service.ServiceType == typeof(IHostedService) && service.ImplementationType == typeof(WeatherRefresh))));
}
