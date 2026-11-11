using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api")]
public class LicensePhotosController(TrailinkDbContext db, AuthSession session, AppFileStore files) : ControllerBase
{
    public const int Front = 0;
    public const int Back = 1;

    [HttpGet("auth/license-photos")]
    public async Task<ActionResult<List<LicensePhotoReadDto>>> ListOwn(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var photos = await db.DriverLicensePhotos
            .Where(item => item.UserId == user.Id)
            .OrderBy(item => item.Side)
            .ToListAsync(cancellationToken);
        return Ok(photos.Select(ToRead).ToList());
    }

    [HttpPost("auth/license-photos")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<LicensePhotoReadDto>> UploadOwn([FromQuery] int side, IFormFile file, CancellationToken cancellationToken)
    {
        return SaveOwn(null, side, file, cancellationToken);
    }

    [HttpPut("auth/license-photos/{photoId:guid}")]
    [RequestSizeLimit(8_000_000)]
    public Task<ActionResult<LicensePhotoReadDto>> ReplaceOwn(Guid photoId, IFormFile file, CancellationToken cancellationToken)
    {
        return SaveOwn(photoId, null, file, cancellationToken);
    }

    [HttpDelete("auth/license-photos/{photoId:guid}")]
    public async Task<IActionResult> DeleteOwn(Guid photoId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var photo = await db.DriverLicensePhotos
            .FirstOrDefaultAsync(item => item.Id == photoId && item.UserId == user.Id, cancellationToken);
        if (photo is null)
        {
            return NotFound();
        }

        files.Delete(photo.FilePath);
        db.DriverLicensePhotos.Remove(photo);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("auth/license-photos/{photoId:guid}")]
    public async Task<IActionResult> DownloadOwn(Guid photoId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var photo = await db.DriverLicensePhotos
            .FirstOrDefaultAsync(item => item.Id == photoId && item.UserId == user.Id, cancellationToken);
        return Open(photo);
    }

    [HttpGet("drivers/{driverId:guid}/license-photos")]
    public async Task<ActionResult<List<LicensePhotoReadDto>>> ListForDriver(Guid driverId, CancellationToken cancellationToken)
    {
        var owner = await VisibleOwner(driverId, cancellationToken);
        if (owner.Result is not null)
        {
            return owner.Result;
        }

        if (owner.User is null)
        {
            return Ok(new List<LicensePhotoReadDto>());
        }

        var photos = await db.DriverLicensePhotos
            .Where(item => item.UserId == owner.User.Id)
            .OrderBy(item => item.Side)
            .ToListAsync(cancellationToken);
        return Ok(photos.Select(ToRead).ToList());
    }

    [HttpGet("drivers/{driverId:guid}/license-photos/{photoId:guid}")]
    public async Task<IActionResult> DownloadForDriver(Guid driverId, Guid photoId, CancellationToken cancellationToken)
    {
        var owner = await VisibleOwner(driverId, cancellationToken);
        if (owner.Result is not null)
        {
            return owner.Result;
        }

        if (owner.User is null)
        {
            return NotFound();
        }

        var photo = await db.DriverLicensePhotos
            .FirstOrDefaultAsync(item => item.Id == photoId && item.UserId == owner.User.Id, cancellationToken);
        return Open(photo);
    }

    private async Task<ActionResult<LicensePhotoReadDto>> SaveOwn(
        Guid? photoId,
        int? side,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.DriverId is null)
        {
            return this.Invalid("只有司导账号可以上传驾照。");
        }

        DriverLicensePhoto? existing = null;
        if (photoId is Guid replaceId)
        {
            existing = await db.DriverLicensePhotos
                .FirstOrDefaultAsync(item => item.Id == replaceId && item.UserId == user.Id, cancellationToken);
            if (existing is null)
            {
                return NotFound();
            }
        }
        else
        {
            if (side is not (Front or Back))
            {
                return this.Invalid("请指定驾照正面或反面。");
            }

            var taken = await db.DriverLicensePhotos
                .AnyAsync(item => item.UserId == user.Id && item.Side == side, cancellationToken);
            if (taken)
            {
                return this.Invalid("这一面已经有照片，请更新或先删除。");
            }
        }

        var storedId = existing?.Id ?? Guid.NewGuid();
        var (path, error) = await files.SaveAsync(
            StoredFileKind.License,
            storedId,
            file,
            existing?.FilePath,
            AppFileStore.ImageExtensions,
            AppFileStore.DocumentLimit,
            "驾照照片请上传 8MB 以内的 jpg、png 或 webp。",
            cancellationToken);
        if (error is not null)
        {
            return this.Invalid(error);
        }

        if (existing is null)
        {
            existing = new DriverLicensePhoto
            {
                Id = storedId,
                UserId = user.Id,
                FileName = AppFileStore.StoredName(file),
                FilePath = path!,
                Side = side!.Value
            };
            db.DriverLicensePhotos.Add(existing);
        }
        else
        {
            existing.FilePath = path!;
            if (AppFileStore.StoredName(file) is { Length: > 0 } name)
            {
                existing.FileName = name;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToRead(existing));
    }

    private async Task<(User? User, ActionResult? Result)> VisibleOwner(Guid driverId, CancellationToken cancellationToken)
    {
        var viewer = await session.GetUserAsync(cancellationToken);
        if (viewer is null)
        {
            return (null, Unauthorized());
        }

        var visible = await DriverRoster.Viewable(db, viewer)
            .AnyAsync(driver => driver.Id == driverId, cancellationToken);
        if (!visible)
        {
            return (null, NotFound());
        }

        var owner = await db.Users.FirstOrDefaultAsync(user => user.DriverId == driverId, cancellationToken);
        return (owner, null);
    }

    private IActionResult Open(DriverLicensePhoto? photo)
    {
        if (photo is null)
        {
            return NotFound();
        }

        return this.StoredFile(files, photo.FilePath);
    }

    private static LicensePhotoReadDto ToRead(DriverLicensePhoto photo) => new()
    {
        Id = photo.Id,
        Side = photo.Side,
        FileName = photo.FileName
    };
}
