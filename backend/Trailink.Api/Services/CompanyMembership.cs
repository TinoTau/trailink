using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public static class CompanyMembership
{
    public static Task<bool> IsDispatcherAsync(
        TrailinkDbContext db,
        Guid companyId,
        Guid userId,
        CancellationToken cancellationToken) =>
        db.CompanyMembers.AnyAsync(
            member => member.CompanyId == companyId && member.UserId == userId && member.Role == UserRoles.Dispatcher,
            cancellationToken);
}
