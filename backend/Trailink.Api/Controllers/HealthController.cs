using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController(TrailinkDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var canConnect = await db.Database.CanConnectAsync(cancellationToken);
        return canConnect
            ? Ok(new { status = "ok", framework = "net10.0", database = "connected" })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "unavailable",
                framework = "net10.0",
                database = "disconnected"
            });
    }
}
