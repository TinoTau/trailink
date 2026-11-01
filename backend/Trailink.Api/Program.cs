using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Trailink.Api.Data;
using Trailink.Api.Services;
using Trailink.Api.Services.Weather;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddHttpContextAccessor();
// 数字只按数字收发。控制器和 OpenAPI 文档用同一条设置，前端生成的类型才不会出现 number | string。
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict;
});
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict;
});
builder.Services.AddOpenApi();
builder.Services.AddDbContext<TrailinkDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<OrderScheduling>();
builder.Services.AddScoped<OrderDriverAssignment>();
builder.Services.AddScoped<OrderPresenter>();
builder.Services.AddScoped<ActivityLibrary>();
builder.Services.AddScoped<AuthSession>();
builder.Services.AddSingleton<AppFileStore>();
builder.Services.AddHostedService<ExpiredAttachmentCleanup>();
builder.Services.Configure<WeatherOptions>(builder.Configuration.GetSection("Weather"));
builder.Services.AddSingleton<WeatherForecasts>();
builder.Services.AddSingleton(services => services.GetRequiredService<IOptions<WeatherOptions>>().Value.CreateSource(
    new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(15) })
    {
        Timeout = TimeSpan.FromSeconds(20),
        DefaultRequestHeaders = { { "User-Agent", "Trailink/1.0 (+https://trailink.cc)" } }
    }));
builder.Services.AddHostedService<WeatherRefresh>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "trailink.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromDays(14);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy
            .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var app = builder.Build();

if (args.Contains("--wipe-data"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
    await DemoDataSeeder.WipeAsync(db, Console.Out);
    return;
}

if (args.Contains("--wipe-orders"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
    await DemoDataSeeder.WipeOrdersAsync(db, Console.Out);
    return;
}

if (args.Contains("--seed-demo"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
    await DemoDataSeeder.ResetAsync(db, Console.Out);
    return;
}

app.MapOpenApi().AllowAnonymous();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program;
