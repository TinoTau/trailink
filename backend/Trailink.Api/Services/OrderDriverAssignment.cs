using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public class OrderDriverAssignment(TrailinkDbContext db, OrderScheduling scheduling)
{
    public async Task<OrderDriverAssignmentResult> AssignAsync(
        Order order,
        Guid? driverId,
        CancellationToken cancellationToken,
        bool failOnConflict = false)
    {
        var warnings = driverId is Guid assignedId
            ? await scheduling.FindDriverConflictsAsync(
                assignedId,
                order.Days.Select(day => day.ServiceDate),
                order.Id,
                cancellationToken)
            : [];

        if (failOnConflict && warnings.Count > 0)
        {
            return new OrderDriverAssignmentResult(order.Id, driverId, order.Days.Count, warnings, false);
        }

        foreach (var day in order.Days)
        {
            day.DriverId = driverId;
        }

        await db.SaveChangesAsync(cancellationToken);

        return new OrderDriverAssignmentResult(order.Id, driverId, order.Days.Count, warnings);
    }
}

public readonly record struct OrderDriverAssignmentResult(
    Guid OrderId,
    Guid? DriverId,
    int UpdatedDayCount,
    List<string> Warnings,
    bool Applied = true);
