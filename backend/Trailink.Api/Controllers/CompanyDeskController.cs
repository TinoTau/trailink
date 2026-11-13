using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;
using Trailink.Api.Services.Export;

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

    /// <summary>
    /// 公司信息页的订单记录，按 <c>scope</c> 过滤（见 <see cref="CompanyOrderScopes"/>）：
    /// all 本公司全部（只有公司账户），desk 自己调度台上的（公司账户、调度员），driver 派给自己跑的（所有人）。
    /// 不传时用这个角色能看的第一项；不在角色范围内的 403。
    /// 不管完成没有都给，按开始日期从早到晚；界面自己滚到今天。
    /// </summary>
    [HttpGet("orders")]
    public async Task<ActionResult<List<CompanyOrderRecordDto>>> Orders(
        [FromQuery] Guid companyId,
        [FromQuery] string? scope,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var (records, error, _) = await LoadRecordsAsync(user, companyId, scope, cancellationToken);
        return error ?? Ok(records);
    }

    /// <summary>
    /// 导出订单记录为 Excel：范围同 <see cref="Orders"/>（当前下拉框选的那一项），全部记录（不只是屏幕上看到的 10 行）。
    /// 样式是默认的「订单记录」表：浅蓝表头、绿色年份行、行程路线左对齐。
    /// </summary>
    [HttpGet("orders/export")]
    public async Task<IActionResult> ExportOrders(
        [FromQuery] Guid companyId,
        [FromQuery] string? scope,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var (records, error, chosen) = await LoadRecordsAsync(user, companyId, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var rows = await ExportRowsAsync(user, companyId, records!, cancellationToken);
        var bytes = OrderRecordSheet.BuildDefault(rows);
        Response.Headers["X-Export-Added"] = rows.Count.ToString();
        return File(bytes, OrderRecordSheet.ContentType, ExportFileName(chosen, null));
    }

    /// <summary>
    /// 把订单记录填进用户上传的表格（.xlsx，空表或已有内容的都可以）：
    /// 配了 AI 密钥时让 AI 看表头和已有的几行，认出每一列是什么、从哪一行往下写、日期怎么写；
    /// 没配或 AI 失败时按表头文字自己找。表里已有的单（系统订单号对得上，没有订单号时起止日期和行程 / 负责人对得上）
    /// 就地更新司导、车辆和订单信息，新单接在后面；没有「系统订单号」一列时在最右边加上。
    /// 文件名是「原文件名-年月日-时分秒.xlsx」。结果里 <c>X-Export-Added</c> / <c>X-Export-Updated</c> / <c>X-Export-Skipped</c>
    /// 是新增、更新、没变化的条数，<c>X-Export-Mode</c> 是 ai / auto。
    /// </summary>
    [HttpPost("orders/export")]
    [RequestSizeLimit(OrderRecordSheet.MaxUploadBytes + 64 * 1024)]
    public async Task<IActionResult> FillOrders(
        [FromQuery] Guid companyId,
        [FromQuery] string? scope,
        IFormFile? file,
        [FromServices] OrderRecordSheetFiller filler,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (file is null || file.Length == 0)
        {
            return this.Invalid("请选择要填写的表格文件。");
        }

        if (file.Length > OrderRecordSheet.MaxUploadBytes)
        {
            return this.Invalid("表格太大了，最大 5MB。");
        }

        if (!OrderRecordSheet.IsXlsx(file.FileName))
        {
            return this.Invalid("只支持 .xlsx 格式的表格。旧版 .xls 请先在 Excel 或 WPS 里另存为 .xlsx。");
        }

        var (records, error, chosen) = await LoadRecordsAsync(user, companyId, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var rows = await ExportRowsAsync(user, companyId, records!, cancellationToken);
        await using var input = new MemoryStream();
        await file.CopyToAsync(input, cancellationToken);
        input.Position = 0;
        var result = await filler.FillAsync(input, rows, cancellationToken);
        if (result.Error is string fillError)
        {
            return this.Invalid(fillError);
        }

        Response.Headers["X-Export-Added"] = result.Added.ToString();
        Response.Headers["X-Export-Updated"] = result.Updated.ToString();
        Response.Headers["X-Export-Skipped"] = result.Skipped.ToString();
        Response.Headers["X-Export-Mode"] = result.Mode;
        return File(result.Bytes!, OrderRecordSheet.ContentType, ExportFileName(chosen, file.FileName));
    }

    private static string ExportFileName(string scope, string? uploaded)
    {
        // 文件名带新西兰时间的日期和时分秒，多次导出不重名。上传的表格保留原来的名字。
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, BusinessDate.Zone);
        var stamp = now.ToString("yyyyMMdd-HHmmss");
        if (uploaded is not null)
        {
            var name = Path.GetFileNameWithoutExtension(Path.GetFileName(uploaded));
            return $"{(string.IsNullOrWhiteSpace(name) ? "订单记录" : name)}-{stamp}.xlsx";
        }

        var label = scope switch
        {
            CompanyOrderScopes.Desk => "调度中",
            CompanyOrderScopes.Driver => "已接单",
            _ => "全部"
        };
        return $"订单记录-{label}-{stamp}.xlsx";
    }

    /// <summary>导出用的每一行：订单来源写这个账号给这家公司起的简称（没有就用公司名）。</summary>
    private async Task<List<OrderRecordRow>> ExportRowsAsync(
        User user,
        Guid companyId,
        List<CompanyOrderRecordDto> records,
        CancellationToken cancellationToken)
    {
        var companyName = await db.Companies
            .Where(company => company.Id == companyId)
            .Select(company => company.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "";
        var notes = await Services.CompanyNotes.EnsureAsync(db, user.Id, [(companyId, companyName)], cancellationToken);
        var source = notes.TryGetValue(companyId, out var note) && !string.IsNullOrWhiteSpace(note) ? note : companyName;
        return records.Select(record => OrderRecordRow.From(record, source)).ToList();
    }

    /// <summary>订单记录列表和导出共用：按角色检查范围，读出这家公司的单。范围不对时 <c>Error</c> 是 403。</summary>
    private async Task<(List<CompanyOrderRecordDto>? Records, ActionResult? Error, string Scope)> LoadRecordsAsync(
        User user,
        Guid companyId,
        string? scope,
        CancellationToken cancellationToken)
    {
        var isOwner = user.Role == UserRoles.Company && user.CompanyId == companyId;
        var allowed = CompanyOrderScopes.For(user, isOwner);
        var chosen = string.IsNullOrWhiteSpace(scope) ? allowed[0] : scope.Trim().ToLowerInvariant();
        if (!allowed.Contains(chosen))
        {
            // 过滤选项跟着角色走：司导不能看公司全部订单和调度手里的订单，调度员不能看公司全部订单。
            return (null, this.Forbidden("没有权限查看这个范围的订单。"), chosen);
        }

        var query = db.Orders.Where(order => order.CompanyId == companyId && order.Days.Count > 0);
        if (chosen == CompanyOrderScopes.Desk)
        {
            // 调度：自己调度台上的单（调度员是分配给自己的，公司账户和它的调度台同一条规则）。
            query = query.Where(OrderRules.OnDesk(user));
        }
        else if (chosen == CompanyOrderScopes.Driver)
        {
            // 司导：这家公司的单里派给自己跑的。
            if (user.DriverId is not Guid driverId)
            {
                return ([], null, chosen);
            }

            query = query.Where(order => order.Days.Any(day => day.DriverId == driverId));
        }

        var orders = await query
            .Include(order => order.Days).ThenInclude(day => day.Driver)
            .Include(order => order.Days).ThenInclude(day => day.Vehicle)
            .OrderBy(order => order.StartDate)
            .ThenBy(order => order.OrderNo)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var manages = user.Role is UserRoles.Dispatcher or UserRoles.Company;
        // 只给自己管的单开操作：公司账户管本公司全部，调度员管自己调度台上的。只是自己跑的单只能看。
        bool Manages(Order order) => manages && (isOwner || OrderRules.IsOnDesk(order, user));
        var records = orders.Select(order =>
        {
            var days = order.Days.OrderBy(day => day.ServiceDate).ToList();
            var drivers = days
                .Where(day => day.Driver is not null)
                .Select(day => day.Driver!)
                .DistinctBy(driver => driver.Id)
                .ToList();
            var vehicles = days
                .Where(day => day.Vehicle is not null)
                .Select(day => day.Vehicle!)
                .DistinctBy(vehicle => vehicle.Id)
                .ToList();
            var onDesk = manages && OrderRules.IsOnDesk(order, user);
            return new CompanyOrderRecordDto
            {
                Id = order.Id,
                OrderNo = order.OrderNo,
                Label = OrderRules.Label(order.PlatformOrderNo, order.SharedNotes),
                GuestCount = order.GuestCount,
                VehicleType = order.VehicleType,
                Island = order.Island,
                StartDate = days[0].ServiceDate,
                EndDate = days[^1].ServiceDate,
                DayCount = days.Count,
                Route = order.SharedNotes,
                Drivers = drivers.Select(driver => driver.Name).ToList(),
                DriverIds = drivers.Select(driver => driver.Id).ToList(),
                Plates = vehicles.Select(vehicle => vehicle.Plate).ToList(),
                VehicleIds = vehicles.Select(vehicle => vehicle.Id).ToList(),
                OnDesk = onDesk,
                UnassignedDays = days.Count(day => day.DriverId is null),
                NoVehicleDays = days.Count(day => day.VehicleId is null),
                ShareLevel = order.ShareLevel,
                CanEdit = Manages(order),
                CanSetShareLevel = Manages(order) && OrderRules.CanSetShareLevel(order, user),
                CanReturn = onDesk && OrderRules.IsRealOrder(order)
            };
        }).ToList();
        return (records, null, chosen);
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
                : []
        };
    }
}

/// <summary>公司信息「订单记录」的过滤范围，能看哪些跟着角色走。</summary>
public static class CompanyOrderScopes
{
    public const string All = "all";
    public const string Desk = "desk";
    public const string Driver = "driver";

    /// <summary>这个账号在这家公司能选的范围，第一项是默认。</summary>
    public static string[] For(User user, bool isOwner) =>
        isOwner ? [All, Desk, Driver]
        : user.Role is UserRoles.Dispatcher or UserRoles.Company ? [Desk, Driver]
        : [Driver];
}
