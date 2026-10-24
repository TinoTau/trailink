using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/company")]
public class CompanyDeskController(TrailinkDbContext db, AuthSession session, AppFileStore files) : ControllerBase
{

    [HttpGet]
    public async Task<ActionResult<CompanyHomeDto>> Get(
        [FromQuery] Guid? companyId,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var companies = await ListCompaniesAsync(user, cancellationToken);
        var selectedId = companyId
            ?? companies.FirstOrDefault()?.Id
            ?? user.CompanyId;
        var desk = selectedId is Guid id
            ? await BuildDeskAsync(user, id, cancellationToken)
            : null;
        if (desk is null && companies.FirstOrDefault()?.Id is Guid fallbackId && fallbackId != selectedId)
        {
            desk = await BuildDeskAsync(user, fallbackId, cancellationToken);
        }

        return Ok(new CompanyHomeDto { Companies = companies, Desk = desk });
    }

    [HttpPut]
    public async Task<ActionResult<CompanyHomeDto>> UpdateContact(
        CompanyContactDto request,
        CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null || company.Id != request.CompanyId)
        {
            return Forbid();
        }

        var contact = request.Contact?.Trim();
        company.Contact = string.IsNullOrWhiteSpace(contact) ? null : contact[..Math.Min(contact.Length, 200)];
        await db.SaveChangesAsync(cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    [HttpPost("qr")]
    [RequestSizeLimit(1_000_000)]
    public async Task<ActionResult<CompanyHomeDto>> UploadQr(
        [FromForm] Guid companyId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null || company.Id != companyId)
        {
            return Forbid();
        }

        var (path, error) = await files.SaveAsync(
            StoredFileKind.Qr,
            company.Id,
            file,
            company.QrPath,
            AppFileStore.ImageExtensions,
            AppFileStore.ImageLimit,
            "二维码请上传 1MB 以内的 jpg / png / webp。",
            cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        company.QrPath = path;
        await db.SaveChangesAsync(cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    [HttpGet("{companyId:guid}/qr")]
    public async Task<IActionResult> Qr(Guid companyId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var companies = await ListCompaniesAsync(user, cancellationToken);
        if (companies.All(item => item.Id != companyId))
        {
            return Forbid();
        }

        var company = await db.Companies.FirstOrDefaultAsync(item => item.Id == companyId, cancellationToken);
        var opened = files.Open(company?.QrPath);
        return opened is null ? NotFound() : PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    [HttpPost("applications/{applicationId:guid}/approve")]
    public async Task<ActionResult<CompanyHomeDto>> Approve(Guid applicationId, CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var application = await db.DispatcherApplications
            .Include(item => item.User)
            .FirstOrDefaultAsync(item => item.Id == applicationId && item.CompanyId == company.Id, cancellationToken);
        if (application is null)
        {
            return NotFound();
        }

        var membership = await db.CompanyMembers.FirstOrDefaultAsync(
            member => member.UserId == application.UserId && member.CompanyId == company.Id,
            cancellationToken);
        if (membership is null)
        {
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = application.UserId,
                CompanyId = company.Id,
                Role = UserRoles.Dispatcher
            });
        }
        else
        {
            membership.Role = UserRoles.Dispatcher;
        }

        if (application.User.Role != UserRoles.Company)
        {
            application.User.Role = UserRoles.Dispatcher;
        }

        db.DispatcherApplications.Remove(application);
        await db.SaveChangesAsync(cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    [HttpDelete("dispatchers/{userId:guid}")]
    public async Task<ActionResult<CompanyHomeDto>> RemoveDispatcher(Guid userId, CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var member = await db.CompanyMembers
            .Include(item => item.User)
            .ThenInclude(user => user.Memberships)
            .FirstOrDefaultAsync(
                item => item.UserId == userId && item.CompanyId == company.Id && item.Role == UserRoles.Dispatcher,
                cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        var user = member.User;
        if (user.DriverId is not null)
        {
            member.Role = UserRoles.Driver;
        }
        else
        {
            db.CompanyMembers.Remove(member);
        }

        if (user.Role == UserRoles.Dispatcher &&
            !user.Memberships.Any(item => item.Id != member.Id && item.Role == UserRoles.Dispatcher))
        {
            user.Role = UserRoles.Driver;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    private async Task<Company?> LoadOwnedCompanyAsync(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null || user.Role != UserRoles.Company || user.CompanyId is not Guid companyId)
        {
            return null;
        }

        return await db.Companies.FirstOrDefaultAsync(company => company.Id == companyId, cancellationToken);
    }

    private async Task<List<CompanyBriefDto>> ListCompaniesAsync(User user, CancellationToken cancellationToken)
    {
        var result = CompanyBriefDto.FromMemberships(user);

        if (user.DriverId is Guid driverId)
        {
            var driven = await db.Orders
                .Where(order => order.CompanyId != null && order.Days.Any(day => day.DriverId == driverId))
                .Select(order => new { order.CompanyId, order.Company!.Name })
                .Distinct()
                .ToListAsync(cancellationToken);
            foreach (var item in driven.OrderBy(row => row.Name))
            {
                if (item.CompanyId is Guid id && result.All(company => company.Id != id))
                {
                    result.Add(new CompanyBriefDto { Id = id, Name = item.Name });
                }
            }
        }

        return result;
    }

    private async Task<CompanyDeskDto?> BuildDeskAsync(User user, Guid companyId, CancellationToken cancellationToken)
    {
        var company = await db.Companies
            .Include(item => item.Applications)
            .ThenInclude(application => application.User)
            .Include(item => item.Members)
            .ThenInclude(member => member.User)
            .FirstOrDefaultAsync(item => item.Id == companyId, cancellationToken);
        if (company is null)
        {
            return null;
        }

        var owner = await db.Users.FirstOrDefaultAsync(
            item => item.Role == UserRoles.Company && item.CompanyId == company.Id,
            cancellationToken);
        var isOwner = user.Role == UserRoles.Company && user.CompanyId == company.Id;
        var isMember = user.Memberships.Any(member => member.CompanyId == company.Id);
        var drivenOrderIds = user.DriverId is Guid driverId
            ? await db.Orders
                .Where(order => order.CompanyId == company.Id && order.Days.Any(day => day.DriverId == driverId))
                .Select(order => order.Id)
                .ToListAsync(cancellationToken)
            : [];
        if (!isOwner && !isMember && drivenOrderIds.Count == 0)
        {
            return null;
        }

        var ordersQuery = db.Orders.Where(order => order.CompanyId == company.Id);
        if (!isOwner)
        {
            ordersQuery = ordersQuery.Where(order =>
                order.CreatedByUserId == user.Id ||
                (user.DriverId != null && order.Days.Any(day => day.DriverId == user.DriverId)));
        }

        var orders = await ordersQuery
            .Include(order => order.Days)
            .OrderByDescending(order => order.StartDate)
            .ThenBy(order => order.OrderNo)
            .Take(80)
            .ToListAsync(cancellationToken);

        return new CompanyDeskDto
        {
            Id = company.Id,
            Name = company.Name,
            OwnerName = owner?.Name ?? "",
            Contact = company.Contact,
            HasQr = !string.IsNullOrWhiteSpace(company.QrPath),
            CanEdit = isOwner,
            CanManage = isOwner,
            Applications = isOwner
                ? company.Applications
                    .OrderBy(application => application.CreatedAt)
                    .Select(application => new CompanyApplicationDto
                    {
                        Id = application.Id,
                        UserId = application.UserId,
                        Username = application.User.Username,
                        Name = application.User.Name
                    })
                    .ToList()
                : [],
            Dispatchers = isOwner
                ? company.Members
                    .Where(member => member.Role == UserRoles.Dispatcher)
                    .OrderBy(member => member.User.Name)
                    .Select(member => new CompanyMemberDto
                    {
                        UserId = member.UserId,
                        Username = member.User.Username,
                        Name = member.User.Name
                    })
                    .ToList()
                : [],
            Orders = orders.Select(order => new CompanyOrderDto
            {
                Id = order.Id,
                OrderNo = order.OrderNo,
                StartDate = order.StartDate,
                DayCount = order.Days.Count,
                Kind = isOwner
                    ? "company"
                    : order.CreatedByUserId == user.Id
                        ? "assigned"
                        : "driven"
            }).ToList()
        };
    }
}
