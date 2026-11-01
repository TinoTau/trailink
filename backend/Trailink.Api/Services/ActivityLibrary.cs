using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Services;

/// <summary>
/// 活动库的查询和规则（只在这里定义）：
/// <list type="bullet">
/// <item>中英文名至少一个；显示时优先中文名。</item>
/// <item>模糊搜索：中文名或英文名包含关键字，不区分大小写。</item>
/// <item>重名：中文名与已有中文名相同，或英文名与已有英文名相同（不区分大小写），视为已存在。</item>
/// <item>住宿位置对应的目的地：常用地点按全名或浮雕字；其他按目的地中文名或英文名完全相同。</item>
/// <item>弹框排序：先按本人在这个目的地拖出来的顺序，其余按平均评分从高到低、评分人数从多到少、名称。</item>
/// </list>
/// </summary>
public sealed class ActivityLibrary(TrailinkDbContext db)
{
    public const int NameZhMax = 100;
    public const int NameEnMax = 150;
    public const int DestinationZhMax = 60;
    public const int DestinationEnMax = 100;
    public const int PhotoLimit = 3;

    public static string DisplayName(string? nameZh, string? nameEn) => TextValue.NullIfBlank(nameZh) ?? nameEn?.Trim() ?? string.Empty;

    /// <summary>校验中英文名：至少填一个、长度合适。返回错误信息，合格时为 null。</summary>
    public static string? CheckNames(string? nameZh, string? nameEn, int zhMax, int enMax, string what)
    {
        var zh = TextValue.NullIfBlank(nameZh);
        var en = TextValue.NullIfBlank(nameEn);
        if (zh is null && en is null)
        {
            return $"请填写{what}的中文名或英文名。";
        }

        return zh?.Length > zhMax || en?.Length > enMax ? $"{what}中文名不超过 {zhMax} 字，英文名不超过 {enMax} 字。" : null;
    }

    public static DestinationDto ToDto(Destination destination) => new()
    {
        Id = destination.Id,
        NameZh = destination.NameZh,
        NameEn = destination.NameEn,
        Mark = destination.Mark,
        Name = DisplayName(destination.NameZh, destination.NameEn)
    };

    public IQueryable<Destination> SearchDestinations(string? query)
    {
        var q = TextValue.NullIfBlank(query);
        var destinations = db.Destinations.AsQueryable();
        if (q is not null)
        {
            var pattern = $"%{Escape(q)}%";
            destinations = destinations.Where(item =>
                EF.Functions.ILike(item.NameZh ?? "", pattern) || EF.Functions.ILike(item.NameEn ?? "", pattern) || item.Mark == q);
        }

        // 常用地点在前（按清单顺序存的固定 Id），其余按名称。
        return destinations.OrderBy(item => item.Mark == null).ThenBy(item => item.Mark == null ? item.NameZh ?? item.NameEn : item.Id.ToString());
    }

    /// <summary>同名目的地（中文名或英文名相同，不区分大小写）。</summary>
    public Task<Destination?> FindSameDestinationAsync(string? nameZh, string? nameEn, CancellationToken cancellationToken)
    {
        var zh = TextValue.NullIfBlank(nameZh)?.ToLower();
        var en = TextValue.NullIfBlank(nameEn)?.ToLower();
        return db.Destinations.FirstOrDefaultAsync(item =>
            (zh != null && item.NameZh != null && item.NameZh.ToLower() == zh) ||
            (en != null && item.NameEn != null && item.NameEn.ToLower() == en), cancellationToken);
    }

    /// <summary>当天住宿位置对应的目的地；没有对应的为 null。</summary>
    public async Task<Destination?> DestinationForStayAsync(string? endLocation, CancellationToken cancellationToken)
    {
        var text = TextValue.NullIfBlank(endLocation);
        if (text is null)
        {
            return null;
        }

        if (Places.Find(text) is { } place)
        {
            return await db.Destinations.FirstOrDefaultAsync(item => item.Id == place.Id, cancellationToken);
        }

        var lower = text.ToLower();
        return await db.Destinations.FirstOrDefaultAsync(item =>
            (item.NameZh != null && item.NameZh.ToLower() == lower) ||
            (item.NameEn != null && item.NameEn.ToLower() == lower), cancellationToken);
    }

    public IQueryable<LibraryActivity> SearchActivities(string? query)
    {
        var q = TextValue.NullIfBlank(query);
        var activities = db.LibraryActivities.AsQueryable();
        if (q is not null)
        {
            var pattern = $"%{Escape(q)}%";
            activities = activities.Where(item =>
                EF.Functions.ILike(item.NameZh ?? "", pattern) || EF.Functions.ILike(item.NameEn ?? "", pattern));
        }

        return activities;
    }

    /// <summary>同名活动（中文名或英文名相同，不区分大小写），用于拒绝重复添加。</summary>
    public Task<LibraryActivity?> FindSameActivityAsync(string? nameZh, string? nameEn, Guid? exceptId, CancellationToken cancellationToken)
    {
        var zh = TextValue.NullIfBlank(nameZh)?.ToLower();
        var en = TextValue.NullIfBlank(nameEn)?.ToLower();
        return db.LibraryActivities.FirstOrDefaultAsync(item =>
            item.Id != exceptId &&
            ((zh != null && item.NameZh != null && item.NameZh.ToLower() == zh) ||
             (en != null && item.NameEn != null && item.NameEn.ToLower() == en)), cancellationToken);
    }

    /// <summary>把活动（带目的地和照片）转成接口响应，附上评分汇总和当前用户自己的评分。</summary>
    public async Task<List<LibraryActivityReadDto>> PresentAsync(
        IReadOnlyCollection<LibraryActivity> activities,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var ids = activities.Select(item => item.Id).ToList();
        var summaries = await db.LibraryActivityRatings
            .Where(item => ids.Contains(item.ActivityId))
            .GroupBy(item => item.ActivityId)
            .Select(group => new { ActivityId = group.Key, Average = group.Average(item => (double)item.Score), Count = group.Count() })
            .ToDictionaryAsync(item => item.ActivityId, cancellationToken);
        var mine = await db.LibraryActivityRatings
            .Where(item => ids.Contains(item.ActivityId) && item.UserId == userId)
            .ToDictionaryAsync(item => item.ActivityId, cancellationToken);

        return activities.Select(activity =>
        {
            summaries.TryGetValue(activity.Id, out var summary);
            mine.TryGetValue(activity.Id, out var own);
            return Fill(new LibraryActivityReadDto(), activity, summary?.Average, summary?.Count ?? 0, own);
        }).ToList();
    }

    public static T Fill<T>(T dto, LibraryActivity activity, double? average, int count, LibraryActivityRating? own)
        where T : LibraryActivityReadDto
    {
        dto.Id = activity.Id;
        dto.NameZh = activity.NameZh;
        dto.NameEn = activity.NameEn;
        dto.Name = DisplayName(activity.NameZh, activity.NameEn);
        dto.SharedNotes = activity.SharedNotes;
        dto.Destinations = activity.Destinations
            .Select(link => link.Destination)
            .OrderBy(item => item.Mark == null)
            .ThenBy(item => DisplayName(item.NameZh, item.NameEn))
            .Select(ToDto)
            .ToList();
        dto.Photos = activity.Photos
            .OrderBy(photo => photo.SortOrder)
            .ThenBy(photo => photo.Id)
            .Select(photo => new LibraryPhotoReadDto { Id = photo.Id, FileName = photo.FileName, SortOrder = photo.SortOrder })
            .ToList();
        dto.AverageScore = average is double value ? Math.Round(value, 1) : null;
        dto.RatingCount = count;
        dto.MyScore = own?.Score;
        dto.MyComment = own?.Comment;
        return dto;
    }

    /// <summary>默认排序：平均评分从高到低（没人评的在后），评分人数从多到少，再按名称。</summary>
    public static List<LibraryActivityReadDto> SortByRating(IEnumerable<LibraryActivityReadDto> activities) =>
        activities
            .OrderByDescending(item => item.AverageScore ?? -1)
            .ThenByDescending(item => item.RatingCount)
            .ThenBy(item => item.Name, StringComparer.Ordinal)
            .ToList();

    /// <summary>弹框排序：本人在这个目的地拖过的排在前面（按拖出来的顺序），其余按评分。</summary>
    public async Task<List<LibraryActivityReadDto>> SortForUserAsync(
        IEnumerable<LibraryActivityReadDto> activities,
        Guid userId,
        Guid destinationId,
        CancellationToken cancellationToken)
    {
        var positions = await db.UserActivityOrders
            .Where(item => item.UserId == userId && item.DestinationId == destinationId)
            .ToDictionaryAsync(item => item.ActivityId, item => item.Position, cancellationToken);
        var rated = SortByRating(activities);
        return rated
            .Select((item, index) => (Item: item, Rank: positions.TryGetValue(item.Id, out var position) ? position : int.MaxValue, index))
            .OrderBy(entry => entry.Rank)
            .ThenBy(entry => entry.index)
            .Select(entry => entry.Item)
            .ToList();
    }

    public IQueryable<LibraryActivity> WithDetails(IQueryable<LibraryActivity> activities) =>
        activities
            .Include(item => item.Destinations).ThenInclude(link => link.Destination)
            .Include(item => item.Photos);

    private static string Escape(string text) => text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
