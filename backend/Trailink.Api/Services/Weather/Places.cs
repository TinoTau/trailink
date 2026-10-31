namespace Trailink.Api.Services.Weather;

/// <summary>
/// 常用住宿地点：当日详情里的地点按钮和日历浮雕字只认这一份清单。
/// </summary>
public static class Places
{
    public sealed record Place(string Mark, string Name);

    public static readonly IReadOnlyList<Place> All =
    [
        new("基", "基督城"),
        new("凯", "凯库拉"),
        new("特", "特卡波"),
        new("瓦", "瓦纳卡"),
        new("皇", "皇后镇"),
        new("蒂", "蒂阿瑙"),
        new("但", "但尼丁"),
    ];

    /// <summary>住宿位置对应的常用地点：写的是全名或浮雕字都算；手动输入的其他地点返回 null。</summary>
    public static Place? Find(string? endLocation)
    {
        var text = endLocation?.Trim();
        return string.IsNullOrEmpty(text)
            ? null
            : All.FirstOrDefault(place => place.Name == text || place.Mark == text);
    }
}
