using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/company")]
public class CompanyDeskController(
    TrailinkDbContext db,
    AuthSession session,
    AppFileStore files,
    OrderDriverAssignment assignment) : ControllerBase
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
        var notes = await Services.CompanyNotes.EnsureAsync(
            db,
            user.Id,
            companies.Select(company => (company.Id, company.Name)),
            cancellationToken);
        foreach (var company in companies)
        {
            if (notes.TryGetValue(company.Id, out var note))
            {
                company.Notes = note;
            }
        }
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

        if (request.Name is not null)
        {
            var name = request.Name.Trim();
            if (await AccountText.CompanyNameErrorAsync(db, name, company.Id, cancellationToken) is string companyError)
            {
                return this.Invalid(companyError);
            }

            company.Name = name;
        }

        if (request.Contact is not null)
        {
            var contact = request.Contact.Trim();
            company.Contact = string.IsNullOrWhiteSpace(contact) ? null : contact[..Math.Min(contact.Length, 200)];
        }

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
            "公司头像请上传 1MB 以内的 jpg / png / webp。",
            cancellationToken);
        if (error is not null)
        {
            return this.Invalid(error);
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
        return this.StoredFile(files, company?.QrPath);
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

    [HttpGet("dispatchers/{userId:guid}/avatar")]
    public async Task<IActionResult> DispatcherAvatar(Guid userId, CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var listed = await CompanyMembership.IsDispatcherAsync(db, company.Id, userId, cancellationToken);
        if (!listed)
        {
            return NotFound();
        }

        var path = await db.Users
            .Where(item => item.Id == userId)
            .Select(item => item.AvatarPath)
            .FirstOrDefaultAsync(cancellationToken);
        return this.StoredFile(files, path, "private, no-cache");
    }

    [HttpDelete("dispatchers/{userId:guid}")]
    public async Task<ActionResult<CompanyHomeDto>> RemoveDispatcher(Guid userId, CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var actor = await session.GetUserAsync(cancellationToken);
        if (actor?.Id == userId)
        {
            return this.Invalid("不能解除自己的调度员身份。");
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

        await assignment.ReturnUnfinishedOrdersAsync(company.Id, userId, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    [HttpPut("dispatchers/{userId:guid}/hidden")]
    public async Task<IActionResult> SetDispatcherHidden(
        Guid userId,
        DriverHiddenWriteDto request,
        CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var listed = await CompanyMembership.IsDispatcherAsync(db, company.Id, userId, cancellationToken);
        if (!listed)
        {
            return NotFound();
        }

        if (session.UserId is not Guid actorId)
        {
            return Forbid();
        }

        await ViewerNotes.SetDispatcherHiddenAsync(db, userId, actorId, request.Hidden, cancellationToken);
        return NoContent();
    }

    [HttpPut("notes")]
    public async Task<ActionResult<CompanyHomeDto>> UpdateNotes(
        CompanyNoteWriteDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (!await CanViewCompanyAsync(user, request.CompanyId, cancellationToken))
        {
            return Forbid();
        }

        var trimmed = request.Notes?.Trim();
        if (trimmed is { Length: > 20 })
        {
            return this.Invalid("公司简称不能超过 20 个字。");
        }

        if (string.IsNullOrEmpty(trimmed))
        {
            var companyName = await db.Companies
                .Where(company => company.Id == request.CompanyId)
                .Select(company => company.Name)
                .FirstAsync(cancellationToken);
            trimmed = await Services.CompanyNotes.DefaultForUserAsync(
                db,
                user.Id,
                request.CompanyId,
                companyName,
                cancellationToken);
        }

        if (!string.IsNullOrEmpty(trimmed))
        {
            await Services.CompanyNotes.UpsertAsync(db, request.CompanyId, user.Id, trimmed, cancellationToken);
        }

        return await Get(request.CompanyId, cancellationToken);
    }

    [HttpPut("dispatchers/{userId:guid}/notes")]
    public async Task<ActionResult<CompanyHomeDto>> UpdateDispatcherNotes(
        Guid userId,
        DispatcherNoteWriteDto request,
        CancellationToken cancellationToken)
    {
        var company = await LoadOwnedCompanyAsync(cancellationToken);
        if (company is null)
        {
            return Forbid();
        }

        var isDispatcher = await CompanyMembership.IsDispatcherAsync(db, company.Id, userId, cancellationToken);
        if (!isDispatcher)
        {
            return this.Invalid("只能给本公司的调度员写备注。");
        }

        if (session.UserId is not Guid actorId)
        {
            return Forbid();
        }

        await ViewerNotes.UpsertDispatcherAsync(db, userId, actorId, request.Notes, cancellationToken);
        return await Get(company.Id, cancellationToken);
    }

    private async Task<bool> CanViewCompanyAsync(User user, Guid companyId, CancellationToken cancellationToken)
    {
        if (user.Role == UserRoles.Company && user.CompanyId == companyId)
        {
            return true;
        }

        if (user.Memberships.Any(member => member.CompanyId == companyId))
        {
            return true;
        }

        return await HandledOrderQuery(user)
            .AnyAsync(order => order.CompanyId == companyId, cancellationToken);
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
        var handled = await HandledOrderQuery(user)
            .Select(order => new { order.CompanyId, order.Company!.Name })
            .Distinct()
            .ToListAsync(cancellationToken);
        foreach (var item in handled.OrderBy(row => row.Name))
        {
            if (item.CompanyId is Guid id && result.All(company => company.Id != id))
            {
                result.Add(new CompanyBriefDto { Id = id, Name = item.Name });
            }
        }

        return result;
    }

    private IQueryable<Order> HandledOrderQuery(User user)
    {
        return db.Orders.Where(order =>
            order.CompanyId != null &&
            (order.CreatedByUserId == user.Id ||
             order.AssignedDispatcherUserId == user.Id ||
             order.Days.Any(day => day.AssignedByUserId == user.Id) ||
             (user.DriverId != null && order.Days.Any(day => day.DriverId == user.DriverId))));
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
        var handled = await HandledOrderQuery(user).AnyAsync(order => order.CompanyId == company.Id, cancellationToken);
        if (!isOwner && !isMember && !handled)
        {
            return null;
        }

        var noteRows = isOwner
            ? await db.DispatcherNotes
                .Where(note => note.UserId == user.Id)
                .Select(note => new { note.DispatcherUserId, note.Notes, note.Hidden })
                .ToListAsync(cancellationToken)
            : [];
        var dispatcherNotes = noteRows.ToDictionary(note => note.DispatcherUserId, note => note.Notes);
        var dispatcherHidden = noteRows.ToDictionary(note => note.DispatcherUserId, note => note.Hidden);

        var ordersQuery = db.Orders.Where(order =>
            order.CompanyId == company.Id &&
            order.Days.Count > 0);
        if (isOwner)
        {
            ordersQuery = ordersQuery.Where(OrderRules.Historical(BusinessDate.Today));
        }
        else
        {
            var drove = user.DriverId != null;
            var driverId = user.DriverId;
            var assigns = user.Role == UserRoles.Dispatcher;
            ordersQuery = ordersQuery.Where(order =>
                (assigns && order.Days.Any(day => day.AssignedByUserId == user.Id)) ||
                (drove && order.Days.Any(day => day.DriverId == driverId)));
        }

        var orders = await ordersQuery
            .Include(order => order.Days)
            .OrderByDescending(order => order.StartDate)
            .ThenBy(order => order.OrderNo)
            .Take(80)
            .ToListAsync(cancellationToken);
        var orderIds = orders.Select(order => order.Id).ToList();
        var viewerNotes = await ViewerNotes.OrderNotesAsync(db, user, orderIds, cancellationToken);

        return new CompanyDeskDto
        {
            Id = company.Id,
            Name = company.Name,
            OwnerName = owner?.Name ?? "",
            Contact = company.Contact,
            Notes = await db.CompanyNotes
                .Where(note => note.CompanyId == company.Id && note.UserId == user.Id)
                .Select(note => note.Notes)
                .FirstOrDefaultAsync(cancellationToken),
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
                        Name = application.User.Name,
                        Contact = application.User.Contact
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
                        Name = member.User.Name,
                        Contact = member.User.Contact,
                        Notes = dispatcherNotes.GetValueOrDefault(member.UserId),
                        Hidden = dispatcherHidden.GetValueOrDefault(member.UserId),
                        HasAvatar = !string.IsNullOrWhiteSpace(member.User.AvatarPath)
                    })
                    .ToList()
                : [],
            Orders = orders.Select(order => new CompanyOrderDto
            {
                Id = order.Id,
                OrderNo = order.OrderNo,
                PlatformOrderNo = order.PlatformOrderNo,
                Label = OrderRules.Label(order.PlatformOrderNo, order.SharedNotes),
                Notes = viewerNotes.GetValueOrDefault(order.Id),
                DriverNotes = user.Role == UserRoles.Driver ? order.DriverNotes : null,
                SharedNotes = order.SharedNotes,
                StartDate = order.StartDate,
                DayCount = order.Days.Count,
                Kind = isOwner
                    ? "company"
                    : user.Role == UserRoles.Dispatcher &&
                      order.Days.Any(day => day.AssignedByUserId == user.Id)
                        ? "assigned"
                        : "driven"
            }).ToList()
        };
    }
}
