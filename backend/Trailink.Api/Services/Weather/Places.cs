namespace Trailink.Api.Services.Weather;

/// <summary>
/// 常用住宿地点：当日详情里的地点按钮、日历浮雕字和活动库的常用目的地只认这一份清单。
/// <see cref="Id"/> 固定，迁移时按这份清单写入 destinations 表。
/// </summary>
public static class Places
{
    public sealed record Place(Guid Id, string Mark, string Name, string NameEn);

    public static readonly IReadOnlyList<Place> All =
    [
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000001"), "基", "基督城", "Christchurch"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000002"), "凯", "凯库拉", "Kaikoura"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000003"), "特", "特卡波", "Lake Tekapo"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000004"), "瓦", "瓦纳卡", "Wanaka"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000005"), "皇", "皇后镇", "Queenstown"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000006"), "蒂", "蒂阿瑙", "Te Anau"),
        new(Guid.Parse("6c1f0001-0000-4000-8000-000000000007"), "但", "但尼丁", "Dunedin"),
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
