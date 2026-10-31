namespace Trailink.Api.Services.Weather;

/// <summary>
/// 各查询地点未来几天的天气，只存在接口进程内存里，不写数据库。
/// 进程重启后由 <see cref="WeatherRefresh"/> 立即重新查询。
/// </summary>
public sealed class WeatherForecasts
{
    private volatile Snapshot _current = new(new Dictionary<(string, DateOnly), string>(), null);

    public DateTimeOffset? UpdatedAt => _current.UpdatedAt;

    /// <summary>某个查询地点（<see cref="ForecastPoints"/> 的键）这一天的天气短词；超出预报范围时为 null。</summary>
    public string? For(string? pointKey, DateOnly date) =>
        pointKey is not null && _current.Days.TryGetValue((pointKey, date), out var text) ? text : null;

    /// <summary>整批替换。只有一次查询完整成功才调用，失败时保留上一批。</summary>
    public void Replace(IReadOnlyDictionary<(string Point, DateOnly Date), string> days, DateTimeOffset updatedAt) =>
        _current = new Snapshot(days, updatedAt);

    private sealed record Snapshot(IReadOnlyDictionary<(string Point, DateOnly Date), string> Days, DateTimeOffset? UpdatedAt);
}
