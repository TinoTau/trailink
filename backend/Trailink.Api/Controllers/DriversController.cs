using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/drivers")]
public class DriversController(TrailinkDbContext db, AuthSession session) : ControllerBase
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
        var notes = userId is Guid id
            ? await db.DriverNotes
                .Where(note => note.UserId == id && driverIds.Contains(note.DriverId))
                .ToDictionaryAsync(note => note.DriverId, note => note.Notes, cancellationToken)
            : [];
        var accounts = await AccountProfilesAsync(driverIds, cancellationToken);

        return Ok(drivers.Select(driver =>
        {
            accounts.TryGetValue(driver.Id, out var account);
            return ToRead(driver, notes.GetValueOrDefault(driver.Id), account?.Name, account?.Contact);
        }).ToList());
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

        await UpsertNoteAsync(driver.Id, request.Notes, cancellationToken);
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
        var notes = session.UserId is Guid userId
            ? await db.DriverNotes
                .Where(note => note.DriverId == driver.Id && note.UserId == userId)
                .Select(note => note.Notes)
                .FirstOrDefaultAsync(cancellationToken)
            : null;
        var account = await db.Users
            .Where(item => item.DriverId == driver.Id)
            .Select(item => new { item.Name, item.Contact })
            .FirstOrDefaultAsync(cancellationToken);
        return ToRead(driver, notes, account?.Name, account?.Contact);
    }

    private IQueryable<Driver> VisibleDrivers(User? user)
    {
        if (user?.Role == UserRoles.Dispatcher)
        {
            return db.Drivers.Where(driver => db.DriverApplications.Any(application =>
                application.DispatcherUserId == user.Id &&
                application.ApprovedAt != null &&
                application.User.DriverId == driver.Id));
        }

        if (user?.Role == UserRoles.Company && user.CompanyId is Guid companyId)
        {
            return db.Drivers.Where(driver => db.CompanyMembers.Any(member =>
                member.CompanyId == companyId &&
                member.Role == UserRoles.Driver &&
                member.User.DriverId == driver.Id));
        }

        if (user?.Role == UserRoles.Driver && user.DriverId is Guid ownId)
        {
            return db.Drivers.Where(driver => driver.Id == ownId);
        }

        return db.Drivers.Where(driver => false);
    }

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
            .Select(item => new { item.DriverId, item.Name, item.Contact })
            .ToListAsync(cancellationToken);
        return rows
            .GroupBy(item => item.DriverId!.Value)
            .ToDictionary(group => group.Key, group => new AccountProfile(group.First().Name, group.First().Contact));
    }

    private static DriverReadDto ToRead(Driver driver, string? notes, string? accountName = null, string? accountContact = null) => new()
    {
        Id = driver.Id,
        Name = string.IsNullOrWhiteSpace(accountName) ? driver.Name : accountName,
        Phone = driver.Phone,
        Contact = string.IsNullOrWhiteSpace(accountContact) ? null : accountContact,
        Notes = notes
    };

    private sealed record AccountProfile(string Name, string? Contact);

    private async Task UpsertNoteAsync(Guid driverId, string? notes, CancellationToken cancellationToken)
    {
        if (session.UserId is not Guid userId)
        {
            return;
        }

        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            await db.DriverNotes
                .Where(note => note.DriverId == driverId && note.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);
            return;
        }

        // 失焦和点保存可能同时插入同一行，用冲突更新而不是先查再插。
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO driver_notes (id, driver_id, user_id, notes)
            VALUES ({Guid.NewGuid()}, {driverId}, {userId}, {trimmed})
            ON CONFLICT (driver_id, user_id) DO UPDATE SET notes = EXCLUDED.notes
            """, cancellationToken);
    }
}
