using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public static class DriverIdentity
{
    public static void Attach(TrailinkDbContext db, User user)
    {
        if (user.DriverId is not null)
        {
            return;
        }

        var driver = new Driver { Id = Guid.NewGuid(), Name = user.Name };
        db.Drivers.Add(driver);
        user.DriverId = driver.Id;
    }

    public static async Task EnsureAsync(TrailinkDbContext db, User user, CancellationToken cancellationToken)
    {
        if (user.DriverId is not null)
        {
            return;
        }

        Attach(db, user);
        await db.SaveChangesAsync(cancellationToken);
    }
}
