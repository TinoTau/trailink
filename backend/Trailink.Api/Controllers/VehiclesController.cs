using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/vehicles")]
public class VehiclesController(TrailinkDbContext db, AuthSession session, AppFileStore files) : ControllerBase
{
    public const int PhotoLimit = 3;

    [HttpGet]
    public async Task<ActionResult<List<VehicleReadDto>>> List(CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var vehicles = await db.Vehicles
            .Include(item => item.Photos)
            .Where(item => item.OwnerUserId == user.Id)
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.Plate)
            .ToListAsync(cancellationToken);
        return Ok(vehicles.Select(ToRead).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<VehicleReadDto>> Create(VehicleWriteDto request, CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var plate = TextValue.NullIfBlank(request.Plate);
        if (plate is null || plate.Length > 20)
        {
            return Problem(title: "Validation error", detail: "请填写 20 字以内的车牌号。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await PlateTaken(user.Id, plate, null, cancellationToken))
        {
            return Problem(title: "Validation error", detail: "这个车牌号已经有了。", statusCode: StatusCodes.Status400BadRequest);
        }

        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            OwnerUserId = user.Id,
            Plate = plate,
            SharedNotes = TextValue.NullIfBlank(request.SharedNotes),
            Info = TextValue.NullIfBlank(request.Info),
            Available = request.Available,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(List), ToRead(vehicle));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<VehicleReadDto>> Update(Guid id, VehicleWriteDto request, CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var vehicle = await LoadOwned(id, user.Id, cancellationToken);
        if (vehicle is null)
        {
            return NotFound();
        }

        var plate = TextValue.NullIfBlank(request.Plate);
        if (plate is null || plate.Length > 20)
        {
            return Problem(title: "Validation error", detail: "请填写 20 字以内的车牌号。", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await PlateTaken(user.Id, plate, vehicle.Id, cancellationToken))
        {
            return Problem(title: "Validation error", detail: "这个车牌号已经有了。", statusCode: StatusCodes.Status400BadRequest);
        }

        vehicle.Plate = plate;
        vehicle.SharedNotes = TextValue.NullIfBlank(request.SharedNotes);
        vehicle.Info = TextValue.NullIfBlank(request.Info);
        vehicle.Available = request.Available;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(vehicle));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var vehicle = await LoadOwned(id, user.Id, cancellationToken);
        if (vehicle is null)
        {
            return NotFound();
        }

        foreach (var photo in vehicle.Photos)
        {
            files.Delete(photo.FilePath);
        }

        db.Vehicles.Remove(vehicle);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/photos")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<VehicleReadDto>> Upload(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        return SavePhoto(id, null, file, cancellationToken);
    }

    [HttpPut("{id:guid}/photos/{photoId:guid}")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<VehicleReadDto>> Replace(Guid id, Guid photoId, IFormFile file, CancellationToken cancellationToken)
    {
        return SavePhoto(id, photoId, file, cancellationToken);
    }

    [HttpDelete("{id:guid}/photos/{photoId:guid}")]
    public async Task<ActionResult<VehicleReadDto>> DeletePhoto(Guid id, Guid photoId, CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var vehicle = await LoadOwned(id, user.Id, cancellationToken);
        var photo = vehicle?.Photos.FirstOrDefault(item => item.Id == photoId);
        if (vehicle is null || photo is null)
        {
            return NotFound();
        }

        files.Delete(photo.FilePath);
        db.VehiclePhotos.Remove(photo);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(vehicle));
    }

    [HttpGet("{id:guid}/photos/{photoId:guid}")]
    public async Task<IActionResult> DownloadPhoto(Guid id, Guid photoId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var photo = await db.VehiclePhotos
            .Include(item => item.Vehicle)
            .FirstOrDefaultAsync(item => item.Id == photoId && item.VehicleId == id, cancellationToken);
        if (photo is null || photo.Vehicle.OwnerUserId != user.Id)
        {
            return NotFound();
        }

        var opened = files.Open(photo.FilePath);
        return opened is null ? NotFound() : PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }

    private async Task<ActionResult<VehicleReadDto>> SavePhoto(
        Guid id,
        Guid? photoId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var user = await OwnAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var vehicle = await LoadOwned(id, user.Id, cancellationToken);
        if (vehicle is null)
        {
            return NotFound();
        }

        VehiclePhoto? existing = null;
        if (photoId is Guid replaceId)
        {
            existing = vehicle.Photos.FirstOrDefault(item => item.Id == replaceId);
            if (existing is null)
            {
                return NotFound();
            }
        }
        else if (vehicle.Photos.Count >= PhotoLimit)
        {
            return Problem(title: "Validation error", detail: "一辆车最多三张照片。", statusCode: StatusCodes.Status400BadRequest);
        }

        var storedId = existing?.Id ?? Guid.NewGuid();
        var (path, error) = await files.SaveAsync(
            StoredFileKind.Vehicle,
            storedId,
            file,
            existing?.FilePath,
            AppFileStore.ImageExtensions,
            AppFileStore.DocumentLimit,
            "车辆照片请上传 8MB 以内的 jpg、png 或 webp。",
            cancellationToken);
        if (error is not null)
        {
            return Problem(title: "Validation error", detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        if (existing is null)
        {
            var name = Path.GetFileName(file.FileName);
            if (name.Length > 255)
            {
                name = name[..255];
            }

            existing = new VehiclePhoto
            {
                Id = storedId,
                VehicleId = vehicle.Id,
                FileName = name,
                FilePath = path!,
                SortOrder = vehicle.Photos.Count == 0 ? 0 : vehicle.Photos.Max(item => item.SortOrder) + 1
            };
            vehicle.Photos.Add(existing);
            db.VehiclePhotos.Add(existing);
        }
        else
        {
            existing.FilePath = path!;
            var name = Path.GetFileName(file.FileName);
            if (!string.IsNullOrWhiteSpace(name))
            {
                existing.FileName = name.Length > 255 ? name[..255] : name;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(vehicle));
    }

    private Task<User?> OwnAsync(CancellationToken cancellationToken)
    {
        return session.GetUserAsync(cancellationToken);
    }

    private Task<Vehicle?> LoadOwned(Guid id, Guid userId, CancellationToken cancellationToken)
    {
        return db.Vehicles
            .Include(item => item.Photos)
            .FirstOrDefaultAsync(item => item.Id == id && item.OwnerUserId == userId, cancellationToken);
    }

    private Task<bool> PlateTaken(Guid userId, string plate, Guid? exceptId, CancellationToken cancellationToken)
    {
        return db.Vehicles.AnyAsync(
            item => item.OwnerUserId == userId && item.Plate == plate && (exceptId == null || item.Id != exceptId),
            cancellationToken);
    }

    internal static VehicleReadDto ToRead(Vehicle vehicle) => new()
    {
        Id = vehicle.Id,
        Plate = vehicle.Plate,
        SharedNotes = vehicle.SharedNotes,
        Info = vehicle.Info,
        Available = vehicle.Available,
        Photos = vehicle.Photos
            .OrderBy(photo => photo.SortOrder)
            .ThenBy(photo => photo.Id)
            .Select(photo => new VehiclePhotoReadDto
            {
                Id = photo.Id,
                FileName = photo.FileName,
                SortOrder = photo.SortOrder
            })
            .ToList()
    };
}
