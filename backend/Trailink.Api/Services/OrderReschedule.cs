using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

/// <summary>
/// 已建订单改日期（调度台订单日历上拖动）：拖整段是整单平移，行程、活动、司导、车辆跟着走，活动时间平移相同天数；
/// 拖开头或末尾是拉长、缩短，原来的日期不动，多出来的补空白日，缩掉的删除。
/// 搬过去后司导或车辆在那天已经有别的订单，就把那天改回未派（或去掉车辆）并提示。
/// </summary>
public class OrderReschedule(TrailinkDbContext db, OrderDriverAssignment assignment, AppFileStore files)
{
    public const int MaxRangeDays = 93;

    /// <summary>
    /// 能改日期：所属公司的公司账户；公司的单只有分到它的调度员；自留单（含司导自己的占位单）是建单人或负责的调度员。
    /// </summary>
    public static bool CanReschedule(Order order, User? user)
    {
        if (user is null)
        {
            return false;
        }

        if (user.Role == UserRoles.Company)
        {
            return user.CompanyId is Guid companyId && order.CompanyId == companyId;
        }

        return order.AssignedDispatcherUserId == user.Id ||
               (!OrderRules.IsRealOrder(order) && order.CreatedByUserId == user.Id);
    }

    public static string? Validate(DateOnly start, DateOnly end, int shiftDays = 0)
    {
        if (end < start)
        {
            return "结束日期不能早于开始日期。";
        }

        if (Math.Abs(shiftDays) > 730)
        {
            return "一次最多挪动两年。";
        }

        return end.DayNumber - start.DayNumber + 1 > MaxRangeDays ? "一次最多三个月。" : null;
    }

    /// <summary>
    /// 原来的每一天都平移 <paramref name="shiftDays"/> 天（在日历上拖动整段时不为 0，拖开头或末尾时为 0），
    /// 落在新范围外的删掉（连同活动和电子票文件），新范围里原来行程以外的日期补空白日。原来中间空着的日期不补。
    /// </summary>
    public async Task<RescheduleResult> ApplyAsync(
        Order order,
        DateOnly start,
        DateOnly end,
        int shiftDays,
        CancellationToken cancellationToken)
    {
        var days = order.Days.OrderBy(day => day.ServiceDate).ToList();
        var warnings = new List<string>();
        // 平移后的首尾：新范围里这一段以外的日期补空白日，这一段中间原来空着的日期保持空着。
        DateOnly? spanStart = days.Count > 0 ? days[0].ServiceDate.AddDays(shiftDays) : null;
        DateOnly? spanEnd = days.Count > 0 ? days[^1].ServiceDate.AddDays(shiftDays) : null;
        var removed = days.Where(day => !InRange(day.ServiceDate.AddDays(shiftDays), start, end)).ToList();
        var moved = shiftDays == 0 ? [] : days.Except(removed).ToList();
        var tickets = removed.SelectMany(day => day.Activities).Select(activity => activity.TicketPath).ToList();

        // 同一张单同一天只能有一条（唯一索引）。整段平移时新旧日期会重叠，逐条改会撞上，
        // 所以先把要搬的日子挪到很远的临时日期，再一次放到新日期；全部在一个事务里。
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        db.ItineraryDays.RemoveRange(removed);
        foreach (var day in moved)
        {
            day.ServiceDate = day.ServiceDate.AddYears(TempYears);
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var day in moved)
        {
            day.ServiceDate = day.ServiceDate.AddYears(-TempYears).AddDays(shiftDays);
            foreach (var activity in day.Activities)
            {
                activity.BookingTime = activity.BookingTime?.AddDays(shiftDays);
                activity.CheckinTime = activity.CheckinTime?.AddDays(shiftDays);
            }
        }

        for (var date = start; date <= end; date = date.AddDays(1))
        {
            if (spanStart is DateOnly first && spanEnd is DateOnly last && date >= first && date <= last)
            {
                continue;
            }

            db.ItineraryDays.Add(new ItineraryDay
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ServiceDate = date
            });
        }

        await ResolveConflictsAsync(order, moved, warnings, cancellationToken);
        order.StartDate = start;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 写库成功后再删电子票文件。
        tickets.ForEach(files.Delete);
        return new RescheduleResult(removed.Count, warnings);
    }

    private const int TempYears = 500;

    private static bool InRange(DateOnly date, DateOnly start, DateOnly end) => date >= start && date <= end;

    private async Task ResolveConflictsAsync(
        Order order,
        List<ItineraryDay> moved,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        var withDriver = moved.Where(day => day.DriverId is not null).ToList();
        if (withDriver.Count == 0)
        {
            return;
        }

        var dates = withDriver.Select(day => day.ServiceDate).Distinct().ToList();
        var driverIds = withDriver.Select(day => day.DriverId!.Value).Distinct().ToList();
        var vehicleIds = withDriver.Where(day => day.VehicleId is not null).Select(day => day.VehicleId!.Value).Distinct().ToList();
        var real = OrderRules.IsRealOrder(order);

        var driverBusy = new HashSet<(Guid, DateOnly)>();
        foreach (var driverId in driverIds)
        {
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

        var vehicleBusy = vehicleIds.Count == 0
            ? []
            : (await db.ItineraryDays
                .Where(day =>
                    day.VehicleId != null &&
                    vehicleIds.Contains(day.VehicleId.Value) &&
                    day.OrderId != order.Id &&
                    dates.Contains(day.ServiceDate))
                .Select(day => new { VehicleId = day.VehicleId!.Value, day.ServiceDate })
                .Distinct()
                .ToListAsync(cancellationToken))
                .Select(item => (item.VehicleId, item.ServiceDate))
                .ToHashSet();

        var driverNames = await db.Drivers
            .Where(driver => driverIds.Contains(driver.Id))
            .ToDictionaryAsync(driver => driver.Id, driver => driver.Name, cancellationToken);
        var plates = vehicleIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Vehicles
                .Where(vehicle => vehicleIds.Contains(vehicle.Id))
                .ToDictionaryAsync(vehicle => vehicle.Id, vehicle => vehicle.Plate, cancellationToken);

        var keptByDriver = new Dictionary<Guid, List<DateOnly>>();
        foreach (var day in withDriver.OrderBy(item => item.ServiceDate))
        {
            var driverId = day.DriverId!.Value;
            var label = $"{day.ServiceDate:MM-dd}";
            if (driverBusy.Contains((driverId, day.ServiceDate)))
            {
                OrderDriverAssignment.SetDayDriver(day, null, null);
                day.VehicleId = null;
                warnings.Add($"{label} {driverNames.GetValueOrDefault(driverId, "司导")}那天已有别的行程，这天改回未派");
                continue;
            }

            if (!keptByDriver.TryGetValue(driverId, out var list))
            {
                keptByDriver[driverId] = list = [];
            }

            list.Add(day.ServiceDate);
            if (day.VehicleId is Guid vehicleId && vehicleBusy.Contains((vehicleId, day.ServiceDate)))
            {
                day.VehicleId = null;
                warnings.Add($"{label} 车辆 {plates.GetValueOrDefault(vehicleId, "")} 那天已被别的订单占用，这天去掉了车辆");
            }
        }

        // 真实订单搬到新日期：这位司导自己在那几天的占位单照常被覆盖。
        foreach (var (driverId, keptDates) in keptByDriver)
        {
            await assignment.RemoveDriverPlaceholdersAsync(order, driverId, keptDates, cancellationToken);
        }
    }
}

public sealed record RescheduleResult(int RemovedDayCount, List<string> Warnings);
