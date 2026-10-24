using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(TrailinkDbContext db, OrderDriverAssignment assignment) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<OrderReadDto>>> List(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? orderNo,
        CancellationToken cancellationToken)
    {
        var query = db.Orders.Include(order => order.Days).AsQueryable();

        if (!string.IsNullOrWhiteSpace(orderNo))
        {
            var key = orderNo.Trim();
            query = query.Where(order =>
                order.OrderNo == key ||
                order.PlatformOrderNo == key);
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

        return Ok(orders.Select(ToSummary).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderReadDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var order = await LoadOrderAsync(id, cancellationToken);
        return order is null ? NotFound() : Ok(ToDetail(order));
    }

    [HttpPost]
    public async Task<ActionResult<OrderReadDto>> Create(OrderWriteDto request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNo = Order.NewOrderNo(),
            PlatformOrderNo = TrimToNull(request.PlatformOrderNo),
            SourceCompany = TrimToNull(request.SourceCompany),
            StartDate = request.StartDate,
            GuestCount = request.GuestCount,
            Notes = request.Notes
        };

        db.Orders.Add(order);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadOrderAsync(order.Id, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, ToDetail(created!));
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

        order.PlatformOrderNo = TrimToNull(request.PlatformOrderNo);
        order.SourceCompany = TrimToNull(request.SourceCompany);
        order.StartDate = request.StartDate;
        order.GuestCount = request.GuestCount;
        order.Notes = request.Notes;
        await db.SaveChangesAsync(cancellationToken);

        var updated = await LoadOrderAsync(id, cancellationToken);
        return Ok(ToDetail(updated!));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        db.Orders.Remove(order);
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

        if (request.DriverId is Guid driverId)
        {
            var exists = await db.Drivers.AnyAsync(driver => driver.Id == driverId, cancellationToken);
            if (!exists)
            {
                return Problem(title: "Validation error", detail: "指定的司机不存在。", statusCode: StatusCodes.Status400BadRequest);
            }
        }

        var result = await assignment.AssignAsync(
            order,
            request.DriverId,
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

    internal async Task<Order?> LoadOrderAsync(Guid id, CancellationToken cancellationToken)
    {
        return await db.Orders
            .Include(order => order.Days)
            .ThenInclude(day => day.Driver)
            .Include(order => order.Days)
            .ThenInclude(day => day.Activities)
            .FirstOrDefaultAsync(order => order.Id == id, cancellationToken);
    }

    internal static OrderReadDto ToSummary(Order order)
    {
        var endDate = order.Days.Count == 0
            ? (DateOnly?)null
            : order.Days.Max(day => day.ServiceDate);
        var assignedDays = order.Days.Where(day => day.DriverId is not null).ToList();

        return new OrderReadDto
        {
            Id = order.Id,
            OrderNo = order.OrderNo,
            PlatformOrderNo = order.PlatformOrderNo,
            SourceCompany = order.SourceCompany,
            StartDate = order.StartDate,
            EndDate = endDate,
            DayCount = order.Days.Count,
            GuestCount = order.GuestCount,
            Notes = order.Notes,
            AssignedDriverId = assignedDays.Select(day => day.DriverId).FirstOrDefault(),
            AssignedDayCount = assignedDays.Count,
            Days = order.Days
                .OrderBy(day => day.ServiceDate)
                .Select(day => new ItineraryDayReadDto
                {
                    Id = day.Id,
                    OrderId = day.OrderId,
                    ServiceDate = day.ServiceDate,
                    Description = day.Description,
                    EndLocation = day.EndLocation,
                    DriverId = day.DriverId
                })
                .ToList()
        };
    }

    internal static OrderReadDto ToDetail(Order order)
    {
        var dto = ToSummary(order);
        dto.Days = order.Days
            .OrderBy(day => day.ServiceDate)
            .Select(ItineraryDaysController.ToRead)
            .ToList();
        return dto;
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

    private static string? TrimToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
