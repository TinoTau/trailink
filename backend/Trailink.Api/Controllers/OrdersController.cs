using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(TrailinkDbContext db, OrderDriverAssignment assignment, AuthSession session, AppFileStore files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<OrderReadDto>>> List(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? orderNo,
        [FromQuery] Guid? driverId,
        CancellationToken cancellationToken)
    {
        var query = db.Orders
            .Include(order => order.Days)
            .ThenInclude(day => day.AssignedBy)
            .Include(order => order.Days)
            .ThenInclude(day => day.Driver)
            .Include(order => order.Days)
            .ThenInclude(day => day.Vehicle)
            .Include(order => order.Files)
            .Include(order => order.CreatedBy)
            .Include(order => order.Company)
            .Include(order => order.AssignedDispatcher)
            .AsQueryable();

        var user = await session.GetUserAsync(cancellationToken);
        var deskTrips = false;
        if (!string.IsNullOrWhiteSpace(orderNo))
        {
            var key = orderNo.Trim();
            query = query.Where(order =>
                order.OrderNo == key ||
                order.PlatformOrderNo == key);
        }
        else if (driverId is Guid requestedDriver)
        {
            if (user is not { Role: UserRoles.Dispatcher or UserRoles.Company }
                || !await DriverRoster.Visible(db, user).AnyAsync(driver => driver.Id == requestedDriver, cancellationToken))
            {
                return Ok(new List<OrderReadDto>());
            }

            deskTrips = true;
            query = query.Where(order => order.Days.Any(day => day.DriverId == requestedDriver));
        }
        else if (user?.Role == UserRoles.Dispatcher)
        {
            query = query.Where(order => order.AssignedDispatcherUserId == user.Id);
        }
        else if (user?.Role == UserRoles.Company && user.CompanyId is Guid companyId)
        {
            query = query.Where(order => order.CompanyId == companyId);
        }
        else if (user?.DriverId is Guid ownDriverId)
        {
            query = query.Where(order => order.Days.Any(day => day.DriverId == ownDriverId));
        }

        if (startDate is not null && endDate is not null)
        {
            query = query.Where(order =>
                order.Days.Any(day => day.ServiceDate >= startDate && day.ServiceDate <= endDate) ||
                (order.StartDate >= startDate && order.StartDate <= endDate));
        }

        var orders = await query
            .OrderBy(order => order.StartDate)
            .ThenBy(order => order.OrderNo)
            .ToListAsync(cancellationToken);
        var notes = await ViewerNotesAsync(user, cancellationToken);
        var notedOrders = deskTrips ? orders.Where(order => InDeskScope(user, order)) : orders;
        var companyNotes = await ViewerCompanyNotesAsync(user, notedOrders, cancellationToken);

        return Ok(orders.Select(order =>
        {
            var dto = VisibleNotes(ToSummary(order, notes.GetValueOrDefault(order.Id)), user?.Role);
            if (deskTrips && !InDeskScope(user, order))
            {
                HideOutsideDesk(dto);
            }
            else
            {
                ApplyCompanyNote(dto, companyNotes);
            }

            return dto;
        }).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderReadDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var order = await LoadOrderAsync(id, cancellationToken);
        var user = await session.GetUserAsync(cancellationToken);
        return order is null ? NotFound() : Ok(await PresentDetailAsync(order, user, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<OrderReadDto>> Create(OrderWriteDto request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var user = await session.GetUserAsync(cancellationToken);
        var (companyId, companyError) = await ResolveCreateCompanyIdAsync(user, request.CompanyId, cancellationToken);
        if (companyError is not null)
        {
            return Problem(title: "Validation error", detail: companyError, statusCode: StatusCodes.Status400BadRequest);
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNo = Order.NewOrderNo(),
            PlatformOrderNo = TextValue.NullIfBlank(request.PlatformOrderNo),
            StartDate = request.StartDate,
            GuestCount = request.GuestCount,
            DriverNotes = request.DriverNotes,
            SharedNotes = TextValue.NullIfBlank(request.SharedNotes),
            CreatedByUserId = user?.Id,
            CompanyId = companyId,
            AssignedDispatcherUserId = user?.Role == UserRoles.Dispatcher ? user.Id : null
        };

        db.Orders.Add(order);
        await db.SaveChangesAsync(cancellationToken);
        if (user?.Role != UserRoles.Driver)
        {
            await UpsertNoteAsync(order.Id, request.Notes, cancellationToken);
        }

        var created = await LoadOrderAsync(order.Id, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, await PresentDetailAsync(created!, user, cancellationToken));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<OrderReadDto>> Update(Guid id, OrderWriteDto request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var order = await LoadOrderAsync(id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        var user = await session.GetUserAsync(cancellationToken);
        if (user?.Role == UserRoles.Dispatcher)
        {
            if (request.CompanyId is Guid requestedCompany &&
                !await db.Companies.AnyAsync(company => company.Id == requestedCompany, cancellationToken))
            {
                return Problem(title: "Validation error", detail: "找不到这家公司。", statusCode: StatusCodes.Status400BadRequest);
            }

            order.CompanyId = request.CompanyId;
        }
        else if (user?.Role == UserRoles.Company)
        {
            order.CompanyId ??= user.CompanyId;
        }

        if (user?.Role != UserRoles.Driver)
        {
            order.PlatformOrderNo = TextValue.NullIfBlank(request.PlatformOrderNo);
        }
        order.StartDate = request.StartDate;
        order.GuestCount = request.GuestCount;
        order.DriverNotes = request.DriverNotes;
        order.SharedNotes = TextValue.NullIfBlank(request.SharedNotes);
        await db.SaveChangesAsync(cancellationToken);
        if (user?.Role != UserRoles.Driver)
        {
            await UpsertNoteAsync(order.Id, request.Notes, cancellationToken);
        }

        var updated = await LoadOrderAsync(id, cancellationToken);
        return Ok(await PresentDetailAsync(updated!, user, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        var order = await db.Orders
            .Include(item => item.Files)
            .Include(item => item.Days)
            .ThenInclude(day => day.Activities)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        if (user?.Role == UserRoles.Dispatcher)
        {
            if (order.AssignedDispatcherUserId != user.Id)
            {
                return Problem(title: "Forbidden", detail: "只能处理分给自己的订单。", statusCode: StatusCodes.Status403Forbidden);
            }

            if (order.CompanyId is Guid)
            {
                OrderDriverAssignment.ReturnToCompanyPool(order);
                await db.SaveChangesAsync(cancellationToken);
                return NoContent();
            }

            RemoveOrderFiles(order);
            db.Orders.Remove(order);
            await db.SaveChangesAsync(cancellationToken);
            return NoContent();
        }

        if (user?.Role != UserRoles.Company)
        {
            return Problem(title: "Forbidden", detail: "只有公司账户能删除订单。", statusCode: StatusCodes.Status403Forbidden);
        }

        RemoveOrderFiles(order);
        db.Orders.Remove(order);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/files")]
    public async Task<ActionResult<List<OrderFileReadDto>>> ListFiles(Guid id, CancellationToken cancellationToken)
    {
        var order = await db.Orders.Include(item => item.Files).FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return order is null ? NotFound() : Ok(order.Files.OrderBy(file => file.FileName).Select(ToFile).ToList());
    }

    [HttpPost("{id:guid}/files")]
    [RequestSizeLimit(8_000_000)]
    public async Task<ActionResult<OrderFileReadDto>> UploadFile(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        var fileId = Guid.NewGuid();
        var (path, error) = await files.SaveAsync(
            StoredFileKind.Order,
            fileId,
            file,
            null,
            AppFileStore.ImageExtensions,
            AppFileStore.DocumentLimit,
            "订单截图请上传 8MB 以内的 jpg / png / webp。",
            cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var stored = new OrderFile
        {
            Id = fileId,
            OrderId = order.Id,
            FileName = Path.GetFileName(file.FileName),
            FilePath = path!
        };
        if (stored.FileName.Length > 255)
        {
            stored.FileName = stored.FileName[..255];
        }

        db.OrderFiles.Add(stored);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(DownloadFile), new { id, fileId }, ToFile(stored));
    }

    [HttpGet("{id:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DownloadFile(Guid id, Guid fileId, CancellationToken cancellationToken)
    {
        var stored = await db.OrderFiles.FirstOrDefaultAsync(item => item.Id == fileId && item.OrderId == id, cancellationToken);
        var opened = files.Open(stored?.FilePath);
        return opened is null ? NotFound() : PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    [HttpDelete("{id:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DeleteFile(Guid id, Guid fileId, CancellationToken cancellationToken)
    {
        var stored = await db.OrderFiles.FirstOrDefaultAsync(item => item.Id == fileId && item.OrderId == id, cancellationToken);
        if (stored is null)
        {
            return NotFound();
        }

        files.Delete(stored.FilePath);
        db.OrderFiles.Remove(stored);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("{orderId:guid}/driver")]
    public async Task<ActionResult<AssignmentResultDto>> AssignDriver(
        Guid orderId,
        AssignDriverDto request,
        CancellationToken cancellationToken)
    {
        var order = await db.Orders
            .Include(item => item.Days)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        var user = await session.GetUserAsync(cancellationToken);
        if (request.DriverId is Guid driverId)
        {
            var exists = await db.Drivers.AnyAsync(driver => driver.Id == driverId, cancellationToken);
            if (!exists)
            {
                return Problem(title: "Validation error", detail: "指定的司机不存在。", statusCode: StatusCodes.Status400BadRequest);
            }
        }
        else if (order.Days.Any(day => day.DriverId is not null))
        {
            if (!OrderDriverAssignment.CanClearAssignment(user, order, order.Days))
            {
                return Problem(
                    title: "Forbidden",
                    detail: OrderDriverAssignment.CannotClearOthers,
                    statusCode: StatusCodes.Status403Forbidden);
            }
        }

        var result = await assignment.AssignAsync(
            order,
            request.DriverId,
            OrderDriverAssignment.AssignerFor(user, order, request.DriverId),
            cancellationToken,
            request.FailOnConflict);

        if (!result.Applied)
        {
            return Problem(
                title: "Schedule conflict",
                detail: string.Join("；", result.Warnings),
                statusCode: StatusCodes.Status409Conflict);
        }

        return Ok(new AssignmentResultDto
        {
            OrderId = result.OrderId,
            DriverId = result.DriverId,
            UpdatedDayCount = result.UpdatedDayCount,
            Warnings = result.Warnings
        });
    }

    [HttpPut("{orderId:guid}/dispatcher")]
    public async Task<ActionResult<OrderReadDto>> AssignDispatcher(
        Guid orderId,
        AssignDispatcherDto request,
        CancellationToken cancellationToken)
    {
        var order = await LoadOrderAsync(orderId, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        var user = await session.GetUserAsync(cancellationToken);
        if (user?.Role != UserRoles.Company || user.CompanyId is not Guid companyId)
        {
            return Problem(title: "Forbidden", detail: "只有公司账户能把整单分配给调度员。", statusCode: StatusCodes.Status403Forbidden);
        }

        if (order.CompanyId is Guid orderCompany && orderCompany != companyId)
        {
            return Problem(title: "Forbidden", detail: "只能分配本公司的订单。", statusCode: StatusCodes.Status403Forbidden);
        }

        if (request.DispatcherUserId is Guid dispatcherId)
        {
            if (!await CompanyMembership.IsDispatcherAsync(db, companyId, dispatcherId, cancellationToken))
            {
                return Problem(title: "Validation error", detail: "只能分配给本公司的调度员。", statusCode: StatusCodes.Status400BadRequest);
            }

            order.AssignedDispatcherUserId = dispatcherId;
            order.CompanyId ??= companyId;
        }
        else
        {
            OrderDriverAssignment.ReturnToCompanyPool(order);
        }

        await db.SaveChangesAsync(cancellationToken);
        var updated = await LoadOrderAsync(orderId, cancellationToken);
        return Ok(await PresentDetailAsync(updated!, user, cancellationToken));
    }

    internal async Task<Order?> LoadOrderAsync(Guid id, CancellationToken cancellationToken)
    {
        return await db.Orders
            .Include(order => order.Days)
            .ThenInclude(day => day.Driver)
            .Include(order => order.Days)
            .ThenInclude(day => day.Activities)
            .Include(order => order.Days)
            .ThenInclude(day => day.AssignedBy)
            .Include(order => order.Days)
            .ThenInclude(day => day.Vehicle)
            .Include(order => order.Files)
            .Include(order => order.CreatedBy)
            .Include(order => order.Company)
            .Include(order => order.AssignedDispatcher)
            .FirstOrDefaultAsync(order => order.Id == id, cancellationToken);
    }

    internal static OrderReadDto ToSummary(Order order, string? notes = null)
    {
        var endDate = OrderScheduling.EndDate(order.Days);
        var assignedDays = order.Days.Where(day => day.DriverId is not null).ToList();

        return new OrderReadDto
        {
            Id = order.Id,
            OrderNo = order.OrderNo,
            PlatformOrderNo = order.PlatformOrderNo,
            StartDate = order.StartDate,
            EndDate = endDate,
            DayCount = order.Days.Count,
            GuestCount = order.GuestCount,
            Notes = notes,
            DriverNotes = order.DriverNotes,
            SharedNotes = order.SharedNotes,
            CompanyId = order.CompanyId,
            CompanyName = order.Company?.Name,
            CreatedByUserId = order.CreatedByUserId,
            CreatedByName = order.CreatedBy?.Name,
            AssignedDispatcherUserId = order.AssignedDispatcherUserId,
            AssignedDispatcherName = order.AssignedDispatcher?.Name,
            AssignedDispatcherContact = order.AssignedDispatcher?.Contact,
            AssignedDayCount = assignedDays.Count,
            Days = order.Days
                .OrderBy(day => day.ServiceDate)
                .Select(ItineraryDaysController.ToRead)
                .ToList(),
            Files = order.Files
                .OrderBy(file => file.FileName)
                .Select(ToFile)
                .ToList()
        };
    }

    internal static OrderFileReadDto ToFile(OrderFile file) => new()
    {
        Id = file.Id,
        OrderId = file.OrderId,
        FileName = file.FileName
    };

    private async Task<(Guid? CompanyId, string? Error)> ResolveCreateCompanyIdAsync(
        User? user,
        Guid? requested,
        CancellationToken cancellationToken)
    {
        if (user?.Role == UserRoles.Company)
        {
            return (user.CompanyId, null);
        }

        if (requested is Guid companyId)
        {
            if (!await db.Companies.AnyAsync(company => company.Id == companyId, cancellationToken))
            {
                return (null, "找不到这家公司。");
            }

            if (user?.Role == UserRoles.Dispatcher)
            {
                return (companyId, null);
            }

            if (user?.Memberships.Any(member => member.CompanyId == companyId) == true)
            {
                return (companyId, null);
            }

            return (null, "只能绑定自己所属的公司。");
        }

        if (user?.Role is UserRoles.Dispatcher or UserRoles.Driver)
        {
            return (null, null);
        }

        return (user?.Memberships.Count == 1 ? user.Memberships.First().CompanyId : null, null);
    }

    private static string? Validate(OrderWriteDto request)
    {
        if (request.GuestCount < 0)
        {
            return "游客人数不能为负数。";
        }

        if (request.StartDate == default)
        {
            return "起始日期不能为空。";
        }

        return null;
    }

    private async Task<OrderReadDto> PresentDetailAsync(Order order, User? user, CancellationToken cancellationToken)
    {
        var dto = VisibleNotes(ToSummary(order, await ViewerNoteAsync(order.Id, user, cancellationToken)), user?.Role);
        ApplyCompanyNote(dto, await ViewerCompanyNotesAsync(user, [order], cancellationToken));
        return dto;
    }

    private static void ApplyCompanyNote(OrderReadDto dto, IReadOnlyDictionary<Guid, string> companyNotes)
    {
        if (dto.CompanyId is Guid companyId && companyNotes.TryGetValue(companyId, out var note))
        {
            dto.CompanyNote = note;
        }
    }

    private Task<Dictionary<Guid, string>> ViewerCompanyNotesAsync(
        User? user,
        IEnumerable<Order> orders,
        CancellationToken cancellationToken)
    {
        if (user is null)
        {
            return Task.FromResult(new Dictionary<Guid, string>());
        }

        var companies = orders
            .Where(order => order.CompanyId is not null && order.Company is not null)
            .Select(order => (order.CompanyId!.Value, order.Company!.Name));
        return Services.CompanyNotes.EnsureAsync(db, user.Id, companies, cancellationToken);
    }

    private async Task<Dictionary<Guid, string>> ViewerNotesAsync(User? user, CancellationToken cancellationToken)
    {
        if (user is null || user.Role == UserRoles.Driver)
        {
            return [];
        }

        return await db.OrderNotes
            .Where(note => note.UserId == user.Id)
            .ToDictionaryAsync(note => note.OrderId, note => note.Notes, cancellationToken);
    }

    private async Task<string?> ViewerNoteAsync(Guid orderId, User? user, CancellationToken cancellationToken)
    {
        if (user is null || user.Role == UserRoles.Driver)
        {
            return null;
        }

        return await db.OrderNotes
            .Where(note => note.OrderId == orderId && note.UserId == user.Id)
            .Select(note => note.Notes)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task UpsertNoteAsync(Guid orderId, string? notes, CancellationToken cancellationToken)
    {
        if (session.UserId is not Guid userId)
        {
            return;
        }

        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            await db.OrderNotes
                .Where(note => note.OrderId == orderId && note.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);
            return;
        }

        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO order_notes (id, order_id, user_id, notes)
            VALUES ({Guid.NewGuid()}, {orderId}, {userId}, {trimmed})
            ON CONFLICT (order_id, user_id) DO UPDATE SET notes = EXCLUDED.notes
            """, cancellationToken);
    }

    private void RemoveOrderFiles(Order order) => files.DeleteOrderAttachments(order);

    private static bool InDeskScope(User? user, Order order)
    {
        if (user?.Role == UserRoles.Company)
        {
            return order.CompanyId == user.CompanyId;
        }

        return user?.Role == UserRoles.Dispatcher && order.AssignedDispatcherUserId == user.Id;
    }

    private static void HideOutsideDesk(OrderReadDto dto)
    {
        dto.PlatformOrderNo = null;
        dto.CompanyName = null;
        dto.CompanyNote = null;
        dto.CreatedByName = null;
        dto.AssignedDispatcherName = null;
        dto.AssignedDispatcherContact = null;
        dto.Notes = null;
        dto.DriverNotes = null;
        dto.SharedNotes = null;
        dto.GuestCount = 0;
        dto.Files = [];
        foreach (var day in dto.Days)
        {
            day.Description = null;
            day.EndLocation = TextValue.FirstTextElement(day.EndLocation);
            day.AssignedByName = null;
            day.AssignedByContact = null;
            day.Activities = [];
        }
    }

    private static OrderReadDto VisibleNotes(OrderReadDto dto, string? role)
    {
        if (role == UserRoles.Driver)
        {
            dto.Notes = null;
        }

        return dto;
    }
}
