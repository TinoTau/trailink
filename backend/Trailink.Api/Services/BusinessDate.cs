namespace Trailink.Api.Services;

/// <summary>
/// 业务只在新西兰。所有「今天」都从这里取，不读服务器或容器的时区。
/// </summary>
public static class BusinessDate
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");

    public static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone));
}
