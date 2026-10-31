namespace Trailink.Api.Services.Weather;

/// <summary>
/// 一天该显示哪里的天气。日历格子只放得下一个天气，所以按当天最受天气影响的项目来选：
/// <list type="bullet">
/// <item>住在特卡波、瓦纳卡、奥马鲁，当天有库克山的项目：显示库克山机场的天气。</item>
/// <item>住在蒂阿瑙、皇后镇，当天有峡湾项目：显示米尔福德峡湾的天气。</item>
/// <item>其他情况显示住宿地本身的天气；手动输入的其他地点（奥马鲁除外）不显示。</item>
/// </list>
/// </summary>
public static class WeatherRules
{
    private static readonly HashSet<string> MountCookStays = ["特", "瓦", ForecastPoints.Oamaru];
    private static readonly HashSet<string> FiordStays = ["蒂", "皇"];

    /// <returns><see cref="ForecastPoints"/> 里的地点键；不显示天气时为 null。</returns>
    public static string? PointFor(string? endLocation, IEnumerable<string> activities)
    {
        var stay = StayPoint(endLocation);
        if (stay is null)
        {
            return null;
        }

        var contents = activities.ToList();
        if (MountCookStays.Contains(stay) && contents.Any(IsMountCookTrip))
        {
            return ForecastPoints.MountCook;
        }

        if (FiordStays.Contains(stay) && contents.Any(IsFiordTrip))
        {
            return ForecastPoints.Milford;
        }

        return stay;
    }

    /// <summary>住宿地对应的查询地点：常用地点按全名或浮雕字；奥马鲁按手动输入的「奥」或「奥马鲁」。</summary>
    public static string? StayPoint(string? endLocation)
    {
        if (Places.Find(endLocation) is { } place)
        {
            return place.Mark;
        }

        var text = endLocation?.Trim() ?? string.Empty;
        return text == ForecastPoints.Oamaru || text.Contains("奥马鲁") ? ForecastPoints.Oamaru : null;
    }

    /// <summary>库克山项目：活动内容有「库克」，例如库克山直升机、库克山胡克谷徒步、库克山一日游。</summary>
    public static bool IsMountCookTrip(string content) => content.Contains("库克");

    /// <summary>峡湾项目：活动内容有「峡湾」。</summary>
    public static bool IsFiordTrip(string content) => content.Contains("峡湾");
}
