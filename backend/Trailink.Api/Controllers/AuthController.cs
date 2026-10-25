using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(TrailinkDbContext db, AuthSession session, AppFileStore files) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<SessionUserDto>> Register(RegisterDto request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var name = request.Name.Trim();
        var accountType = request.AccountType.Trim().ToLowerInvariant();
        if (username.Length is < 3 or > 50)
        {
            return Problem(title: "Validation error", detail: "用户名需要 3 到 50 个字符。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            return Problem(title: "Validation error", detail: "密码至少 8 位。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (name.Length is < 1 or > 100)
        {
            return Problem(title: "Validation error", detail: "请填写姓名。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (accountType is not ("driver" or "company"))
        {
            return Problem(title: "Validation error", detail: "只能注册司导或公司账户。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await db.Users.AnyAsync(user => user.Username.ToLower() == username.ToLower(), cancellationToken))
        {
            return Problem(title: "Validation error", detail: "用户名已被使用。", statusCode: StatusCodes.Status400BadRequest);
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            PasswordHash = PasswordHashing.Hash(request.Password),
            Name = name,
            Role = accountType == "company" ? UserRoles.Company : UserRoles.Driver
        };

        if (accountType == "company")
        {
            var companyName = request.CompanyName?.Trim() ?? "";
            if (companyName.Length is < 1 or > 200)
            {
                return Problem(title: "Validation error", detail: "请填写公司名称。", statusCode: StatusCodes.Status400BadRequest);
            }

            if (await db.Companies.AnyAsync(company => company.Name.ToLower() == companyName.ToLower(), cancellationToken))
            {
                return Problem(title: "Validation error", detail: "公司名称已被使用。", statusCode: StatusCodes.Status400BadRequest);
            }

            var company = new Company { Id = Guid.NewGuid(), Name = companyName };
            db.Companies.Add(company);
            user.CompanyId = company.Id;
            user.Company = company;
        }

        db.Users.Add(user);
        DriverIdentity.Attach(db, user);
        await db.SaveChangesAsync(cancellationToken);
        await session.SignInAsync(user);
        return Ok(ToSession(user));
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<SessionUserDto>> Login(LoginDto request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var user = await session.Query()
            .FirstOrDefaultAsync(item => item.Username.ToLower() == username.ToLower(), cancellationToken);
        if (user is null || !PasswordHashing.Verify(request.Password, user.PasswordHash))
        {
            return Problem(title: "Login failed", detail: "用户名或密码不正确。", statusCode: StatusCodes.Status401Unauthorized);
        }

        await DriverIdentity.EnsureAsync(db, user, cancellationToken);
        await session.SignInAsync(user);
        return Ok(ToSession(user));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await session.SignOutAsync();
        return NoContent();
    }

    [HttpGet("me")]
    public async Task<ActionResult<SessionUserDto>> Me(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        await DriverIdentity.EnsureAsync(db, user, cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpPost("avatar")]
    [RequestSizeLimit(8_000_000)]
    public async Task<ActionResult<SessionUserDto>> UploadAvatar(IFormFile file, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var (path, error) = await files.SaveAsync(
            StoredFileKind.Avatar,
            user.Id,
            file,
            user.AvatarPath,
            AppFileStore.ImageExtensions,
            AppFileStore.AvatarUploadLimit,
            "头像请上传 8MB 以内的 jpg / png / webp。",
            cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        user.AvatarPath = path;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpPut("name")]
    public async Task<ActionResult<SessionUserDto>> UpdateName(
        ProfileNameWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var name = request.Name?.Trim() ?? "";
        if (name.Length is < 1 or > 100)
        {
            return Problem(title: "Validation error", detail: "请填写姓名。", statusCode: StatusCodes.Status400BadRequest);
        }

        user.Name = name;
        if (user.DriverId is Guid driverId)
        {
            var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == driverId, cancellationToken);
            if (driver is not null)
            {
                driver.Name = name;
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpPut("username")]
    public async Task<ActionResult<SessionUserDto>> UpdateUsername(
        ProfileUsernameWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var username = request.Username?.Trim() ?? "";
        if (username.Length is < 3 or > 50)
        {
            return Problem(title: "Validation error", detail: "用户名需要 3 到 50 个字符。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (!string.Equals(user.Username, username, StringComparison.Ordinal))
        {
            var taken = await db.Users.AnyAsync(
                item => item.Id != user.Id && item.Username.ToLower() == username.ToLower(),
                cancellationToken);
            if (taken)
            {
                return Problem(title: "Validation error", detail: "用户名已被使用。", statusCode: StatusCodes.Status400BadRequest);
            }

            user.Username = username;
            await db.SaveChangesAsync(cancellationToken);
            await session.SignInAsync(user);
        }

        return Ok(ToSession(user));
    }

    [HttpPut("password")]
    public async Task<ActionResult<SessionUserDto>> UpdatePassword(
        ProfilePasswordWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrEmpty(request.CurrentPassword) || !PasswordHashing.Verify(request.CurrentPassword, user.PasswordHash))
        {
            return Problem(title: "Validation error", detail: "当前密码不正确。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 8)
        {
            return Problem(title: "Validation error", detail: "密码至少 8 位。", statusCode: StatusCodes.Status400BadRequest);
        }

        user.PasswordHash = PasswordHashing.Hash(request.Password);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpPut("contact")]
    public async Task<ActionResult<SessionUserDto>> UpdateContact(
        ProfileContactWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var contact = request.Contact?.Trim() ?? "";
        if (contact.Length > 200)
        {
            return Problem(title: "Validation error", detail: "联系方式不能超过 200 个字。", statusCode: StatusCodes.Status400BadRequest);
        }

        user.Contact = contact.Length == 0 ? null : contact;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpPut("assigned-color")]
    public async Task<ActionResult<SessionUserDto>> UpdateAssignedColor(
        AssignedColorWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (!AssignedColors.IsAllowed(request.AssignedColor))
        {
            return Problem(title: "Validation error", detail: "只能选择已提供的已分配颜色。", statusCode: StatusCodes.Status400BadRequest);
        }

        user.AssignedColor = AssignedColors.Resolve(request.AssignedColor);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToSession(user));
    }

    [HttpGet("avatar")]
    public async Task<IActionResult> Avatar(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var opened = files.Open(user.AvatarPath);
        if (opened is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "private, max-age=86400";
        return PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    internal static SessionUserDto ToSession(User user)
    {
        var companies = CompanyBriefDto.FromMemberships(user);

        var pending = user.Applications
            .OrderBy(item => item.CreatedAt)
            .Select(item => new PendingApplicationDto
            {
                Id = item.Id,
                CompanyId = item.CompanyId,
                CompanyName = item.Company.Name
            })
            .ToList();

        var pendingDrivers = user.DriverApplications
            .Where(item => item.ApprovedAt is null)
            .OrderBy(item => item.CreatedAt)
            .Select(item => new PendingDriverApplicationDto
            {
                Id = item.Id,
                DispatcherUserId = item.DispatcherUserId,
                DispatcherName = item.Dispatcher.Name
            })
            .ToList();

        return new SessionUserDto
        {
            Id = user.Id,
            Username = user.Username,
            Name = user.Name,
            Contact = user.Contact,
            Role = user.Role,
            CompanyId = companies.FirstOrDefault()?.Id ?? user.CompanyId,
            CompanyName = companies.FirstOrDefault()?.Name ?? user.Company?.Name,
            DriverId = user.DriverId,
            HasAvatar = !string.IsNullOrWhiteSpace(user.AvatarPath),
            AssignedColor = AssignedColors.Resolve(user.AssignedColor),
            Companies = companies,
            PendingApplications = pending,
            PendingDriverApplications = pendingDrivers
        };
    }
}
