using Microsoft.AspNetCore.Mvc;
using Trailink.Api.DTOs;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

/// <summary>抢单：司导列出能抢的单、抢单、撤回；调度员看待确认的抢单并确认派单。规则见 <see cref="OrderGrab"/>。</summary>
[ApiController]
[Route("api/grab")]
public class GrabController(AuthSession session, OrderGrab grab) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<GrabOrderDto>>> List(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        return user is null ? Unauthorized() : Ok(await grab.ListAsync(user, cancellationToken));
    }

    [HttpPost("{orderId:guid}")]
    public async Task<ActionResult<GrabResultDto>> Claim(Guid orderId, GrabWriteDto request, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var (result, status, error) = await grab.ClaimAsync(user, orderId, request.DayIds, cancellationToken);
        return result is not null ? Ok(result) : Problem(detail: error, statusCode: status);
    }

    [HttpDelete("{orderId:guid}")]
    public async Task<IActionResult> Withdraw(Guid orderId, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        return await grab.WithdrawAsync(user, orderId, cancellationToken) ? NoContent() : NotFound();
    }

    [HttpGet("claims")]
    public async Task<ActionResult<List<OrderClaimDto>>> Pending(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        return user is null ? Unauthorized() : Ok(await grab.PendingAsync(user, cancellationToken));
    }

    [HttpPost("{orderId:guid}/confirm")]
    public async Task<ActionResult<GrabResultDto>> Confirm(Guid orderId, ConfirmClaimDto request, CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var (result, status, error) = await grab.ConfirmAsync(user, orderId, request.DriverId, cancellationToken);
        return result is not null ? Ok(result) : Problem(detail: error, statusCode: status);
    }
}
