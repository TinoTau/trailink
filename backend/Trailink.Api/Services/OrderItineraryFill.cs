using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services.Recognition;

namespace Trailink.Api.Services;

/// <summary>
/// 粗单填入行程明细：先建的粗单（通常只有日期，可能已派好司导、车辆），拿到行程明细后用 AI 识别成细单，写回这张粗单。
/// <list type="bullet">
/// <item>以细单为准：起止日期、每天的行程说明、住宿、活动都按细单；细单没填的保留粗单原来的。</item>
/// <item>司导、车辆按第几天跟着走：细单第 N 天接粗单第 N 天的司导和车辆；细单更长，多出的天未派；更短，粗单末尾多出的天删掉。</item>
/// <item>挪过去后司导或车辆那天已有别的行程：照样保留，日历上标红（和平时的冲突一样），由调度员调整。</item>
/// <item>粗单的订单号、所属公司、调度分配、抢单等级、截图、各人备注都保留。</item>
/// </list>
/// 能填的人和能改日期的人一样（<see cref="OrderReschedule.CanReschedule"/>），司导在自己的「仅日期」单上也能填。
/// </summary>
public class OrderItineraryFill(TrailinkDbContext db, OrderImport import, OrderDriverAssignment assignment, AppFileStore files)
{
    public sealed record Result(List<string> Warnings, string? Error);

    /// <summary>细单第 i 天对应粗单的哪一天（按日期排序后的第 i 天）。</summary>
    private sealed record Pair(OrderImportDayDto Target, ItineraryDay? Source);

    public static string? Validate(OrderFillDto request) =>
        OrderImport.Validate(request.Days, request.GuestCount, request.Island, request.VehicleType) ??
        (request.Days.Count > 0 &&
         request.Days.Max(day => day.ServiceDate).DayNumber - request.Days.Min(day => day.ServiceDate).DayNumber + 1 >
         OrderReschedule.MaxRangeDays
            ? "一张订单最长三个月。"
            : null);

    /// <summary>对照：每一天接哪天的司导、车辆，哪些天有冲突，哪些天会删掉。不写数据库。</summary>
    public async Task<OrderFillPreviewDto> PreviewAsync(Order order, OrderFillDto request, CancellationToken cancellationToken)
    {
        var (pairs, removed) = Plan(order, request);
        var (driverBusy, vehicleBusy) = await BusyAsync(order, pairs, cancellationToken);
        var names = await NamesAsync(order, cancellationToken);
        var preview = new OrderFillPreviewDto();
        foreach (var pair in pairs)
        {
            var source = pair.Source;
            var date = pair.Target.ServiceDate;
            preview.Days.Add(new OrderFillDayPreviewDto
            {
                ServiceDate = date,
                FromDate = source?.ServiceDate,
                DriverName = source?.DriverId is Guid driverId ? names.Drivers.GetValueOrDefault(driverId) : null,
                Plate = source?.VehicleId is Guid vehicleId ? names.Plates.GetValueOrDefault(vehicleId) : null,
                DriverConflict = source?.DriverId is Guid busyDriver && driverBusy.Contains((busyDriver, date)),
                VehicleConflict = source?.VehicleId is Guid busyVehicle && vehicleBusy.Contains((busyVehicle, date))
            });
        }

        foreach (var day in removed)
        {
            preview.Removed.Add(new OrderFillRemovedDayDto
            {
                ServiceDate = day.ServiceDate,
                DriverName = day.DriverId is Guid driverId ? names.Drivers.GetValueOrDefault(driverId) : null,
                Plate = day.VehicleId is Guid vehicleId ? names.Plates.GetValueOrDefault(vehicleId) : null,
                HasContent = day.Description is not null || day.EndLocation is not null || day.Activities.Count > 0
            });
        }

        preview.Warnings = Warnings(preview);
        return preview;
    }

    /// <summary>写入细单。<paramref name="order"/> 要带上每天的活动（<c>WithDetails</c>）。任何一步失败都不改动订单、不留下新文件。</summary>
    public async Task<Result> ApplyAsync(
        User user,
        Order order,
        OrderFillDto request,
        IReadOnlyDictionary<int, IFormFile> uploads,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is string error)
        {
            return new Result([], error);
        }

        var preview = await PreviewAsync(order, request, cancellationToken);
        var (pairs, removed) = Plan(order, request);
        var library = await import.LibraryIdsAsync(request.Days, cancellationToken);
        var saved = new OrderImport.SavedFiles();
        // 写库成功后才删的旧电子票：删掉的天、被细单活动替换掉的活动。
        var oldTickets = removed.SelectMany(day => day.Activities).Select(activity => activity.TicketPath).OfType<string>().ToList();
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            db.ItineraryDays.RemoveRange(removed);
            // 同一张单同一天只能有一条（唯一索引）。新旧日期会重叠，先挪到很远的临时日期，再一次放到新日期。
            var kept = pairs.Select(pair => pair.Source).OfType<ItineraryDay>().ToList();
            foreach (var day in kept)
            {
                day.ServiceDate = day.ServiceDate.AddYears(TempYears);
            }

            await db.SaveChangesAsync(cancellationToken);

            foreach (var (target, source) in pairs)
            {
                var day = source ?? new ItineraryDay { Id = Guid.NewGuid(), OrderId = order.Id };
                var shift = source is null ? 0 : target.ServiceDate.DayNumber - source.ServiceDate.AddYears(-TempYears).DayNumber;
                day.ServiceDate = target.ServiceDate;
                day.Description = TextValue.NullIfBlank(target.Description) ?? day.Description;
                day.EndLocation = TextValue.NullIfBlank(target.EndLocation) ?? day.EndLocation;
                if (target.Activities.Any(item => !string.IsNullOrWhiteSpace(item.Content)))
                {
                    // 细单写了活动：整天的活动换成细单的。
                    oldTickets.AddRange(day.Activities.Select(activity => activity.TicketPath).OfType<string>());
                    db.OrderActivities.RemoveRange(day.Activities);
                    day.Activities.Clear();
                    if (await import.AddActivitiesAsync(day, target.Activities, uploads, library, saved, cancellationToken) is string ticketError)
                    {
                        import.Rollback(saved);
                        return new Result([], ticketError);
                    }

                    db.OrderActivities.AddRange(day.Activities);
                }
                else
                {
                    // 细单这天没写活动：保留原来的，时间跟着日期挪。
                    foreach (var activity in day.Activities)
                    {
                        activity.BookingTime = activity.BookingTime?.AddDays(shift);
                        activity.CheckinTime = activity.CheckinTime?.AddDays(shift);
                    }
                }

                if (source is null)
                {
                    db.ItineraryDays.Add(day);
                }
            }

            // 行程图存成订单截图，接在粗单原有的截图后面。新文件自己的 ID 是写好的，要明确告诉 EF 是新增。
            var existingFiles = order.Files.ToHashSet();
            if (await import.AddScreenshotsAsync(order, uploads, saved, cancellationToken) is string fileError)
            {
                import.Rollback(saved);
                return new Result([], fileError);
            }

            db.OrderFiles.AddRange(order.Files.Where(file => !existingFiles.Contains(file)));
            order.StartDate = pairs[0].Target.ServiceDate;
            order.PlatformOrderNo = TextValue.NullIfBlank(request.PlatformOrderNo) ?? order.PlatformOrderNo;
            order.GuestCount = request.GuestCount is > 0 ? request.GuestCount.Value : order.GuestCount;
            order.VehicleType = TextValue.NullIfBlank(request.VehicleType) ?? order.VehicleType;
            if (OrderIslands.TryNormalize(request.Island, out var island) && island is not null)
            {
                order.Island = island;
            }

            await db.SaveChangesAsync(cancellationToken);

            // 真实订单（绑公司的单）挪到新日期：这位司导自己在那几天的「仅日期」占位单照常被覆盖，和派单、改日期一样。
            foreach (var group in pairs
                         .Where(pair => pair.Source?.DriverId is not null)
                         .GroupBy(pair => pair.Source!.DriverId!.Value))
            {
                await assignment.RemoveDriverPlaceholdersAsync(order, group.Key, group.Select(pair => pair.Target.ServiceDate), cancellationToken);
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            import.Rollback(saved);
            throw;
        }

        oldTickets.ForEach(files.Delete);
        if (user.Role != UserRoles.Driver && TextValue.NullIfBlank(request.Notes) is string notes)
        {
            await AppendOwnNoteAsync(order.Id, user.Id, notes, cancellationToken);
        }

        return new Result(preview.Warnings, null);
    }

    private const int TempYears = 500;

    /// <summary>细单按日期排序后第 i 天接粗单第 i 天；粗单多出来的天删掉。</summary>
    private static (List<Pair> Pairs, List<ItineraryDay> Removed) Plan(Order order, OrderFillDto request)
    {
        var sources = order.Days.OrderBy(day => day.ServiceDate).ToList();
        var targets = request.Days.OrderBy(day => day.ServiceDate).ToList();
        var pairs = targets.Select((target, index) => new Pair(target, index < sources.Count ? sources[index] : null)).ToList();
        return (pairs, sources.Skip(targets.Count).ToList());
    }

    /// <summary>
    /// 司导、车辆在新日期上已经被别的订单占用的地方。真实订单上，司导自己的占位单会被覆盖，不算冲突。
    /// </summary>
    private async Task<(HashSet<(Guid, DateOnly)> Drivers, HashSet<(Guid, DateOnly)> Vehicles)> BusyAsync(
        Order order,
        List<Pair> pairs,
        CancellationToken cancellationToken)
    {
        var driverBusy = new HashSet<(Guid, DateOnly)>();
        var vehicleBusy = new HashSet<(Guid, DateOnly)>();
        var real = OrderRules.IsRealOrder(order);
        foreach (var group in pairs.Where(pair => pair.Source?.DriverId is not null).GroupBy(pair => pair.Source!.DriverId!.Value))
        {
            var driverId = group.Key;
            var dates = group.Select(pair => pair.Target.ServiceDate).ToList();
            var placeholderIds = db.Orders.Where(OrderRules.PlaceholderOf(driverId)).Select(item => item.Id);
            var busy = await db.ItineraryDays
                .Where(day =>
                    day.DriverId == driverId &&
                    day.OrderId != order.Id &&
                    dates.Contains(day.ServiceDate) &&
                    (!real || !placeholderIds.Contains(day.OrderId)))
                .Select(day => day.ServiceDate)
                .Distinct()
                .ToListAsync(cancellationToken);
            busy.ForEach(date => driverBusy.Add((driverId, date)));
        }

        foreach (var group in pairs.Where(pair => pair.Source?.VehicleId is not null).GroupBy(pair => pair.Source!.VehicleId!.Value))
        {
            var vehicleId = group.Key;
            var dates = group.Select(pair => pair.Target.ServiceDate).ToList();
            var busy = await db.ItineraryDays
                .Where(day => day.VehicleId == vehicleId && day.OrderId != order.Id && dates.Contains(day.ServiceDate))
                .Select(day => day.ServiceDate)
                .Distinct()
                .ToListAsync(cancellationToken);
            busy.ForEach(date => vehicleBusy.Add((vehicleId, date)));
        }

        return (driverBusy, vehicleBusy);
    }

    private async Task<(Dictionary<Guid, string> Drivers, Dictionary<Guid, string> Plates)> NamesAsync(
        Order order,
        CancellationToken cancellationToken)
    {
        var driverIds = order.Days.Select(day => day.DriverId).OfType<Guid>().Distinct().ToList();
        var vehicleIds = order.Days.Select(day => day.VehicleId).OfType<Guid>().Distinct().ToList();
        var drivers = driverIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Drivers.Where(driver => driverIds.Contains(driver.Id)).ToDictionaryAsync(driver => driver.Id, driver => driver.Name, cancellationToken);
        var plates = vehicleIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Vehicles.Where(vehicle => vehicleIds.Contains(vehicle.Id)).ToDictionaryAsync(vehicle => vehicle.Id, vehicle => vehicle.Plate, cancellationToken);
        return (drivers, plates);
    }

    private static List<string> Warnings(OrderFillPreviewDto preview)
    {
        var warnings = new List<string>();
        foreach (var day in preview.Days)
        {
            if (day.DriverConflict)
            {
                warnings.Add($"{day.ServiceDate:MM-dd} {day.DriverName ?? "司导"}那天已有别的行程，照样保留，日历上标红，请调整");
            }

            if (day.VehicleConflict)
            {
                warnings.Add($"{day.ServiceDate:MM-dd} 车辆 {day.Plate} 那天已被别的订单占用，照样保留，请调整");
            }
        }

        foreach (var day in preview.Removed.Where(day => day.DriverName is not null))
        {
            warnings.Add($"{day.ServiceDate:MM-dd} 不在新行程里，删掉这天（原来派给{day.DriverName}）");
        }

        return warnings;
    }

    /// <summary>细单的补充说明接在自己原来的备注后面，不覆盖。</summary>
    private async Task AppendOwnNoteAsync(Guid orderId, Guid userId, string notes, CancellationToken cancellationToken)
    {
        var current = await db.OrderNotes
            .Where(note => note.OrderId == orderId && note.UserId == userId)
            .Select(note => note.Notes)
            .FirstOrDefaultAsync(cancellationToken);
        if (current is not null && current.Contains(notes, StringComparison.Ordinal))
        {
            return;
        }

        await ViewerNotes.UpsertOrderAsync(db, orderId, userId, string.IsNullOrWhiteSpace(current) ? notes : $"{current.TrimEnd()}\n{notes}", cancellationToken);
    }
}
