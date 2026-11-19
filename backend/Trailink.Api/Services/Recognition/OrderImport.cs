using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Services.Recognition;

/// <summary>
/// 把调度员核对过的草稿一次写成订单：订单、每天行程、活动、电子票，原始行程截图存为订单截图。
/// 任何一步失败都不留下半张单。建单规则和调度台「创建订单」一致：调度员建的单不绑公司，公司账户建的单绑自己公司。
/// </summary>
public class OrderImport(TrailinkDbContext db, AppFileStore files)
{
    public sealed record Result(Guid? OrderId, string? Error);

    public async Task<Result> ImportAsync(
        User user,
        OrderImportDto request,
        IReadOnlyDictionary<int, IFormFile> uploads,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is string error)
        {
            return new Result(null, error);
        }

        var library = await LibraryIdsAsync(request.Days, cancellationToken);
        var days = request.Days.OrderBy(day => day.ServiceDate).ToList();
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNo = Order.NewOrderNo(),
            PlatformOrderNo = TextValue.NullIfBlank(request.PlatformOrderNo),
            StartDate = days[0].ServiceDate,
            GuestCount = request.GuestCount,
            VehicleType = TextValue.NullIfBlank(request.VehicleType),
            // AI 建单看不出在哪个岛时按南岛（业务主要在南岛）。
            Island = (OrderIslands.TryNormalize(request.Island, out var island) ? island : null) ?? OrderIslands.South,
            CreatedByUserId = user.Id,
            CompanyId = user.Role == UserRoles.Company ? user.CompanyId : null,
            AssignedDispatcherUserId = OrderRules.InitialDispatcher(user, request.OnMyDesk)
        };

        var saved = new SavedFiles();
        try
        {
            foreach (var source in days)
            {
                var day = new ItineraryDay
                {
                    Id = Guid.NewGuid(),
                    OrderId = order.Id,
                    ServiceDate = source.ServiceDate,
                    Description = TextValue.NullIfBlank(source.Description),
                    EndLocation = TextValue.NullIfBlank(source.EndLocation)
                };
                order.Days.Add(day);
                if (await AddActivitiesAsync(day, source.Activities, uploads, library, saved, cancellationToken) is string ticketError)
                {
                    Rollback(saved);
                    return new Result(null, ticketError);
                }
            }

            if (await AddScreenshotsAsync(order, uploads, saved, cancellationToken) is string fileError)
            {
                Rollback(saved);
                return new Result(null, fileError);
            }

            db.Orders.Add(order);
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            Rollback(saved);
            throw;
        }

        if (TextValue.NullIfBlank(request.Notes) is string notes)
        {
            await ViewerNotes.UpsertOrderAsync(db, order.Id, user.Id, notes, cancellationToken);
        }

        return new Result(order.Id, null);
    }

    /// <summary>这次写入时存下的文件：失败时全部删掉；用作电子票的上传序号，剩下的图片存成订单截图。</summary>
    public sealed class SavedFiles
    {
        public List<string> Paths { get; } = [];
        public HashSet<int> TicketIndexes { get; } = [];
    }

    /// <summary>草稿里引用到、确实在活动库里的活动 ID。</summary>
    public async Task<HashSet<Guid>> LibraryIdsAsync(IEnumerable<OrderImportDayDto> days, CancellationToken cancellationToken)
    {
        var ids = days
            .SelectMany(day => day.Activities)
            .Select(activity => activity.LibraryActivityId)
            .OfType<Guid>()
            .Distinct()
            .ToList();
        return ids.Count == 0
            ? []
            : await db.LibraryActivities.Where(item => ids.Contains(item.Id)).Select(item => item.Id).ToHashSetAsync(cancellationToken);
    }

    /// <summary>把草稿里这一天的活动加到 <paramref name="day"/> 上，电子票存成文件。出错时返回原因（已存的文件由调用方删除）。</summary>
    public async Task<string?> AddActivitiesAsync(
        ItineraryDay day,
        IEnumerable<OrderImportActivityDto> activities,
        IReadOnlyDictionary<int, IFormFile> uploads,
        IReadOnlySet<Guid> library,
        SavedFiles saved,
        CancellationToken cancellationToken)
    {
        var sort = 0;
        foreach (var item in activities.Where(item => !string.IsNullOrWhiteSpace(item.Content)))
        {
            var activity = new OrderActivity
            {
                Id = Guid.NewGuid(),
                ItineraryDayId = day.Id,
                Content = item.Content.Trim(),
                Provider = TextValue.NullIfBlank(item.Provider),
                BookingTime = Local(item.BookingTime),
                CheckinTime = Local(item.CheckinTime),
                LibraryActivityId = item.LibraryActivityId is Guid id && library.Contains(id) ? id : null,
                SortOrder = sort++
            };

            if (item.TicketIndex is int index && uploads.TryGetValue(index, out var ticket))
            {
                var (path, ticketError) = await files.SaveAsync(
                    StoredFileKind.Ticket,
                    activity.Id,
                    ticket,
                    null,
                    AppFileStore.DocumentExtensions,
                    AppFileStore.DocumentLimit,
                    $"电子票「{ticket.FileName}」要 8MB 以内的 jpg / png / webp / pdf。",
                    cancellationToken);
                if (ticketError is not null)
                {
                    return ticketError;
                }

                saved.Paths.Add(path!);
                activity.TicketPath = path;
                saved.TicketIndexes.Add(index);
            }

            day.Activities.Add(activity);
        }

        return null;
    }

    /// <summary>没当电子票用的图片（行程图）存成订单截图，原图和其他附件一样 7 天后删除。出错时返回原因。</summary>
    public async Task<string?> AddScreenshotsAsync(
        Order order,
        IReadOnlyDictionary<int, IFormFile> uploads,
        SavedFiles saved,
        CancellationToken cancellationToken)
    {
        foreach (var (index, upload) in uploads.OrderBy(pair => pair.Key))
        {
            if (saved.TicketIndexes.Contains(index) ||
                !AppFileStore.ImageExtensions.Contains(Path.GetExtension(upload.FileName).ToLowerInvariant()))
            {
                continue;
            }

            var fileId = Guid.NewGuid();
            var (path, fileError) = await files.SaveAsync(
                StoredFileKind.Order,
                fileId,
                upload,
                null,
                AppFileStore.ImageExtensions,
                RecognitionSources.MaxFileBytes,
                $"行程图「{upload.FileName}」要 10MB 以内的 jpg / png / webp。",
                cancellationToken);
            if (fileError is not null)
            {
                return fileError;
            }

            saved.Paths.Add(path!);
            var file = new OrderFile
            {
                Id = fileId,
                OrderId = order.Id,
                FileName = AppFileStore.StoredName(upload),
                FilePath = path!
            };
            order.Files.Add(file);
        }

        return null;
    }

    public void Rollback(SavedFiles saved) => saved.Paths.ForEach(files.Delete);

    public static string? Validate(OrderImportDto request) =>
        Validate(request.Days, request.GuestCount, request.Island, request.VehicleType);

    /// <summary>建单和填入行程明细共用的检查。</summary>
    public static string? Validate(IReadOnlyCollection<OrderImportDayDto> days, int? guestCount, string? island, string? vehicleType)
    {
        if (days.Count == 0)
        {
            return "请至少保留一天行程。";
        }

        if (days.Count > 60)
        {
            return "一张订单最多 60 天。";
        }

        if (days.Any(day => day.ServiceDate == default))
        {
            return "有一天没有日期。";
        }

        if (days.GroupBy(day => day.ServiceDate).Any(group => group.Count() > 1))
        {
            return "同一订单同一天只能有一条行程。";
        }

        if (guestCount < 0)
        {
            return "游客人数不能为负数。";
        }

        if (!OrderIslands.TryNormalize(island, out _))
        {
            return "南/北岛只能是南岛、北岛或南北岛。";
        }

        if ((vehicleType?.Trim().Length ?? 0) > OrderIslands.VehicleTypeMaxLength)
        {
            return "车型最多 50 个字。";
        }

        return null;
    }

    private static DateTime? Local(DateTime? value) =>
        value is DateTime time ? DateTime.SpecifyKind(time, DateTimeKind.Unspecified) : null;
}
