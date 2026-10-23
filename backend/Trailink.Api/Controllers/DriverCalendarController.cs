using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/driver-calendar")]
public class DriverCalendarController(
    TrailinkDbContext db,
    IConfiguration config,
    OrderScheduling scheduling,
    OrderDriverAssignment assignment) : ControllerBase
{
    [HttpGet("preview")]
    public async Task<ActionResult<DriverCalendarPreviewDto>> Preview(
        [FromQuery] DateOnly startDate,
        [FromQuery] DateOnly endDate,
        CancellationToken cancellationToken)
    {
        if (startDate == default || endDate == default || endDate < startDate)
        {
            return Problem(title: "Validation error", detail: "请提供有效的当地日期范围。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (endDate.DayNumber - startDate.DayNumber > 400)
        {
            return Problem(title: "Validation error", detail: "日期范围过大。", statusCode: StatusCodes.Status400BadRequest);
        }

        var previewDriverId = await ResolvePreviewDriverIdAsync(cancellationToken);
        var previewDays = await db.ItineraryDays
            .AsNoTracking()
            .Include(day => day.Order)
            .Include(day => day.Activities)
            .Include(day => day.Driver)
            .Where(day =>
                previewDriverId != null &&
                day.DriverId == previewDriverId &&
                day.ServiceDate >= startDate &&
                day.ServiceDate <= endDate)
            .ToListAsync(cancellationToken);
        var driverName = previewDays.FirstOrDefault()?.Driver?.Name;

        return Ok(new DriverCalendarPreviewDto
        {
            Preview = true,
            IdentityIsolated = false,
            DriverId = previewDriverId,
            DriverName = driverName,
            Days = previewDays
                .GroupBy(day => day.ServiceDate)
                .OrderBy(group => group.Key)
                .Select(group => new DriverCalendarDayDto
                {
                    Date = group.Key,
                    Items = group
                        .OrderBy(day => day.Order.OrderNo)
                        .Select(day => new DriverCalendarTripDto
                        {
                            OrderId = day.OrderId,
                            OrderNo = day.Order.OrderNo,
                            ItineraryDayId = day.Id,
                            EndLocation = day.EndLocation,
                            Description = day.Description,
                            Activities = day.Activities
                                .OrderBy(activity => activity.SortOrder)
                                .ThenBy(activity => activity.Id)
                                .Select(activity => new DriverCalendarActivityDto
                                {
                                    Id = activity.Id,
                                    Content = activity.Content,
                                    Provider = activity.Provider,
                                    BookingTime = activity.BookingTime,
                                    CheckinTime = activity.CheckinTime,
                                    HasTicket = !string.IsNullOrWhiteSpace(activity.TicketPath),
                                    TicketAccessible = false
                                })
                                .ToList()
                        })
                        .ToList()
                })
                .ToList()
        });
    }

    [HttpPost("claim")]
    public async Task<ActionResult<DriverCalendarMutationDto>> Claim(
        DriverCalendarClaimDto request,
        CancellationToken cancellationToken)
    {
        var orderNo = request.OrderNo?.Trim();
        if (string.IsNullOrWhiteSpace(orderNo))
        {
            return Problem(title: "Validation error", detail: "请输入订单号。", statusCode: StatusCodes.Status400BadRequest);
        }

        var driverId = await ResolveAssignableDriverIdAsync(cancellationToken);
        if (driverId is null)
        {
            return Problem(title: "Validation error", detail: "没有可用的预览司机，无法分配行程。", statusCode: StatusCodes.Status400BadRequest);
        }

        var order = await db.Orders
            .Include(item => item.Days)
            .FirstOrDefaultAsync(
                item => item.OrderNo == orderNo || item.PlatformOrderNo == orderNo,
                cancellationToken);
        if (order is null)
        {
            return Problem(title: "Not found", detail: "找不到该订单号。", statusCode: StatusCodes.Status404NotFound);
        }

        if (order.Days.Count == 0)
        {
            return Problem(title: "Validation error", detail: "该订单还没有行程日期。", statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await assignment.AssignAsync(order, driverId, cancellationToken);

        return Ok(new DriverCalendarMutationDto
        {
            OrderId = result.OrderId,
            OrderNo = order.OrderNo,
            DriverId = result.DriverId,
            UpdatedDayCount = result.UpdatedDayCount,
            Warnings = result.Warnings
        });
    }

    [HttpPost("range")]
    public async Task<ActionResult<DriverCalendarMutationDto>> CreateRange(
        DriverCalendarRangeDto request,
        CancellationToken cancellationToken)
    {
        if (request.StartDate == default || request.EndDate == default || request.EndDate < request.StartDate)
        {
            return Problem(title: "Validation error", detail: "请提供有效的当地起止日期。", statusCode: StatusCodes.Status400BadRequest);
        }

        var dayCount = request.EndDate.DayNumber - request.StartDate.DayNumber + 1;
        if (dayCount > 31)
        {
            return Problem(title: "Validation error", detail: "一次最多添加 31 天。", statusCode: StatusCodes.Status400BadRequest);
        }

        var driverId = await ResolveAssignableDriverIdAsync(cancellationToken);
        if (driverId is null)
        {
            return Problem(title: "Validation error", detail: "没有可用的预览司机，无法分配行程。", statusCode: StatusCodes.Status400BadRequest);
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNo = Order.NewOrderNo(),
            StartDate = request.StartDate,
            GuestCount = 0
        };

        var days = Enumerable.Range(0, dayCount)
            .Select(offset => new ItineraryDay
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ServiceDate = request.StartDate.AddDays(offset),
                DriverId = driverId
            })
            .ToList();

        db.Orders.Add(order);
        db.ItineraryDays.AddRange(days);

        var warnings = await scheduling.FindDriverConflictsAsync(
            driverId.Value,
            days.Select(day => day.ServiceDate),
            order.Id,
            cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new DriverCalendarMutationDto
        {
            OrderId = order.Id,
            OrderNo = order.OrderNo,
            DriverId = driverId,
            UpdatedDayCount = days.Count,
            Warnings = warnings
        });
    }

    private async Task<Guid?> ResolveAssignableDriverIdAsync(CancellationToken cancellationToken)
    {
        var previewDriverId = await ResolvePreviewDriverIdAsync(cancellationToken);
        if (previewDriverId is Guid configured &&
            await db.Drivers.AnyAsync(driver => driver.Id == configured, cancellationToken))
        {
            return configured;
        }

        return await db.Drivers
            .OrderBy(driver => driver.Name)
            .Select(driver => (Guid?)driver.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<Guid?> ResolvePreviewDriverIdAsync(CancellationToken cancellationToken)
    {
        if (Guid.TryParse(config["Calendar:PreviewDriverId"], out var configured))
        {
            return configured;
        }

        return await db.ItineraryDays
            .Where(day => day.DriverId != null)
            .GroupBy(day => day.DriverId)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Min(day => day.Driver!.Name))
            .Select(group => group.Key)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
