using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/drivers")]
public class DriversController(TrailinkDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DriverReadDto>>> List(CancellationToken cancellationToken)
    {
        var drivers = await db.Drivers
            .OrderBy(driver => driver.Name)
            .Select(driver => ToRead(driver))
            .ToListAsync(cancellationToken);

        return Ok(drivers);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DriverReadDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return driver is null ? NotFound() : Ok(ToRead(driver));
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
            Phone = request.Phone?.Trim(),
            Notes = request.Notes
        };

        db.Drivers.Add(driver);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = driver.Id }, ToRead(driver));
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
        if (driver is null)
        {
            return NotFound();
        }

        driver.Name = request.Name.Trim();
        driver.Phone = request.Phone?.Trim();
        driver.Notes = request.Notes;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(driver));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var driver = await db.Drivers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (driver is null)
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

    private static DriverReadDto ToRead(Driver driver) => new()
    {
        Id = driver.Id,
        Name = driver.Name,
        Phone = driver.Phone,
        Notes = driver.Notes
    };
}
