using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;

namespace Trailink.Api.Services;

public class OrderScheduling(TrailinkDbContext db)
{
    public async Task<List<string>> FindDriverConflictsAsync(
        Guid driverId,
        IEnumerable<DateOnly> dates,
        Guid? excludeOrderId,
        CancellationToken cancellationToken)
    {
        var dateList = dates.Distinct().ToList();
        if (dateList.Count == 0)
        {
            return [];
        }

        var conflicts = await db.ItineraryDays
            .Include(day => day.Order)
            .Where(day =>
                day.DriverId == driverId &&
                dateList.Contains(day.ServiceDate) &&
                (excludeOrderId == null || day.OrderId != excludeOrderId))
            .Select(day => new { day.ServiceDate, day.Order.OrderNo })
            .ToListAsync(cancellationToken);

        return conflicts
            .Select(item => $"司机在 {item.ServiceDate:yyyy-MM-dd} 已有其他行程：{item.OrderNo}")
            .Distinct()
            .ToList();
    }
}
