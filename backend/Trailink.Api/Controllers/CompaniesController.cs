using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/companies")]
public class CompaniesController(TrailinkDbContext db, AuthSession session) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CompanyBriefDto>>> Search(
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
            return Ok(new List<CompanyBriefDto>());
        }

        var companies = await db.Companies
            .Where(company => company.Name.ToLower().Contains(keyword.ToLower()))
            .OrderBy(company => company.Name)
            .Take(20)
            .Select(company => new CompanyBriefDto { Id = company.Id, Name = company.Name })
            .ToListAsync(cancellationToken);
        return Ok(companies);
    }

    [HttpPost("applications")]
    public async Task<ActionResult<PendingApplicationDto>> Apply(
        ApplyDispatcherDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.Role == UserRoles.Company)
        {
            return Problem(title: "Validation error", detail: "公司账户不能申请加入其他公司。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (user.Memberships.Any(member =>
                member.CompanyId == request.CompanyId && member.Role == UserRoles.Dispatcher))
        {
            return Problem(title: "Validation error", detail: "已经是这家公司的调度员。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (user.Applications.Any(item => item.CompanyId == request.CompanyId))
        {
            return Problem(title: "Validation error", detail: "已经申请过这家公司。", statusCode: StatusCodes.Status400BadRequest);
        }

        var company = await db.Companies.FirstOrDefaultAsync(item => item.Id == request.CompanyId, cancellationToken);
        if (company is null)
        {
            return NotFound();
        }

        var application = new DispatcherApplication
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            CompanyId = company.Id,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.DispatcherApplications.Add(application);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new PendingApplicationDto
        {
            Id = application.Id,
            CompanyId = company.Id,
            CompanyName = company.Name
        });
    }
}
