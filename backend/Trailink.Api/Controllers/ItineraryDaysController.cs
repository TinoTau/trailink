using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders/{orderId:guid}/days")]
public class ItineraryDaysController(
    TrailinkDbContext db,
    OrderScheduling scheduling,
    OrderDriverAssignment assignment,
    OrderPresenter presenter,
    AuthSession session) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ItineraryDayReadDto>>> List(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await db.Orders.WithDetails().AsSplitQuery().FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        var user = await session.GetUserAsync(cancellationToken);
        return Ok((await presenter.PresentAsync(order, user, cancellationToken)).Days);
    }

    [HttpPost]
    public async Task<ActionResult<ItineraryDayReadDto>> Create(
        Guid orderId,
        ItineraryDayWriteDto request,
        CancellationToken cancellationToken)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        if (await ValidateAsync(order, null, request, cancellationToken) is string error)
        {
            return this.Invalid(error);
        }

        var user = await session.GetUserAsync(cancellationToken);
        var day = new ItineraryDay
        {
            Id = Guid.NewGuid(),
            OrderId = orderId,
            ServiceDate = request.ServiceDate,
            Description = request.Description,
            EndLocation = TextValue.NullIfBlank(request.EndLocation)
        };
        OrderDriverAssignment.SetDayDriver(day, request.DriverId, user?.Id);

        db.ItineraryDays.Add(day);
        var warnings = await CollectWarningsAsync(order, request.DriverId, request.ServiceDate, cancellationToken);
        if (request.DriverId is Guid createdDriverId)
        {
            await assignment.RemoveDriverPlaceholdersAsync(order, createdDriverId, [request.ServiceDate], cancellationToken);
            await assignment.LinkDriverToCompanyAsync(order, createdDriverId, day.AssignedByUserId, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        var dto = await PresentDayAsync(day.Id, cancellationToken);
        dto.Warnings = warnings;
        return Created($"/api/orders/{orderId}/days/{day.Id}", dto);
    }

    [HttpPut("{dayId:guid}")]
    public async Task<ActionResult<ItineraryDayReadDto>> Update(
        Guid orderId,
        Guid dayId,
        ItineraryDayWriteDto request,
        CancellationToken cancellationToken)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        var day = await db.ItineraryDays.FirstOrDefaultAsync(
            item => item.Id == dayId && item.OrderId == orderId,
            cancellationToken);
        if (order is null || day is null)
        {
            return NotFound();
        }

        if (await ValidateAsync(order, day.Id, request, cancellationToken) is string error)
        {
            return this.Invalid(error);
        }

        var user = await session.GetUserAsync(cancellationToken);
        if (request.DriverId is null && day.DriverId is not null &&
            !OrderDriverAssignment.CanClearAssignment(user, order, [day]))
        {
            return this.Forbidden(OrderDriverAssignment.CannotClearOthers);
        }

        var warnings = await CollectWarningsAsync(order, request.DriverId, request.ServiceDate, cancellationToken);
        if (request.FailOnConflict && warnings.Count > 0)
        {
            return this.ScheduleConflict(warnings);
        }

        var driverChanged = day.DriverId != request.DriverId;
        if (driverChanged && request.DriverId is Guid assignedDriverId)
        {
            await assignment.RemoveDriverPlaceholdersAsync(order, assignedDriverId, [request.ServiceDate], cancellationToken);
        }

        day.ServiceDate = request.ServiceDate;
        day.Description = request.Description;
        day.EndLocation = TextValue.NullIfBlank(request.EndLocation);
        if (driverChanged)
        {
            OrderDriverAssignment.SetDayDriver(day, request.DriverId, user?.Id);
            if (request.DriverId is Guid linkedDriverId)
            {
                await assignment.LinkDriverToCompanyAsync(order, linkedDriverId, day.AssignedByUserId, cancellationToken);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        var dto = await PresentDayAsync(day.Id, cancellationToken);
        dto.Warnings = warnings;
        return Ok(dto);
    }

    /// <summary>
    /// 绑定或解除车辆，只动自己派出的日期。
    /// 绑定：整单填所有还没有车的日期；拆单只填这位司导这一段还没有车的日期。
    /// </summary>
    [HttpPut("{dayId:guid}/vehicle")]
    public async Task<ActionResult<VehicleBindResultDto>> BindVehicle(
        Guid orderId,
        Guid dayId,
        VehicleBindDto request,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var order = await db.Orders
            .Include(item => item.Days)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        var day = order?.Days.FirstOrDefault(item => item.Id == dayId);
        if (order is null || day is null)
        {
            return NotFound();
        }

        if (day.DriverId is not Guid driverId)
        {
            return this.Invalid("这一天还没有司导。");
        }

        if (OrderRules.AssignerId(order, day) != user.Id)
        {
            return this.Forbidden("只能给自己分配的日期绑定车辆。");
        }

        var ownDays = order.Days
            .Where(item => item.DriverId is not null && OrderRules.AssignerId(order, item) == user.Id)
            .ToList();
        if (request.VehicleId is null)
        {
            var cleared = ownDays
                .Where(item => item.VehicleId is not null && (!request.OnlyDay || item.Id == day.Id))
                .ToList();
            cleared.ForEach(item => item.VehicleId = null);
            await db.SaveChangesAsync(cancellationToken);
            return Ok(new VehicleBindResultDto { OrderId = order.Id, VehicleId = null, DayIds = cleared.Select(item => item.Id).ToList() });
        }

        var vehicle = await db.Vehicles.FirstOrDefaultAsync(
            item => item.Id == request.VehicleId && item.OwnerUserId == user.Id,
            cancellationToken);
        if (vehicle is null)
        {
            return NotFound();
        }

        var split = OrderRules.IsSplit(order);
        var free = ownDays
            .Where(item => item.VehicleId is null && (!split || item.DriverId == driverId))
            .ToList();
        if (free.Count == 0)
        {
            return this.Invalid("该订单已经绑定了其他车辆。");
        }

        free.ForEach(item => item.VehicleId = vehicle.Id);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new VehicleBindResultDto { OrderId = order.Id, VehicleId = vehicle.Id, DayIds = free.Select(item => item.Id).ToList() });
    }

    [HttpDelete("{dayId:guid}")]
    public async Task<IActionResult> Delete(Guid orderId, Guid dayId, CancellationToken cancellationToken)
    {
        var day = await db.ItineraryDays.FirstOrDefaultAsync(
            item => item.Id == dayId && item.OrderId == orderId,
            cancellationToken);
        if (day is null)
        {
            return NotFound();
        }

        db.ItineraryDays.Remove(day);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<ItineraryDayReadDto> PresentDayAsync(Guid dayId, CancellationToken cancellationToken)
    {
        var day = await db.ItineraryDays.WithDetails().FirstAsync(item => item.Id == dayId, cancellationToken);
        return await presenter.PresentDayAsync(day, cancellationToken);
    }

    private async Task<string?> ValidateAsync(
        Order order,
        Guid? dayId,
        ItineraryDayWriteDto request,
        CancellationToken cancellationToken)
    {
        var duplicate = await db.ItineraryDays.AnyAsync(
            day => day.OrderId == order.Id &&
                   day.ServiceDate == request.ServiceDate &&
                   day.Id != dayId,
            cancellationToken);
        if (duplicate)
        {
            return "同一订单同一天只能有一条行程。";
        }

        if (request.DriverId is Guid driverId &&
            !await db.Drivers.AnyAsync(driver => driver.Id == driverId, cancellationToken))
        {
            return "指定的司机不存在。";
        }

        return null;
    }

    private async Task<List<string>> CollectWarningsAsync(
        Order order,
        Guid? driverId,
        DateOnly serviceDate,
        CancellationToken cancellationToken) =>
        driverId is Guid assignedId
            ? await scheduling.FindDriverConflictsAsync(assignedId, [serviceDate], order.Id, cancellationToken, order.CompanyId)
            : [];
}
