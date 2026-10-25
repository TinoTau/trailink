using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public class OrderScheduling(TrailinkDbContext db)
{
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
        Guid? incomingCompanyId = null,
        Guid? viewerUserId = null,
        bool viewerIsDriver = false)
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
                day.OrderId,
                day.Order.PlatformOrderNo,
                day.Order.DriverNotes
            })
            .ToListAsync(cancellationToken);

        var missingIds = conflicts
            .Where(item => string.IsNullOrWhiteSpace(item.PlatformOrderNo))
            .Select(item => item.OrderId)
            .Distinct()
            .ToList();
        var viewerNotes = viewerUserId is Guid viewerId && missingIds.Count > 0 && !viewerIsDriver
            ? await db.OrderNotes
                .Where(note => note.UserId == viewerId && missingIds.Contains(note.OrderId))
                .ToDictionaryAsync(note => note.OrderId, note => note.Notes, cancellationToken)
            : new Dictionary<Guid, string>();

        return conflicts
            .Select(item =>
            {
                var label = item.PlatformOrderNo?.Trim();
                if (string.IsNullOrEmpty(label))
                {
                    label = viewerIsDriver
                        ? item.DriverNotes?.Trim()
                        : viewerNotes.GetValueOrDefault(item.OrderId)?.Trim();
                }

                return string.IsNullOrEmpty(label)
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
}
