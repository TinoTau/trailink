using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public class AuthSession(TrailinkDbContext db, IHttpContextAccessor accessor)
{
    public Guid? UserId
    {
        get
        {
            var raw = accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public IQueryable<User> Query()
    {
        return db.Users
            .Include(user => user.Company)
            .Include(user => user.Memberships)
            .ThenInclude(member => member.Company)
            .Include(user => user.Applications)
            .ThenInclude(application => application.Company)
            .Include(user => user.DriverApplications)
            .ThenInclude(application => application.Dispatcher);
    }

    public async Task<User?> GetUserAsync(CancellationToken cancellationToken = default)
    {
        if (UserId is not Guid id)
        {
            return null;
        }

        return await Query().FirstOrDefaultAsync(user => user.Id == id, cancellationToken);
    }

    public async Task SignInAsync(User user)
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
            ],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await accessor.HttpContext!.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));
    }

    public Task SignOutAsync()
    {
        return accessor.HttpContext!.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }
}
