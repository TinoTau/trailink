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
}
