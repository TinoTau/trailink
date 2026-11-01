using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

/// <summary>
/// 活动库：所有登录用户可以查看、搜索、评分、调整自己的选择顺序；
/// 只有公司账户可以添加、编辑、删除活动和照片，以及新建目的地。所有公司共用一份。
/// </summary>
[ApiController]
[Route("api/library")]
public class LibraryController(TrailinkDbContext db, AuthSession session, AppFileStore files, ActivityLibrary library) : ControllerBase
{
    private const int SearchLimit = 50;

    [HttpGet("destinations")]
    public async Task<ActionResult<List<DestinationDto>>> Destinations(string? q, CancellationToken cancellationToken)
    {
        if (await session.GetUserAsync(cancellationToken) is null)
        {
            return Unauthorized();
        }

        var list = await library.SearchDestinations(q).Take(SearchLimit).ToListAsync(cancellationToken);
        return Ok(list.Select(ActivityLibrary.ToDto).ToList());
    }

    /// <summary>新建目的地；已有同名的直接返回那一个，不重复建。</summary>
    [HttpPost("destinations")]
    public async Task<ActionResult<DestinationDto>> CreateDestination(DestinationWriteDto request, CancellationToken cancellationToken)
    {
        var (user, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var error = ActivityLibrary.CheckNames(request.NameZh, request.NameEn, ActivityLibrary.DestinationZhMax, ActivityLibrary.DestinationEnMax, "目的地");
        if (error is not null)
        {
            return this.Invalid(error);
        }

        var existing = await library.FindSameDestinationAsync(request.NameZh, request.NameEn, cancellationToken);
        if (existing is not null)
        {
            return Ok(ActivityLibrary.ToDto(existing));
        }

        var destination = new Destination
        {
            Id = Guid.NewGuid(),
            NameZh = TextValue.NullIfBlank(request.NameZh),
            NameEn = TextValue.NullIfBlank(request.NameEn),
            CreatedByUserId = user!.Id,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Destinations.Add(destination);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ActivityLibrary.ToDto(destination));
    }

    /// <summary>搜索活动（中英文名模糊匹配），可限定目的地；按评分排序。</summary>
    [HttpGet("activities")]
    public async Task<ActionResult<List<LibraryActivityReadDto>>> Activities(string? q, Guid? destinationId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var query = library.SearchActivities(q);
        if (destinationId is Guid id)
        {
            query = query.Where(item => item.Destinations.Any(link => link.DestinationId == id));
        }

        var activities = await library.WithDetails(query).AsSplitQuery().ToListAsync(cancellationToken);
        var shown = await library.PresentAsync(activities, user.Id, cancellationToken);
        return Ok(ActivityLibrary.SortByRating(shown).Take(SearchLimit * 4).ToList());
    }

    /// <summary>当日详情「添加活动」弹框：按这一天的住宿位置找目的地，列出那里的活动，按本人顺序和评分排序。</summary>
    [HttpGet("pick")]
    public async Task<ActionResult<LibraryPickDto>> Pick(string? place, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var destination = await library.DestinationForStayAsync(place, cancellationToken);
        if (destination is null)
        {
            return Ok(new LibraryPickDto());
        }

        var activities = await library
            .WithDetails(db.LibraryActivities.Where(item => item.Destinations.Any(link => link.DestinationId == destination.Id)))
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        var shown = await library.PresentAsync(activities, user.Id, cancellationToken);
        return Ok(new LibraryPickDto
        {
            Destination = ActivityLibrary.ToDto(destination),
            Activities = await library.SortForUserAsync(shown, user.Id, destination.Id, cancellationToken)
        });
    }

    /// <summary>保存本人在某个目的地拖出来的活动顺序（整份替换）。</summary>
    [HttpPut("order")]
    public async Task<IActionResult> SaveOrder(LibraryOrderWriteDto request, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var ids = request.ActivityIds.Distinct().ToList();
        var known = await db.LibraryActivities
            .Where(item => ids.Contains(item.Id) && item.Destinations.Any(link => link.DestinationId == request.DestinationId))
            .Select(item => item.Id)
            .ToListAsync(cancellationToken);
        if (known.Count != ids.Count)
        {
            return this.Invalid("活动和目的地对不上，请刷新后再试。");
        }

        await db.UserActivityOrders
            .Where(item => item.UserId == user.Id && item.DestinationId == request.DestinationId)
            .ExecuteDeleteAsync(cancellationToken);
        db.UserActivityOrders.AddRange(ids.Select((id, index) => new UserActivityOrder
        {
            UserId = user.Id,
            DestinationId = request.DestinationId,
            ActivityId = id,
            Position = index
        }));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("activities/{id:guid}")]
    public async Task<ActionResult<LibraryActivityDetailDto>> Detail(Guid id, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var activity = await library.WithDetails(db.LibraryActivities)
            .Include(item => item.Ratings).ThenInclude(rating => rating.User)
            .AsSplitQuery()
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        return Ok(ToDetail(activity, user.Id));
    }

    [HttpPost("activities")]
    public async Task<ActionResult<LibraryActivityDetailDto>> Create(LibraryActivityWriteDto request, CancellationToken cancellationToken)
    {
        var (user, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var error = await ValidateAsync(request, null, cancellationToken);
        if (error is not null)
        {
            return this.Invalid(error);
        }

        var activity = new LibraryActivity
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = user!.Id,
            CreatedAt = DateTimeOffset.UtcNow
        };
        Apply(activity, request);
        db.LibraryActivities.Add(activity);
        await db.SaveChangesAsync(cancellationToken);
        return await Detail(activity.Id, cancellationToken);
    }

    [HttpPut("activities/{id:guid}")]
    public async Task<ActionResult<LibraryActivityDetailDto>> Update(Guid id, LibraryActivityWriteDto request, CancellationToken cancellationToken)
    {
        var (_, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var activity = await db.LibraryActivities.Include(item => item.Destinations).FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        var error = await ValidateAsync(request, id, cancellationToken);
        if (error is not null)
        {
            return this.Invalid(error);
        }

        Apply(activity, request);
        await db.SaveChangesAsync(cancellationToken);
        return await Detail(id, cancellationToken);
    }

    /// <summary>删除活动。已经加进行程的活动保留文字，只断开和活动库的关联。</summary>
    [HttpDelete("activities/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var (_, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var activity = await db.LibraryActivities.Include(item => item.Photos).FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        foreach (var photo in activity.Photos)
        {
            files.Delete(photo.FilePath);
        }

        db.LibraryActivities.Remove(activity);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("activities/{id:guid}/rating")]
    public async Task<ActionResult<LibraryActivityDetailDto>> Rate(Guid id, LibraryRatingWriteDto request, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (request.Score is < 1 or > 5)
        {
            return this.Invalid("评分是 1 到 5 星。");
        }

        var comment = TextValue.NullIfBlank(request.Comment);
        if (comment?.Length > 500)
        {
            return this.Invalid("评价不超过 500 字。");
        }

        if (!await db.LibraryActivities.AnyAsync(item => item.Id == id, cancellationToken))
        {
            return NotFound();
        }

        var rating = await db.LibraryActivityRatings.FirstOrDefaultAsync(item => item.ActivityId == id && item.UserId == user.Id, cancellationToken);
        if (rating is null)
        {
            rating = new LibraryActivityRating { Id = Guid.NewGuid(), ActivityId = id, UserId = user.Id };
            db.LibraryActivityRatings.Add(rating);
        }

        rating.Score = request.Score;
        rating.Comment = comment;
        rating.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await Detail(id, cancellationToken);
    }

    [HttpDelete("activities/{id:guid}/rating")]
    public async Task<ActionResult<LibraryActivityDetailDto>> Unrate(Guid id, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        await db.LibraryActivityRatings.Where(item => item.ActivityId == id && item.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        return await Detail(id, cancellationToken);
    }

    [HttpPost("activities/{id:guid}/photos")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<LibraryActivityDetailDto>> UploadPhoto(Guid id, IFormFile file, CancellationToken cancellationToken) =>
        SavePhotoAsync(id, null, file, cancellationToken);

    [HttpPut("activities/{id:guid}/photos/{photoId:guid}")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<LibraryActivityDetailDto>> ReplacePhoto(Guid id, Guid photoId, IFormFile file, CancellationToken cancellationToken) =>
        SavePhotoAsync(id, photoId, file, cancellationToken);

    [HttpDelete("activities/{id:guid}/photos/{photoId:guid}")]
    public async Task<ActionResult<LibraryActivityDetailDto>> DeletePhoto(Guid id, Guid photoId, CancellationToken cancellationToken)
    {
        var (_, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var photo = await db.LibraryActivityPhotos.FirstOrDefaultAsync(item => item.Id == photoId && item.ActivityId == id, cancellationToken);
        if (photo is null)
        {
            return NotFound();
        }

        files.Delete(photo.FilePath);
        db.LibraryActivityPhotos.Remove(photo);
        await db.SaveChangesAsync(cancellationToken);
        return await Detail(id, cancellationToken);
    }

    [HttpGet("activities/{id:guid}/photos/{photoId:guid}")]
    public async Task<IActionResult> DownloadPhoto(Guid id, Guid photoId, CancellationToken cancellationToken)
    {
        if (await session.GetUserAsync(cancellationToken) is null)
        {
            return Unauthorized();
        }

        var photo = await db.LibraryActivityPhotos.FirstOrDefaultAsync(item => item.Id == photoId && item.ActivityId == id, cancellationToken);
        return photo is null ? NotFound() : this.StoredFile(files, photo.FilePath);
    }

    private async Task<ActionResult<LibraryActivityDetailDto>> SavePhotoAsync(Guid id, Guid? photoId, IFormFile file, CancellationToken cancellationToken)
    {
        var (_, denied) = await CompanyAsync(cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var activity = await db.LibraryActivities.Include(item => item.Photos).FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        LibraryActivityPhoto? existing = null;
        if (photoId is Guid replaceId)
        {
            existing = activity.Photos.FirstOrDefault(item => item.Id == replaceId);
            if (existing is null)
            {
                return NotFound();
            }
        }
        else if (activity.Photos.Count >= ActivityLibrary.PhotoLimit)
        {
            return this.Invalid("一项活动最多三张图片。");
        }

        var storedId = existing?.Id ?? Guid.NewGuid();
        var (path, error) = await files.SaveAsync(
            StoredFileKind.LibraryActivity,
            storedId,
            file,
            existing?.FilePath,
            AppFileStore.ImageExtensions,
            AppFileStore.DocumentLimit,
            "活动图片请上传 8MB 以内的 jpg、png 或 webp。",
            cancellationToken);
        if (error is not null)
        {
            return this.Invalid(error);
        }

        if (existing is null)
        {
            db.LibraryActivityPhotos.Add(new LibraryActivityPhoto
            {
                Id = storedId,
                ActivityId = activity.Id,
                FileName = AppFileStore.StoredName(file),
                FilePath = path!,
                SortOrder = activity.Photos.Count == 0 ? 0 : activity.Photos.Max(item => item.SortOrder) + 1
            });
        }
        else
        {
            existing.FilePath = path!;
            if (AppFileStore.StoredName(file) is { Length: > 0 } name)
            {
                existing.FileName = name;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return await Detail(id, cancellationToken);
    }

    private async Task<(User? User, ActionResult? Denied)> CompanyAsync(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return (null, Unauthorized());
        }

        return user.Role == UserRoles.Company ? (user, null) : (user, this.Forbidden("只有公司账户可以编辑活动库。"));
    }

    private async Task<string?> ValidateAsync(LibraryActivityWriteDto request, Guid? exceptId, CancellationToken cancellationToken)
    {
        var error = ActivityLibrary.CheckNames(request.NameZh, request.NameEn, ActivityLibrary.NameZhMax, ActivityLibrary.NameEnMax, "活动");
        if (error is not null)
        {
            return error;
        }

        var destinationIds = request.DestinationIds.Distinct().ToList();
        if (destinationIds.Count == 0)
        {
            return "请至少绑定一个目的地。";
        }

        if (await db.Destinations.CountAsync(item => destinationIds.Contains(item.Id), cancellationToken) != destinationIds.Count)
        {
            return "有目的地不存在，请重新选择。";
        }

        var same = await library.FindSameActivityAsync(request.NameZh, request.NameEn, exceptId, cancellationToken);
        return same is null ? null : $"活动库里已经有「{ActivityLibrary.DisplayName(same.NameZh, same.NameEn)}」，请直接编辑它。";
    }

    private static void Apply(LibraryActivity activity, LibraryActivityWriteDto request)
    {
        activity.NameZh = TextValue.NullIfBlank(request.NameZh);
        activity.NameEn = TextValue.NullIfBlank(request.NameEn);
        activity.SharedNotes = TextValue.NullIfBlank(request.SharedNotes);
        var wanted = request.DestinationIds.Distinct().ToHashSet();
        foreach (var link in activity.Destinations.Where(link => !wanted.Contains(link.DestinationId)).ToList())
        {
            activity.Destinations.Remove(link);
        }

        foreach (var destinationId in wanted.Where(id => activity.Destinations.All(link => link.DestinationId != id)))
        {
            activity.Destinations.Add(new LibraryActivityDestination { ActivityId = activity.Id, DestinationId = destinationId });
        }
    }

    private static LibraryActivityDetailDto ToDetail(LibraryActivity activity, Guid userId)
    {
        var ratings = activity.Ratings.ToList();
        var dto = ActivityLibrary.Fill(
            new LibraryActivityDetailDto(),
            activity,
            ratings.Count == 0 ? null : ratings.Average(item => (double)item.Score),
            ratings.Count,
            ratings.FirstOrDefault(item => item.UserId == userId));
        dto.Reviews = ratings
            .OrderByDescending(item => item.UpdatedAt)
            .Select(item => new LibraryReviewDto
            {
                UserName = item.User.Name,
                Score = item.Score,
                Comment = item.Comment,
                UpdatedAt = item.UpdatedAt,
                Mine = item.UserId == userId
            })
            .ToList();
        return dto;
    }
}
