using Microsoft.EntityFrameworkCore;
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

    public static void AttachSelf(TrailinkDbContext db, User user)
    {
        var now = DateTimeOffset.UtcNow;
        db.DriverApplications.Add(new DriverApplication
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DispatcherUserId = user.Id,
            CreatedAt = now,
            ApprovedAt = now
        });
    }

    public static async Task EnsureAsync(TrailinkDbContext db, User user, CancellationToken cancellationToken)
    {
        var changed = false;
        if (user.DriverId is null)
        {
            Attach(db, user);
            changed = true;
        }

        var self = await db.DriverApplications.FirstOrDefaultAsync(
            item => item.UserId == user.Id && item.DispatcherUserId == user.Id,
            cancellationToken);
        if (self is null)
        {
            AttachSelf(db, user);
            changed = true;
        }
        else if (self.ApprovedAt is null)
        {
            self.ApprovedAt = DateTimeOffset.UtcNow;
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        await EnsureOwnDispatcherAsync(db, user, cancellationToken);
    }

    public static void AttachOwnDispatcher(TrailinkDbContext db, User user)
    {
        if (user.Role != UserRoles.Company || user.CompanyId is not Guid companyId)
        {
            return;
        }

        db.CompanyMembers.Add(new CompanyMember
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            CompanyId = companyId,
            Role = UserRoles.Dispatcher
        });
    }

    private static async Task EnsureOwnDispatcherAsync(
        TrailinkDbContext db,
        User user,
        CancellationToken cancellationToken)
    {
        if (user.Role != UserRoles.Company || user.CompanyId is not Guid companyId)
        {
            return;
        }

        var member = await db.CompanyMembers.FirstOrDefaultAsync(
            item => item.UserId == user.Id && item.CompanyId == companyId,
            cancellationToken);
        if (member is null)
        {
            AttachOwnDispatcher(db, user);
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        if (member.Role != UserRoles.Dispatcher)
        {
            member.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
