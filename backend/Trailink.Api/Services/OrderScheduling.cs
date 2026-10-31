using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

/// <summary>冲突检测、占位单查找和附件过期清理。</summary>
public class OrderScheduling(TrailinkDbContext db, AppFileStore files)
{
    public const int AttachmentKeepDays = 7;

    /// <summary>
    /// 派单前的冲突提示：这位司导在这些日期上已经有其他订单。
    /// 真实订单派单时，这位司导自己的占位单会被覆盖，不算冲突。
    /// </summary>
    public async Task<List<string>> FindDriverConflictsAsync(
        Guid driverId,
        IEnumerable<DateOnly> dates,
        Guid? excludeOrderId,
        CancellationToken cancellationToken,
        Guid? incomingCompanyId = null)
    {
        var dateList = dates.Distinct().ToList();
        if (dateList.Count == 0)
        {
            return [];
        }

        var ignorePlaceholders = incomingCompanyId is not null;
        var placeholderIds = db.Orders.Where(OrderRules.PlaceholderOf(driverId)).Select(order => order.Id);
        var conflicts = await db.ItineraryDays
            .Where(day =>
                day.DriverId == driverId &&
                dateList.Contains(day.ServiceDate) &&
                (excludeOrderId == null || day.OrderId != excludeOrderId) &&
                (!ignorePlaceholders || !placeholderIds.Contains(day.OrderId)))
            .Select(day => new
            {
                day.ServiceDate,
                day.Order.PlatformOrderNo,
                day.Order.SharedNotes
            })
            .ToListAsync(cancellationToken);

        return conflicts
            .Select(item =>
            {
                var label = OrderRules.Label(item.PlatformOrderNo, item.SharedNotes);
                return label is null
                    ? $"司机在 {item.ServiceDate:yyyy-MM-dd} 已有其他行程"
                    : $"司机在 {item.ServiceDate:yyyy-MM-dd} 已有其他行程：{label}";
            })
            .Distinct()
            .ToList();
    }

    public async Task<List<Order>> LoadDriverPlaceholdersAsync(
        Guid driverId,
        IEnumerable<DateOnly> dates,
        Guid excludeOrderId,
        CancellationToken cancellationToken)
    {
        var dateList = dates.Distinct().ToList();
        if (dateList.Count == 0)
        {
            return [];
        }

        return await db.Orders
            .Where(OrderRules.PlaceholderOf(driverId))
            .Where(order =>
                order.Id != excludeOrderId &&
                order.Days.Any(day => day.DriverId == driverId && dateList.Contains(day.ServiceDate)))
            .Include(order => order.Files)
            .Include(order => order.Days)
            .ThenInclude(day => day.Activities)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// 这些行程日里，哪些（司导, 日期）和（车辆, 日期）在全库被两张以上订单同时占用。
    /// </summary>
    public async Task<ScheduleOverlaps> FindOverlapsAsync(IEnumerable<ItineraryDay> source, CancellationToken cancellationToken)
    {
        var days = source.ToList();
        var dates = days.Select(day => day.ServiceDate).Distinct().ToList();
        var driverIds = days.Where(day => day.DriverId != null).Select(day => day.DriverId!.Value).Distinct().ToList();
        var vehicleIds = days.Where(day => day.VehicleId != null).Select(day => day.VehicleId!.Value).Distinct().ToList();
        if (dates.Count == 0)
        {
            return ScheduleOverlaps.None;
        }

        var drivers = driverIds.Count == 0
            ? []
            : await db.ItineraryDays
                .Where(day => day.DriverId != null && driverIds.Contains(day.DriverId.Value) && dates.Contains(day.ServiceDate))
                .GroupBy(day => new { DriverId = day.DriverId!.Value, day.ServiceDate })
                .Where(group => group.Count() > 1)
                .Select(group => new { group.Key.DriverId, group.Key.ServiceDate })
                .ToListAsync(cancellationToken);
        var vehicles = vehicleIds.Count == 0
            ? []
            : await db.ItineraryDays
                .Where(day => day.VehicleId != null && vehicleIds.Contains(day.VehicleId.Value) && dates.Contains(day.ServiceDate))
                .GroupBy(day => new { VehicleId = day.VehicleId!.Value, day.ServiceDate })
                .Where(group => group.Count() > 1)
                .Select(group => new { group.Key.VehicleId, group.Key.ServiceDate })
                .ToListAsync(cancellationToken);

        return new ScheduleOverlaps(
            drivers.Select(item => (item.DriverId, item.ServiceDate)).ToHashSet(),
            vehicles.Select(item => (item.VehicleId, item.ServiceDate)).ToHashSet());
    }

    public async Task PurgeExpiredAttachmentsAsync(DateOnly today, CancellationToken cancellationToken)
    {
        var due = today.AddDays(-AttachmentKeepDays);
        var orders = await db.Orders
            .Include(order => order.Files)
            .Include(order => order.Days)
            .ThenInclude(day => day.Activities)
            .Where(order => order.Days.Any(day => day.ServiceDate <= due))
            .Where(order =>
                order.Files.Any() ||
                order.Days.Any(day => day.Activities.Any(activity => activity.TicketPath != null)))
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var order in orders)
        {
            var end = OrderRules.EndDate(order.Days);
            if (end is null || end.Value > due)
            {
                continue;
            }

            foreach (var file in order.Files.ToList())
            {
                files.Delete(file.FilePath);
                db.OrderFiles.Remove(file);
                changed = true;
            }

            foreach (var activity in order.Days.SelectMany(day => day.Activities))
            {
                if (string.IsNullOrEmpty(activity.TicketPath))
                {
                    continue;
                }

                files.Delete(activity.TicketPath);
                activity.TicketPath = null;
                changed = true;
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

/// <summary>同一司导或同一辆车在同一天被两张以上订单占用的位置。</summary>
public sealed record ScheduleOverlaps(
    HashSet<(Guid DriverId, DateOnly Date)> Drivers,
    HashSet<(Guid VehicleId, DateOnly Date)> Vehicles)
{
    public static readonly ScheduleOverlaps None = new([], []);

    public bool DriverOverlaps(ItineraryDay day) =>
        day.DriverId is Guid driverId && Drivers.Contains((driverId, day.ServiceDate));

    public bool VehicleOverlaps(ItineraryDay day) =>
        day.VehicleId is Guid vehicleId && Vehicles.Contains((vehicleId, day.ServiceDate));
}
