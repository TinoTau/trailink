using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/dispatchers")]
public class DispatchersController(TrailinkDbContext db, AuthSession session, OrderDriverAssignment assignment) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DispatcherSearchDto>>> Search(
        [FromQuery] string? name,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var keyword = name?.Trim() ?? "";
        if (keyword.Length < 1)
        {
            return Ok(new List<DispatcherSearchDto>());
        }

        var dispatchers = await db.Users
            .Where(item =>
                (item.Role == UserRoles.Dispatcher || item.Role == UserRoles.Company) &&
                item.Id != user.Id &&
                item.Name.ToLower().Contains(keyword.ToLower()))
            .OrderBy(item => item.Name)
            .Take(20)
            .Select(item => new DispatcherSearchDto { Id = item.Id, Name = item.Name })
            .ToListAsync(cancellationToken);
        return Ok(dispatchers);
    }

    [HttpPost("applications")]
    public async Task<ActionResult<PendingDriverApplicationDto>> Apply(
        ApplyDriverDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.Role == UserRoles.Company)
        {
            return Problem(title: "Validation error", detail: "公司账户不能申请成为司导。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (user.Id == request.DispatcherUserId)
        {
            return Problem(title: "Validation error", detail: "不能向自己申请。", statusCode: StatusCodes.Status400BadRequest);
        }

        var dispatcher = await db.Users
            .Include(item => item.Memberships)
            .ThenInclude(member => member.Company)
            .FirstOrDefaultAsync(item => item.Id == request.DispatcherUserId, cancellationToken);
        if (dispatcher is null || dispatcher.Role is not (UserRoles.Dispatcher or UserRoles.Company))
        {
            return Problem(title: "Validation error", detail: "没有找到这位调度员或公司账户。", statusCode: StatusCodes.Status400BadRequest);
        }

        var companyIds = HostCompanyIds(dispatcher);
        if (companyIds.Count == 0)
        {
            return Problem(title: "Validation error", detail: "这位调度员还没有所属公司。", statusCode: StatusCodes.Status400BadRequest);
        }

        var existing = user.DriverApplications.FirstOrDefault(item => item.DispatcherUserId == dispatcher.Id);
        if (existing?.ApprovedAt is not null)
        {
            return Problem(title: "Validation error", detail: "已经是这位调度员的司导。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (existing is not null)
        {
            return Problem(title: "Validation error", detail: "已经向这位调度员申请过。", statusCode: StatusCodes.Status400BadRequest);
        }

        var application = new DriverApplication
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DispatcherUserId = dispatcher.Id,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.DriverApplications.Add(application);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new PendingDriverApplicationDto
        {
            Id = application.Id,
            DispatcherUserId = dispatcher.Id,
            DispatcherName = dispatcher.Name
        });
    }

    [HttpGet("applications")]
    public async Task<ActionResult<List<DriverApplicantDto>>> Incoming(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.Role is not (UserRoles.Dispatcher or UserRoles.Company))
        {
            return Forbid();
        }

        var incoming = await db.DriverApplications
            .Include(item => item.User)
            .Where(item => item.DispatcherUserId == user.Id && item.ApprovedAt == null)
            .OrderBy(item => item.CreatedAt)
            .Select(item => new DriverApplicantDto
            {
                Id = item.Id,
                UserId = item.UserId,
                Username = item.User.Username,
                Name = item.User.Name,
                Contact = item.User.Contact
            })
            .ToListAsync(cancellationToken);
        return Ok(incoming);
    }

    [HttpPost("applications/{applicationId:guid}/approve")]
    public async Task<ActionResult<List<DriverApplicantDto>>> Approve(
        Guid applicationId,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.Role is not (UserRoles.Dispatcher or UserRoles.Company))
        {
            return Forbid();
        }

        var application = await db.DriverApplications
            .Include(item => item.User)
            .ThenInclude(applicant => applicant.Memberships)
            .FirstOrDefaultAsync(
                item => item.Id == applicationId && item.DispatcherUserId == user.Id && item.ApprovedAt == null,
                cancellationToken);
        if (application is null)
        {
            return NotFound();
        }

        var companyIds = HostCompanyIds(user);
        if (companyIds.Count == 0)
        {
            return Problem(title: "Validation error", detail: "还没有所属公司，无法批准司导。", statusCode: StatusCodes.Status400BadRequest);
        }

        var applicant = application.User;
        foreach (var companyId in companyIds)
        {
            if (applicant.Memberships.Any(member => member.CompanyId == companyId))
            {
                continue;
            }

            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = applicant.Id,
                CompanyId = companyId,
                Role = UserRoles.Driver
            });
        }

        application.ApprovedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await Incoming(cancellationToken);
    }

    [HttpDelete("drivers/{driverId:guid}")]
    public async Task<IActionResult> UnbindDriver(Guid driverId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.Role != UserRoles.Dispatcher)
        {
            return Forbid();
        }

        var application = await db.DriverApplications
            .FirstOrDefaultAsync(
                item => item.DispatcherUserId == user.Id
                    && item.ApprovedAt != null
                    && item.User.DriverId == driverId,
                cancellationToken);
        if (application is null)
        {
            return NotFound();
        }

        if (user.DriverId == driverId)
        {
            return Problem(title: "Validation error", detail: "不能解除自己的司导身份。", statusCode: StatusCodes.Status400BadRequest);
        }

        await assignment.ReclaimUnfinishedDaysAsync(user, driverId, cancellationToken);
        db.DriverApplications.Remove(application);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static List<Guid> HostCompanyIds(User user)
    {
        if (user.Role == UserRoles.Company && user.CompanyId is Guid companyId)
        {
            return [companyId];
        }

        return user.Memberships
            .Where(member => member.Role == UserRoles.Dispatcher)
            .Select(member => member.CompanyId)
            .Distinct()
            .ToList();
    }
}
