using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public static class DriverRoster
{
    public static IQueryable<Driver> Visible(TrailinkDbContext db, User? user)
    {
        if (user?.Role is UserRoles.Dispatcher or UserRoles.Company)
        {
            return db.Drivers.Where(driver => db.DriverApplications.Any(application =>
                application.DispatcherUserId == user.Id &&
                application.ApprovedAt != null &&
                application.User.DriverId == driver.Id));
        }

        if (user?.Role == UserRoles.Driver && user.DriverId is Guid ownId)
        {
            return db.Drivers.Where(driver => driver.Id == ownId);
        }

        return db.Drivers.Where(driver => false);
    }

    /// <summary>
    /// 能查看的司导：自己名单里的，加上来抢自己订单的人（抢单待确认时调度员要能看他的日历、头像、驾照，也能隐藏拉黑）。
    /// 调度台的司导名单仍只用 <see cref="Visible"/>。
    /// </summary>
    public static IQueryable<Driver> Viewable(TrailinkDbContext db, User? user)
    {
        var roster = Visible(db, user);
        if (user is null || user.Role is not (UserRoles.Dispatcher or UserRoles.Company))
        {
            return roster;
        }

        var userId = user.Id;
        var companyId = user.Role == UserRoles.Company ? user.CompanyId : null;
        var claimants = db.OrderClaims
            .Where(claim =>
                (claim.Order.AssignedDispatcherUserId ?? claim.Order.CreatedByUserId) == userId ||
                (companyId != null && claim.Order.CompanyId == companyId))
            .Select(claim => claim.DriverId);
        return db.Drivers.Where(driver => roster.Any(item => item.Id == driver.Id) || claimants.Contains(driver.Id));
    }
}
