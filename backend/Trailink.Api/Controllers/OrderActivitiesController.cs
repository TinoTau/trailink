using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/orders/{orderId:guid}/days/{dayId:guid}/activities")]
public class OrderActivitiesController(TrailinkDbContext db, AppFileStore files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<OrderActivityReadDto>>> List(
        Guid orderId,
        Guid dayId,
        CancellationToken cancellationToken)
    {
        if (!await DayExistsAsync(orderId, dayId, cancellationToken))
        {
            return NotFound();
        }

        var activities = await db.OrderActivities
            .Where(activity => activity.ItineraryDayId == dayId)
            .OrderBy(activity => activity.SortOrder)
            .ThenBy(activity => activity.Id)
            .ToListAsync(cancellationToken);

        return Ok(activities.Select(ToRead).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<OrderActivityReadDto>> Create(
        Guid orderId,
        Guid dayId,
        OrderActivityWriteDto request,
        CancellationToken cancellationToken)
    {
        if (!await DayExistsAsync(orderId, dayId, cancellationToken))
        {
            return NotFound();
        }

        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var nextOrder = await db.OrderActivities
            .Where(item => item.ItineraryDayId == dayId)
            .Select(item => (int?)item.SortOrder)
            .MaxAsync(cancellationToken) ?? -1;

        var activity = new OrderActivity
        {
            Id = Guid.NewGuid(),
            ItineraryDayId = dayId,
            Content = request.Content.Trim(),
            Provider = TrimToNull(request.Provider),
            BookingTime = AsUnspecified(request.BookingTime),
            CheckinTime = AsUnspecified(request.CheckinTime),
            TicketPath = TrimToNull(request.TicketPath),
            SortOrder = nextOrder + 1
        };

        db.OrderActivities.Add(activity);
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/orders/{orderId}/days/{dayId}/activities/{activity.Id}", ToRead(activity));
    }

    [HttpPut("{activityId:guid}")]
    public async Task<ActionResult<OrderActivityReadDto>> Update(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        OrderActivityWriteDto request,
        CancellationToken cancellationToken)
    {
        var activity = await db.OrderActivities
            .Include(item => item.ItineraryDay)
            .FirstOrDefaultAsync(item => item.Id == activityId, cancellationToken);
        if (activity is null || activity.ItineraryDayId != dayId || activity.ItineraryDay.OrderId != orderId)
        {
            return NotFound();
        }

        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        activity.Content = request.Content.Trim();
        activity.Provider = TrimToNull(request.Provider);
        activity.BookingTime = AsUnspecified(request.BookingTime);
        activity.CheckinTime = AsUnspecified(request.CheckinTime);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(activity));
    }

    [HttpDelete("{activityId:guid}")]
    public async Task<IActionResult> Delete(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        CancellationToken cancellationToken)
    {
        var activity = await db.OrderActivities
            .Include(item => item.ItineraryDay)
            .FirstOrDefaultAsync(item => item.Id == activityId, cancellationToken);
        if (activity is null || activity.ItineraryDayId != dayId || activity.ItineraryDay.OrderId != orderId)
        {
            return NotFound();
        }

        files.Delete(activity.TicketPath);
        db.OrderActivities.Remove(activity);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{activityId:guid}/ticket")]
    [RequestSizeLimit(8_000_000)]
    public async Task<ActionResult<OrderActivityReadDto>> UploadTicket(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var activity = await LoadActivityAsync(orderId, dayId, activityId, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        var (path, error) = await files.SaveAsync(
            StoredFileKind.Ticket,
            activity.Id,
            file,
            activity.TicketPath,
            AppFileStore.DocumentExtensions,
            AppFileStore.DocumentLimit,
            "电子票请上传 8MB 以内的 jpg / png / webp / pdf。",
            cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        activity.TicketPath = path;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(activity));
    }

    [HttpGet("{activityId:guid}/ticket")]
    public async Task<IActionResult> Ticket(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        CancellationToken cancellationToken)
    {
        var activity = await LoadActivityAsync(orderId, dayId, activityId, cancellationToken);
        var opened = files.Open(activity?.TicketPath);
        return opened is null ? NotFound() : PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    [HttpDelete("{activityId:guid}/ticket")]
    public async Task<IActionResult> DeleteTicket(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        CancellationToken cancellationToken)
    {
        var activity = await LoadActivityAsync(orderId, dayId, activityId, cancellationToken);
        if (activity is null)
        {
            return NotFound();
        }

        files.Delete(activity.TicketPath);
        activity.TicketPath = null;
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("reorder")]
    public async Task<ActionResult<List<OrderActivityReadDto>>> Reorder(
        Guid orderId,
        Guid dayId,
        OrderActivityReorderDto request,
        CancellationToken cancellationToken)
    {
        if (!await DayExistsAsync(orderId, dayId, cancellationToken))
        {
            return NotFound();
        }

        var activities = await db.OrderActivities
            .Where(activity => activity.ItineraryDayId == dayId)
            .ToListAsync(cancellationToken);
        var ids = request.ActivityIds ?? [];
        if (ids.Count == 0 ||
            ids.Count != activities.Count ||
            ids.Distinct().Count() != ids.Count ||
            !activities.Select(activity => activity.Id).ToHashSet().SetEquals(ids))
        {
            return Problem(title: "Validation error", detail: "活动排序必须包含当天全部活动，且不能重复。", statusCode: StatusCodes.Status400BadRequest);
        }

        for (var index = 0; index < ids.Count; index++)
        {
            activities.First(activity => activity.Id == ids[index]).SortOrder = index;
        }

        await db.SaveChangesAsync(cancellationToken);
        return Ok(activities.OrderBy(activity => activity.SortOrder).ThenBy(activity => activity.Id).Select(ToRead).ToList());
    }

    internal static OrderActivityReadDto ToRead(OrderActivity activity) => new()
    {
        Id = activity.Id,
        ItineraryDayId = activity.ItineraryDayId,
        Content = activity.Content,
        Provider = activity.Provider,
        BookingTime = activity.BookingTime,
        CheckinTime = activity.CheckinTime,
        TicketPath = activity.TicketPath,
        SortOrder = activity.SortOrder
    };

    private async Task<OrderActivity?> LoadActivityAsync(
        Guid orderId,
        Guid dayId,
        Guid activityId,
        CancellationToken cancellationToken)
    {
        var activity = await db.OrderActivities
            .Include(item => item.ItineraryDay)
            .FirstOrDefaultAsync(item => item.Id == activityId, cancellationToken);
        return activity is null || activity.ItineraryDayId != dayId || activity.ItineraryDay.OrderId != orderId
            ? null
            : activity;
    }

    private async Task<bool> DayExistsAsync(Guid orderId, Guid dayId, CancellationToken cancellationToken)
    {
        return await db.ItineraryDays.AnyAsync(
            day => day.Id == dayId && day.OrderId == orderId,
            cancellationToken);
    }

    private static string? Validate(OrderActivityWriteDto request)
    {
        return string.IsNullOrWhiteSpace(request.Content) ? "活动内容不能为空。" : null;
    }

    private static string? TrimToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static DateTime? AsUnspecified(DateTime? value)
    {
        return value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Unspecified);
    }
}
