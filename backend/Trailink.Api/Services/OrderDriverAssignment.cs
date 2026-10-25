using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public class OrderDriverAssignment(TrailinkDbContext db, OrderScheduling scheduling, AppFileStore files)
{
    public const string CannotClearOthers = "只能取消自己派出的订单。";

    public static Guid? AssignerId(Order order, ItineraryDay day) =>
        day.AssignedByUserId ?? order.CreatedByUserId;

    public static Guid? AssignerFor(User? user, Order order, Guid? driverId)
    {
        if (driverId is Guid claimedDriverId &&
            user?.DriverId == claimedDriverId &&
            order.AssignedDispatcherUserId is Guid dispatcherId)
        {
            return dispatcherId;
        }

        return user?.Id;
    }

    public static bool CanClearAssignment(User? user, Order order, IEnumerable<ItineraryDay> days)
    {
        if (user is null)
        {
            return false;
        }

        var assigned = days.Where(day => day.DriverId is not null).ToList();
        if (assigned.Count == 0)
        {
            return true;
        }

        // 我的行程：取消派给自己的日期，不看出是谁派的。
        if (user.DriverId is Guid self && assigned.TrueForAll(day => day.DriverId == self))
        {
            return true;
        }

        return assigned.TrueForAll(day => AssignerId(order, day) == user.Id);
    }

    public async Task RemoveDriverPlaceholdersAsync(
        Order incoming,
        Guid driverId,
        IEnumerable<DateOnly> dates,
        CancellationToken cancellationToken)
    {
        if (!OrderScheduling.IsRealOrder(incoming))
        {
            return;
        }

        var placeholders = await scheduling.LoadDriverPlaceholdersAsync(
            driverId,
            dates,
            incoming.Id,
            cancellationToken);
        foreach (var placeholder in placeholders)
        {
            files.DeleteOrderAttachments(placeholder);
            db.Orders.Remove(placeholder);
        }
    }

    public async Task<OrderDriverAssignmentResult> AssignAsync(
        Order order,
        Guid? driverId,
        Guid? assignedByUserId,
        CancellationToken cancellationToken,
        bool failOnConflict = false,
        Guid? viewerUserId = null,
        bool viewerIsDriver = false)
    {
        var warnings = driverId is Guid assignedId
            ? await scheduling.FindDriverConflictsAsync(
                assignedId,
                order.Days.Select(day => day.ServiceDate),
                order.Id,
                cancellationToken,
                order.CompanyId,
                viewerUserId,
                viewerIsDriver)
            : [];

        if (failOnConflict && warnings.Count > 0)
        {
            return new OrderDriverAssignmentResult(order.Id, driverId, order.Days.Count, warnings, false);
        }

        if (driverId is Guid replaceDriverId)
        {
            await RemoveDriverPlaceholdersAsync(
                order,
                replaceDriverId,
                order.Days.Select(day => day.ServiceDate),
                cancellationToken);
        }

        foreach (var day in order.Days)
        {
            day.DriverId = driverId;
            day.AssignedByUserId = driverId is null ? null : assignedByUserId;
        }

        if (driverId is Guid linkedDriverId)
        {
            await LinkDriverToCompanyAsync(order, linkedDriverId, assignedByUserId, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);

        return new OrderDriverAssignmentResult(order.Id, driverId, order.Days.Count, warnings);
    }

    public async Task LinkDriverToCompanyAsync(
        Order order,
        Guid driverId,
        Guid? assignerUserId,
        CancellationToken cancellationToken)
    {
        if (order.CompanyId is not Guid companyId || assignerUserId is not Guid assignerId)
        {
            return;
        }

        if (!await AssignerRepresentsCompanyAsync(companyId, assignerId, cancellationToken))
        {
            return;
        }

        var driverUserId = await db.Users
            .Where(user => user.DriverId == driverId)
            .Select(user => (Guid?)user.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (driverUserId is not Guid userId)
        {
            return;
        }

        var alreadyMember = await db.CompanyMembers.AnyAsync(
            member => member.UserId == userId && member.CompanyId == companyId,
            cancellationToken);
        if (alreadyMember)
        {
            return;
        }

        db.CompanyMembers.Add(new CompanyMember
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            CompanyId = companyId,
            Role = UserRoles.Driver
        });
    }

    private async Task<bool> AssignerRepresentsCompanyAsync(
        Guid companyId,
        Guid assignerUserId,
        CancellationToken cancellationToken)
    {
        var assigner = await db.Users.FirstOrDefaultAsync(user => user.Id == assignerUserId, cancellationToken);
        if (assigner is null)
        {
            return false;
        }

        if (assigner.Role == UserRoles.Company && assigner.CompanyId == companyId)
        {
            return true;
        }

        return await db.CompanyMembers.AnyAsync(
            member =>
                member.UserId == assignerUserId &&
                member.CompanyId == companyId &&
                member.Role == UserRoles.Dispatcher,
            cancellationToken);
    }
}

public readonly record struct OrderDriverAssignmentResult(
    Guid OrderId,
    Guid? DriverId,
    int UpdatedDayCount,
    List<string> Warnings,
    bool Applied = true);
