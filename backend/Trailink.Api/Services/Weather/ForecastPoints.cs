namespace Trailink.Api.Services.Weather;

/// <summary>
/// 定时查询天气的地点：7 个常用住宿地点，加上奥马鲁（没有按钮，手动输入时识别），
/// 以及库克山机场、米尔福德峡湾游客中心（只在当天有对应活动时使用）。
/// 坐标保留 4 位小数。一次请求查全部地点。
/// </summary>
public static class ForecastPoints
{
    public sealed record Point(string Key, string Name, decimal Latitude, decimal Longitude);

    public const string Oamaru = "奥";
    public const string MountCook = "库克山机场";
    public const string Milford = "米尔福德峡湾";

    public static readonly IReadOnlyList<Point> All =
    [
        new("基", "基督城", -43.5321m, 172.6362m),
        new("凯", "凯库拉", -42.4008m, 173.6814m),
        new("特", "特卡波", -44.0047m, 170.4772m),
        new("瓦", "瓦纳卡", -44.7032m, 169.1321m),
        new("皇", "皇后镇", -45.0312m, 168.6626m),
        new("蒂", "蒂阿瑙", -45.4144m, 167.7180m),
        new("但", "但尼丁", -45.8788m, 170.5028m),
        new(Oamaru, "奥马鲁", -45.0975m, 170.9704m),
        new(MountCook, "库克山机场", -43.7650m, 170.1333m),
        new(Milford, "米尔福德峡湾游客中心", -44.6713m, 167.9258m),
    ];
}
