using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/drivers")]
public class DriversController(TrailinkDbContext db, AuthSession session, AppFileStore files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DriverReadDto>>> List(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        var drivers = await VisibleDrivers(user)
            .OrderBy(driver => driver.Name)
            .ToListAsync(cancellationToken);
        var driverIds = drivers.Select(driver => driver.Id).ToList();
        var userId = user?.Id;
        var noteRows = userId is Guid id
            ? await db.DriverNotes
                .Where(note => note.UserId == id && driverIds.Contains(note.DriverId))
                .Select(note => new { note.DriverId, note.Notes, note.Hidden })
                .ToListAsync(cancellationToken)
            : [];
        var notes = noteRows.ToDictionary(
            note => note.DriverId,
            note => new ViewerNote(note.Notes, note.Hidden));
        var accounts = await AccountProfilesAsync(driverIds, cancellationToken);

        return Ok(drivers.Select(driver =>
        {
            accounts.TryGetValue(driver.Id, out var account);
            notes.TryGetValue(driver.Id, out var note);
            return ToRead(
                driver,
                note?.Notes,
                account?.Name,
                account?.Contact,
                note?.Hidden ?? false,
                account?.HasAvatar ?? false);
        }).ToList());
    }

    [HttpGet("{id:guid}/avatar")]
    public async Task<IActionResult> Avatar(Guid id, CancellationToken cancellationToken)
    {
        if (!await CanReadAsync(id, cancellationToken))
        {
            return NotFound();
        }

        var path = await db.Users
            .Where(item => item.DriverId == id)
            .Select(item => item.AvatarPath)
            .FirstOrDefaultAsync(cancellationToken);
        var opened = files.Open(path);
        if (opened is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "private, no-cache";
        return PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DriverReadDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null || !await CanReadAsync(driver.Id, cancellationToken))
        {
            return NotFound();
        }

        return Ok(await ToReadAsync(driver, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<DriverReadDto>> Create(DriverWriteDto request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var driver = new Driver
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Phone = request.Phone?.Trim()
        };

        db.Drivers.Add(driver);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = driver.Id }, await ToReadAsync(driver, cancellationToken));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DriverReadDto>> Update(Guid id, DriverWriteDto request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null || !await CanReadAsync(driver.Id, cancellationToken))
        {
            return NotFound();
        }

        var account = await db.Users
            .Where(item => item.DriverId == driver.Id)
            .Select(item => new { item.Name })
            .FirstOrDefaultAsync(cancellationToken);
        driver.Name = string.IsNullOrWhiteSpace(account?.Name) ? request.Name.Trim() : account.Name;
        driver.Phone = request.Phone?.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return Ok(await ToReadAsync(driver, cancellationToken));
    }

    [HttpPut("{id:guid}/notes")]
    public async Task<ActionResult<DriverReadDto>> UpdateNotes(
        Guid id,
        DriverNoteWriteDto request,
        CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null || !await CanReadAsync(driver.Id, cancellationToken))
        {
            return NotFound();
        }

        if (session.UserId is Guid userId)
        {
            await ViewerNotes.UpsertDriverAsync(db, driver.Id, userId, request.Notes, cancellationToken);
        }
        return Ok(await ToReadAsync(driver, cancellationToken));
    }

    [HttpPut("{id:guid}/hidden")]
    public async Task<ActionResult<DriverReadDto>> UpdateHidden(
        Guid id,
        DriverHiddenWriteDto request,
        CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null || !await CanReadAsync(driver.Id, cancellationToken))
        {
            return NotFound();
        }

        if (session.UserId is Guid userId)
        {
            await ViewerNotes.SetDriverHiddenAsync(db, driver.Id, userId, request.Hidden, cancellationToken);
        }
        return Ok(await ToReadAsync(driver, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null || !await CanReadAsync(driver.Id, cancellationToken))
        {
            return NotFound();
        }

        db.Drivers.Remove(driver);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static string? Validate(DriverWriteDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "司机姓名不能为空。";
        }

        if (request.Name.Trim().Length > 100)
        {
            return "司机姓名不能超过 100 个字符。";
        }

        if (request.Phone is { Length: > 50 })
        {
            return "联系电话不能超过 50 个字符。";
        }

        return null;
    }

    private async Task<DriverReadDto> ToReadAsync(Driver driver, CancellationToken cancellationToken)
    {
        ViewerNote? note = null;
        if (session.UserId is Guid userId)
        {
            var row = await db.DriverNotes
                .Where(item => item.DriverId == driver.Id && item.UserId == userId)
                .Select(item => new { item.Notes, item.Hidden })
                .FirstOrDefaultAsync(cancellationToken);
            note = row is null ? null : new ViewerNote(row.Notes, row.Hidden);
        }
        var account = await db.Users
            .Where(item => item.DriverId == driver.Id)
            .Select(item => new { item.Name, item.Contact, item.AvatarPath })
            .FirstOrDefaultAsync(cancellationToken);
        return ToRead(
            driver,
            note?.Notes,
            account?.Name,
            account?.Contact,
            note?.Hidden ?? false,
            !string.IsNullOrWhiteSpace(account?.AvatarPath));
    }

    private IQueryable<Driver> VisibleDrivers(User? user) => DriverRoster.Visible(db, user);

    private async Task<bool> CanReadAsync(Guid driverId, CancellationToken cancellationToken)
    {
        var linked = await db.Users.AnyAsync(item => item.DriverId == driverId, cancellationToken);
        if (!linked)
        {
            return true;
        }

        var user = await session.GetUserAsync(cancellationToken);
        return await VisibleDrivers(user).AnyAsync(driver => driver.Id == driverId, cancellationToken);
    }

    private async Task<Dictionary<Guid, AccountProfile>> AccountProfilesAsync(
        List<Guid> driverIds,
        CancellationToken cancellationToken)
    {
        var rows = await db.Users
            .Where(item => item.DriverId != null && driverIds.Contains(item.DriverId.Value))
            .Select(item => new { item.DriverId, item.Name, item.Contact, item.AvatarPath })
            .ToListAsync(cancellationToken);
        return rows
            .GroupBy(item => item.DriverId!.Value)
            .ToDictionary(
                group => group.Key,
                group => new AccountProfile(
                    group.First().Name,
                    group.First().Contact,
                    !string.IsNullOrWhiteSpace(group.First().AvatarPath)));
    }

    private static DriverReadDto ToRead(
        Driver driver,
        string? notes,
        string? accountName = null,
        string? accountContact = null,
        bool hidden = false,
        bool hasAvatar = false) => new()
    {
        Id = driver.Id,
        Name = string.IsNullOrWhiteSpace(accountName) ? driver.Name : accountName,
        Phone = driver.Phone,
        Contact = string.IsNullOrWhiteSpace(accountContact) ? null : accountContact,
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes,
        Hidden = hidden,
        HasAvatar = hasAvatar
    };

    private sealed record AccountProfile(string Name, string? Contact, bool HasAvatar);
    private sealed record ViewerNote(string? Notes, bool Hidden);
}
