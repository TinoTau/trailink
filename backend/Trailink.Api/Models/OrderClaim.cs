namespace Trailink.Api.Models;

/// <summary>
/// 抢单：司导在抢单页接了这张单，等调度员确认。一张单可以有多位司导抢。
/// 确认后这张单的未派日期派给被选中的司导，这张单的抢单记录全部删除，等级回到调度自留。
/// </summary>
public class OrderClaim
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid UserId { get; set; }
    public Guid DriverId { get; set; }

    /// <summary>抢单时订单的等级，确认时按它建立司导关系（之后调度员改等级不影响）。</summary>
    public int ShareLevel { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Order Order { get; set; } = null!;
    public User User { get; set; } = null!;
}
