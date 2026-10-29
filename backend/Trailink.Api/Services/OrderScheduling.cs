using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public class OrderScheduling(TrailinkDbContext db, AppFileStore files)
{
    public const int AttachmentKeepDays = 7;
    public static bool IsRealOrder(Order order) => order.CompanyId is not null;

    public static bool IsDriverPlaceholder(Order order, Guid driverId) =>
        order.CompanyId is null && order.CreatedBy?.DriverId == driverId;

    public static DateOnly? EndDate(IEnumerable<ItineraryDay> days)
    {
        DateOnly? end = null;
        foreach (var day in days)
        {
            if (end is null || day.ServiceDate > end.Value)
            {
                end = day.ServiceDate;
            }
        }

        return end;
    }

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
        var conflicts = await db.ItineraryDays
            .Where(day =>
                day.DriverId == driverId &&
                dateList.Contains(day.ServiceDate) &&
                (excludeOrderId == null || day.OrderId != excludeOrderId) &&
                (!ignorePlaceholders ||
                 day.Order.CompanyId != null ||
                 day.Order.CreatedBy == null ||
                 day.Order.CreatedBy.DriverId != driverId))
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
                var label = FirstLine(item.PlatformOrderNo) ?? FirstLine(item.SharedNotes);
                return string.IsNullOrEmpty(label)
                    ? $"司机在 {item.ServiceDate:yyyy-MM-dd} 已有其他行程"
                    : $"司机在 {item.ServiceDate:yyyy-MM-dd} 已有其他行程：{label}";
            })
            .Distinct()
            .ToList();
    }

    private static string? FirstLine(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var line = value.Trim().Split(['\r', '\n'], 2)[0].Trim();
        return string.IsNullOrEmpty(line) ? null : line;
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
            .Include(order => order.CreatedBy)
            .Include(order => order.Files)
            .Include(order => order.Days)
            .ThenInclude(day => day.Activities)
            .Where(order =>
                order.Id != excludeOrderId &&
                order.CompanyId == null &&
                order.CreatedBy != null &&
                order.CreatedBy.DriverId == driverId &&
                order.Days.Any(day => day.DriverId == driverId && dateList.Contains(day.ServiceDate)))
            .ToListAsync(cancellationToken);
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
            var end = EndDate(order.Days);
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
