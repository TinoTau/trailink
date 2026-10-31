using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(
    TrailinkDbContext db,
    OrderDriverAssignment assignment,
    OrderPresenter presenter,
    AuthSession session,
    AppFileStore files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<OrderReadDto>>> List(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? orderNo,
        [FromQuery] Guid? driverId,
        CancellationToken cancellationToken)
    {
        var query = db.Orders.WithSummary();
        var user = await session.GetUserAsync(cancellationToken);
        var deskDriverTrips = false;
        if (!string.IsNullOrWhiteSpace(orderNo))
        {
            var key = orderNo.Trim();
            query = query.Where(order => order.OrderNo == key || order.PlatformOrderNo == key);
        }
        else if (driverId is Guid requestedDriver)
        {
            if (user is not { Role: UserRoles.Dispatcher or UserRoles.Company }
                || !await DriverRoster.Visible(db, user).AnyAsync(driver => driver.Id == requestedDriver, cancellationToken))
            {
                return Ok(new List<OrderReadDto>());
            }

            deskDriverTrips = true;
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
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        return Ok(await presenter.PresentAsync(orders, user, cancellationToken, deskDriverTrips));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderReadDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var order = await LoadOrderAsync(id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        return Ok(await presenter.PresentAsync(order, await session.GetUserAsync(cancellationToken), cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<OrderReadDto>> Create(OrderWriteDto request, CancellationToken cancellationToken)
    {
        if (Validate(request) is string error)
        {
            return this.Invalid(error);
        }

        var user = await session.GetUserAsync(cancellationToken);
        var (companyId, companyError) = await ResolveCreateCompanyIdAsync(user, request.CompanyId, cancellationToken);
        if (companyError is not null)
        {
            return this.Invalid(companyError);
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
        await WriteOwnNoteAsync(order.Id, user, request.Notes, cancellationToken);

        var created = await LoadOrderAsync(order.Id, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, await presenter.PresentAsync(created!, user, cancellationToken));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<OrderReadDto>> Update(Guid id, OrderWriteDto request, CancellationToken cancellationToken)
    {
        if (Validate(request) is string error)
        {
            return this.Invalid(error);
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
                return this.Invalid("找不到这家公司。");
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
        await WriteOwnNoteAsync(order.Id, user, request.Notes, cancellationToken);

        var updated = await LoadOrderAsync(id, cancellationToken);
        return Ok(await presenter.PresentAsync(updated!, user, cancellationToken));
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

        switch (user?.Role)
        {
            case UserRoles.Dispatcher when order.AssignedDispatcherUserId != user.Id:
                return this.Forbidden("只能处理分给自己的订单。");
            case UserRoles.Dispatcher when OrderRules.IsRealOrder(order):
                OrderDriverAssignment.ReturnToCompanyPool(order);
                break;
            case UserRoles.Dispatcher:
            case UserRoles.Company:
                files.DeleteOrderAttachments(order);
                db.Orders.Remove(order);
                break;
            default:
                return this.Forbidden("只有公司账户能删除订单。");
        }

        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/files")]
    public async Task<ActionResult<List<OrderFileReadDto>>> ListFiles(Guid id, CancellationToken cancellationToken)
    {
        var order = await db.Orders.Include(item => item.Files).FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return order is null
            ? NotFound()
            : Ok(order.Files.OrderBy(file => file.FileName).Select(OrderPresenter.ToRead).ToList());
    }

    [HttpPost("{id:guid}/files")]
    [RequestSizeLimit(AppFileStore.DocumentLimit)]
    public async Task<ActionResult<OrderFileReadDto>> UploadFile(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        if (!await db.Orders.AnyAsync(item => item.Id == id, cancellationToken))
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
            return this.Invalid(error);
        }

        var stored = new OrderFile
        {
            Id = fileId,
            OrderId = id,
            FileName = AppFileStore.StoredName(file),
            FilePath = path!
        };
        db.OrderFiles.Add(stored);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(DownloadFile), new { id, fileId }, OrderPresenter.ToRead(stored));
    }

    [HttpGet("{id:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DownloadFile(Guid id, Guid fileId, CancellationToken cancellationToken)
    {
        var stored = await db.OrderFiles.FirstOrDefaultAsync(item => item.Id == fileId && item.OrderId == id, cancellationToken);
        return this.StoredFile(files, stored?.FilePath);
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
            if (!await db.Drivers.AnyAsync(driver => driver.Id == driverId, cancellationToken))
            {
                return this.Invalid("指定的司机不存在。");
            }
        }
        else if (!OrderDriverAssignment.CanClearAssignment(user, order, order.Days))
        {
            return this.Forbidden(OrderDriverAssignment.CannotClearOthers);
        }

        var result = await assignment.AssignAsync(
            order,
            request.DriverId,
            OrderDriverAssignment.AssignerFor(user, order, request.DriverId),
            cancellationToken,
            request.FailOnConflict);
        if (!result.Applied)
        {
            return this.ScheduleConflict(result.Warnings);
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
            return this.Forbidden("只有公司账户能把整单分配给调度员。");
        }

        if (order.CompanyId is Guid orderCompany && orderCompany != companyId)
        {
            return this.Forbidden("只能分配本公司的订单。");
        }

        if (request.DispatcherUserId is Guid dispatcherId)
        {
            if (!await CompanyMembership.IsDispatcherAsync(db, companyId, dispatcherId, cancellationToken))
            {
                return this.Invalid("只能分配给本公司的调度员。");
            }

            order.AssignedDispatcherUserId = dispatcherId;
            order.CompanyId ??= companyId;
        }
        else
        {
            // 收回到公司池时，司导一并清空。
            OrderDriverAssignment.ReturnToCompanyPool(order);
        }

        await db.SaveChangesAsync(cancellationToken);
        var updated = await LoadOrderAsync(orderId, cancellationToken);
        return Ok(await presenter.PresentAsync(updated!, user, cancellationToken));
    }

    private Task<Order?> LoadOrderAsync(Guid id, CancellationToken cancellationToken) =>
        db.Orders.WithDetails().AsSplitQuery().FirstOrDefaultAsync(order => order.Id == id, cancellationToken);

    /// <summary>公司和调度员各写各的调度备注；司导没有这条备注。</summary>
    private Task WriteOwnNoteAsync(Guid orderId, User? user, string? notes, CancellationToken cancellationToken) =>
        user is null || user.Role == UserRoles.Driver
            ? Task.CompletedTask
            : ViewerNotes.UpsertOrderAsync(db, orderId, user.Id, notes, cancellationToken);

    private async Task<(Guid? CompanyId, string? Error)> ResolveCreateCompanyIdAsync(
        User? user,
        Guid? requested,
        CancellationToken cancellationToken)
    {
        if (user?.Role == UserRoles.Company)
        {
            return (user.CompanyId, null);
        }

        if (requested is not Guid companyId)
        {
            // 调度员和司导建单都不默认绑所属公司。
            return (null, null);
        }

        if (!await db.Companies.AnyAsync(company => company.Id == companyId, cancellationToken))
        {
            return (null, "找不到这家公司。");
        }

        if (user?.Role == UserRoles.Dispatcher || user?.Memberships.Any(member => member.CompanyId == companyId) == true)
        {
            return (companyId, null);
        }

        return (null, "只能绑定自己所属的公司。");
    }

    private static string? Validate(OrderWriteDto request)
    {
        if (request.GuestCount < 0)
        {
            return "游客人数不能为负数。";
        }

        return request.StartDate == default ? "起始日期不能为空。" : null;
    }
}
