using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders/{orderId:guid}/days")]
public class ItineraryDaysController(TrailinkDbContext db, OrderScheduling scheduling) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ItineraryDayReadDto>>> List(Guid orderId, CancellationToken cancellationToken)
    {
        if (!await db.Orders.AnyAsync(order => order.Id == orderId, cancellationToken))
        {
            return NotFound();
        }

        var days = await db.ItineraryDays
            .Include(day => day.Driver)
            .Include(day => day.Activities)
            .Where(day => day.OrderId == orderId)
            .OrderBy(day => day.ServiceDate)
            .ToListAsync(cancellationToken);

        return Ok(days.Select(ToRead).ToList());
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

        var error = await ValidateAsync(order, null, request, cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var day = new ItineraryDay
        {
            Id = Guid.NewGuid(),
            OrderId = orderId,
            ServiceDate = request.ServiceDate,
            Description = request.Description,
            EndLocation = request.EndLocation,
            DriverId = request.DriverId
        };

        db.ItineraryDays.Add(day);
        var warnings = await CollectWarningsAsync(orderId, request.DriverId, request.ServiceDate, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadDayAsync(day.Id, cancellationToken);
        var dto = ToRead(created!);
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

        var error = await ValidateAsync(order, day.Id, request, cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        day.ServiceDate = request.ServiceDate;
        day.Description = request.Description;
        day.EndLocation = request.EndLocation;
        day.DriverId = request.DriverId;

        var warnings = await CollectWarningsAsync(orderId, request.DriverId, request.ServiceDate, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var updated = await LoadDayAsync(day.Id, cancellationToken);
        var dto = ToRead(updated!);
        dto.Warnings = warnings;
        return Ok(dto);
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

    internal static ItineraryDayReadDto ToRead(ItineraryDay day) => new()
    {
        Id = day.Id,
        OrderId = day.OrderId,
        ServiceDate = day.ServiceDate,
        Description = day.Description,
        EndLocation = day.EndLocation,
        DriverId = day.DriverId,
        DriverName = day.Driver?.Name,
        ActivityCount = day.Activities.Count,
        Activities = day.Activities
            .OrderBy(activity => activity.SortOrder)
            .ThenBy(activity => activity.Id)
            .Select(OrderActivitiesController.ToRead)
            .ToList()
    };

    private async Task<ItineraryDay?> LoadDayAsync(Guid dayId, CancellationToken cancellationToken)
    {
        return await db.ItineraryDays
            .Include(day => day.Driver)
            .Include(day => day.Activities)
            .FirstOrDefaultAsync(day => day.Id == dayId, cancellationToken);
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

        if (request.DriverId is Guid driverId)
        {
            var exists = await db.Drivers.AnyAsync(driver => driver.Id == driverId, cancellationToken);
            if (!exists)
            {
                return "指定的司机不存在。";
            }
        }

        return null;
    }

    private async Task<List<string>> CollectWarningsAsync(
        Guid orderId,
        Guid? driverId,
        DateOnly serviceDate,
        CancellationToken cancellationToken)
    {
        if (driverId is not Guid assignedId)
        {
            return [];
        }

        return await scheduling.FindDriverConflictsAsync(assignedId, [serviceDate], orderId, cancellationToken);
    }
}
