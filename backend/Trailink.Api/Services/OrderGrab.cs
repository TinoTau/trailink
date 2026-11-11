using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

/// <summary>
/// 抢单：调度员把手头没派完的订单按等级放给司导；司导抢单后等调度员确认，确认后才派给他。
/// <list type="bullet">
/// <item>调度自留：不放出，抢单页谁都看不到（调度员自己分给熟悉的司导）。</item>
/// <item>公司内部：订单所属公司的司导（向公司账户或公司调度员申请过，或派单时写进公司成员）。</item>
/// <item>面向所有人：所有有司导身份的人。</item>
/// <item>被这位调度员隐藏（拉黑）的司导，三种都看不到、不能抢，已抢的也不再给调度员看。</item>
/// </list>
/// 抢的是订单里还没派的全部日期（整单，或拆单剩下的一段），不能只抢其中几天；
/// 这些日期里有任何一天自己已经有行程就不能抢，由司导自己决定要不要先处理掉原来的单。
/// 一张单可以有多位司导抢。调度员确认其中一位：未派日期派给他，这张单的抢单全部清掉，等级回到调度自留。
/// 确认时按抢单时的等级建立关系：公司内部单成为调度员的司导；面向所有人单成为调度员和这家公司的司导。
/// </summary>
public class OrderGrab(TrailinkDbContext db, OrderDriverAssignment assignment)
{
    public const string Changed = "这张单已经被别人接走或调度员改过，请刷新后再看。";

    public async Task<List<GrabOrderDto>> ListAsync(User user, CancellationToken cancellationToken)
    {
        if (user.DriverId is not Guid driverId)
        {
            return [];
        }

        var orders = await OpenOrders()
            .Include(order => order.Company)
            .Include(order => order.CreatedBy)
            .Include(order => order.AssignedDispatcher)
            .Include(order => order.Days).ThenInclude(day => day.Activities)
            .ToListAsync(cancellationToken);

        var audience = await AudienceAsync(user, driverId, cancellationToken);
        // 分批读取时日期可能刚好被派走，读完再按内存里的日期判断一次。
        var listed = orders.Where(order => IsOpen(order) && audience.CanSee(order)).ToList();
        var listedIds = listed.Select(order => order.Id).ToList();
        var claimed = (await db.OrderClaims
            .Where(claim => claim.UserId == user.Id && listedIds.Contains(claim.OrderId))
            .Select(claim => claim.OrderId)
            .ToListAsync(cancellationToken)).ToHashSet();

        var dates = listed.SelectMany(OpenDays).Select(day => day.ServiceDate).Distinct().ToList();
        var mine = await MyDaysAsync(driverId, dates, cancellationToken);

        return listed
            .Select(order =>
            {
                var dto = ToDto(order, mine.Where(item => item.OrderId != order.Id).ToList());
                dto.ClaimedByMe = claimed.Contains(order.Id);
                return dto;
            })
            .OrderBy(item => item.Days[0].ServiceDate)
            .ThenBy(item => item.OrderId)
            .ToList();
    }

    /// <summary>抢单：记下一条待确认的抢单。不能抢时返回状态码和原因（404 看不到，409 有冲突或订单变了）。</summary>
    public async Task<(GrabResultDto? Result, int Status, string? Error)> ClaimAsync(
        User user,
        Guid orderId,
        IReadOnlyCollection<Guid> dayIds,
        CancellationToken cancellationToken)
    {
        if (user.DriverId is not Guid driverId)
        {
            return (null, StatusCodes.Status400BadRequest, "这个账号没有司导身份，不能抢单。");
        }

        var order = await db.Orders
            .AsSplitQuery()
            .Include(item => item.Days)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        var audience = await AudienceAsync(user, driverId, cancellationToken);
        if (order is null || !audience.CanSee(order))
        {
            return (null, StatusCodes.Status404NotFound, "看不到这张单，可能已经派出或不再放出。");
        }

        var open = OpenDays(order).ToList();
        if (!IsOpen(order) || !open.Select(day => day.Id).ToHashSet().SetEquals(dayIds))
        {
            return (null, StatusCodes.Status409Conflict, Changed);
        }

        if (await ConflictTextAsync(driverId, order, open, cancellationToken) is string conflict)
        {
            return (null, StatusCodes.Status409Conflict, $"{conflict}你已经有行程，不能抢这张单。");
        }

        var exists = await db.OrderClaims.AnyAsync(claim => claim.OrderId == order.Id && claim.UserId == user.Id, cancellationToken);
        if (!exists)
        {
            db.OrderClaims.Add(new OrderClaim
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                UserId = user.Id,
                DriverId = driverId,
                ShareLevel = order.ShareLevel,
                CreatedAt = DateTimeOffset.UtcNow
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // 同一个人连点两次：唯一索引挡住第二条，结果一样是已抢。
            }
        }

        return (new GrabResultDto { OrderId = order.Id, Dates = open.Select(day => day.ServiceDate).ToList() }, StatusCodes.Status200OK, null);
    }

    /// <summary>撤回自己的抢单。</summary>
    public async Task<bool> WithdrawAsync(User user, Guid orderId, CancellationToken cancellationToken)
    {
        var claim = await db.OrderClaims.FirstOrDefaultAsync(item => item.OrderId == orderId && item.UserId == user.Id, cancellationToken);
        if (claim is null)
        {
            return false;
        }

        db.OrderClaims.Remove(claim);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>调度台：自己调度台上的订单（公司账户也只看分给自己的）上待确认的抢单。拉黑的人不列出。</summary>
    public async Task<List<OrderClaimDto>> PendingAsync(User user, CancellationToken cancellationToken)
    {
        if (user.Role is not (UserRoles.Dispatcher or UserRoles.Company))
        {
            return [];
        }

        var today = BusinessDate.Today;
        var deskOrderIds = db.Orders.Where(OrderRules.OnDesk(user)).Select(order => order.Id);
        var claims = await db.OrderClaims
            .Include(claim => claim.User)
            .Include(claim => claim.Order)
            .Where(claim =>
                // 只看自己调度台上的单（和调度台订单列表同一条规则，公司账户也一样）；没分调度员的自留单看建单人。
                deskOrderIds.Contains(claim.OrderId) ||
                (claim.Order.AssignedDispatcherUserId == null && claim.Order.CompanyId == null && claim.Order.CreatedByUserId == user.Id))
            .Where(claim => claim.Order.Days.Any(day => day.DriverId == null))
            .Where(claim => !claim.Order.Days.Any(day => day.DriverId == null && day.ServiceDate < today))
            .OrderBy(claim => claim.CreatedAt)
            .ToListAsync(cancellationToken);
        if (claims.Count == 0)
        {
            return [];
        }

        var driverIds = claims.Select(claim => claim.DriverId).Distinct().ToList();
        var dispatcherIds = claims.Select(claim => OrderRules.DispatcherId(claim.Order)).OfType<Guid>().Distinct().ToList();
        var blocked = (await db.DriverNotes
            .Where(note => note.Hidden && driverIds.Contains(note.DriverId) && dispatcherIds.Contains(note.UserId))
            .Select(note => new { note.DriverId, note.UserId })
            .ToListAsync(cancellationToken)).Select(item => (item.DriverId, item.UserId)).ToHashSet();
        var roster = (await DriverRoster.Visible(db, user)
            .Where(driver => driverIds.Contains(driver.Id))
            .Select(driver => driver.Id)
            .ToListAsync(cancellationToken)).ToHashSet();

        return claims
            .Where(claim => OrderRules.DispatcherId(claim.Order) is not Guid dispatcher || !blocked.Contains((claim.DriverId, dispatcher)))
            .Select(claim => new OrderClaimDto
            {
                OrderId = claim.OrderId,
                DriverId = claim.DriverId,
                DriverName = claim.User.Name,
                Contact = claim.User.Contact,
                HasAvatar = !string.IsNullOrWhiteSpace(claim.User.AvatarPath),
                InRoster = roster.Contains(claim.DriverId),
                CreatedAt = claim.CreatedAt
            })
            .ToList();
    }

    /// <summary>确认派单：把订单里还没派的日期派给这位抢单司导，清掉这张单的全部抢单，等级回到调度自留。</summary>
    public async Task<(GrabResultDto? Result, int Status, string? Error)> ConfirmAsync(
        User user,
        Guid orderId,
        Guid driverId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM orders WHERE id = {orderId} FOR UPDATE", cancellationToken);

        var order = await db.Orders
            .AsSplitQuery()
            .Include(item => item.Days)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
        if (order is null)
        {
            return (null, StatusCodes.Status404NotFound, "找不到这张订单。");
        }

        if (!OrderRules.CanSetShareLevel(order, user))
        {
            return (null, StatusCodes.Status403Forbidden, "只有这张订单的调度员或所属公司能确认抢单。");
        }

        var claims = await db.OrderClaims.Where(claim => claim.OrderId == orderId).ToListAsync(cancellationToken);
        var chosen = claims.FirstOrDefault(claim => claim.DriverId == driverId);
        if (chosen is null)
        {
            return (null, StatusCodes.Status404NotFound, "这位司导没有抢这张单，或者已经撤回。");
        }

        var open = OpenDays(order).ToList();
        if (!IsOpen(order))
        {
            return (null, StatusCodes.Status409Conflict, "这张单已经没有可以派的日期，或者有日期已经过去。");
        }

        if (await ConflictTextAsync(driverId, order, open, cancellationToken) is string conflict)
        {
            return (null, StatusCodes.Status409Conflict, $"这位司导{conflict}已经有别的行程，不能派给他。");
        }

        var dispatcherId = OrderRules.DispatcherId(order);
        foreach (var day in open)
        {
            OrderDriverAssignment.SetDayDriver(day, driverId, dispatcherId);
        }

        if (dispatcherId is Guid dispatcher)
        {
            if (chosen.ShareLevel != OrderShareLevels.Own)
            {
                await EnsureDriverOfAsync(chosen.UserId, dispatcher, cancellationToken);
                await assignment.LinkDriverToCompanyAsync(order, driverId, dispatcher, cancellationToken);
            }

            if (chosen.ShareLevel == OrderShareLevels.Public && order.CompanyId is Guid companyId)
            {
                var companyAccount = await db.Users
                    .Where(item => item.Role == UserRoles.Company && item.CompanyId == companyId)
                    .Select(item => (Guid?)item.Id)
                    .FirstOrDefaultAsync(cancellationToken);
                if (companyAccount is Guid account && account != dispatcher)
                {
                    await EnsureDriverOfAsync(chosen.UserId, account, cancellationToken);
                }
            }
        }

        db.OrderClaims.RemoveRange(claims);
        order.ShareLevel = OrderShareLevels.Own;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (new GrabResultDto { OrderId = order.Id, Dates = open.Select(day => day.ServiceDate).ToList() }, StatusCodes.Status200OK, null);
    }

    /// <summary>还有没派的日期、且这些日期都不早于今天的订单。</summary>
    private IQueryable<Order> OpenOrders()
    {
        var today = BusinessDate.Today;
        return db.Orders
            .AsSplitQuery()
            .Where(order => order.Days.Any(day => day.DriverId == null))
            .Where(order => !order.Days.Any(day => day.DriverId == null && day.ServiceDate < today));
    }

    private static bool IsOpen(Order order)
    {
        var open = OpenDays(order).ToList();
        return open.Count > 0 && open.TrueForAll(day => day.ServiceDate >= BusinessDate.Today);
    }

    /// <summary>还没派司导的日期，按日期排序。抢单一次就是这些日期。</summary>
    private static IEnumerable<ItineraryDay> OpenDays(Order order) =>
        order.Days.Where(day => day.DriverId is null).OrderBy(day => day.ServiceDate);

    /// <summary>这位司导在这些日期已有别的行程时，返回日期文字（如「11月8日、11月9日」）。</summary>
    private async Task<string?> ConflictTextAsync(Guid driverId, Order order, List<ItineraryDay> open, CancellationToken cancellationToken)
    {
        var conflicts = (await MyDaysAsync(driverId, open.Select(day => day.ServiceDate).ToList(), cancellationToken))
            .Where(item => item.OrderId != order.Id)
            .ToList();
        return conflicts.Count == 0
            ? null
            : string.Join("、", conflicts.Select(item => item.ServiceDate).Distinct().Order().Select(date => $"{date.Month}月{date.Day}日"));
    }

    private async Task<List<GrabConflictDto>> MyDaysAsync(Guid driverId, List<DateOnly> dates, CancellationToken cancellationToken)
    {
        if (dates.Count == 0)
        {
            return [];
        }

        var days = await db.ItineraryDays
            .Include(day => day.Order)
            .Where(day => day.DriverId == driverId && dates.Contains(day.ServiceDate))
            .ToListAsync(cancellationToken);
        return days.Select(day => new GrabConflictDto
        {
            OrderId = day.OrderId,
            ServiceDate = day.ServiceDate,
            OrderLabel = OrderRules.Label(day.Order.PlatformOrderNo, day.Order.SharedNotes)
        }).ToList();
    }

    /// <summary>成为这位调度员（或公司账户）的司导：已有申请就批准，没有就补一条已批准的。</summary>
    private async Task EnsureDriverOfAsync(Guid userId, Guid dispatcherUserId, CancellationToken cancellationToken)
    {
        var existing = await db.DriverApplications.FirstOrDefaultAsync(
            item => item.UserId == userId && item.DispatcherUserId == dispatcherUserId,
            cancellationToken);
        if (existing is not null)
        {
            existing.ApprovedAt ??= DateTimeOffset.UtcNow;
            return;
        }

        var now = DateTimeOffset.UtcNow;
        db.DriverApplications.Add(new DriverApplication
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DispatcherUserId = dispatcherUserId,
            CreatedAt = now,
            ApprovedAt = now
        });
    }

    private async Task<Audience> AudienceAsync(User user, Guid driverId, CancellationToken cancellationToken)
    {
        // 我是谁的司导（已批准）。
        var myDispatchers = (await db.DriverApplications
            .Where(item => item.UserId == user.Id && item.ApprovedAt != null)
            .Select(item => item.DispatcherUserId)
            .ToListAsync(cancellationToken)).ToHashSet();

        // 我属于哪些公司的司导：派单写进的公司成员，或者向公司账户、公司调度员申请过并已批准。
        var memberCompanies = await db.CompanyMembers
            .Where(item => item.UserId == user.Id)
            .Select(item => item.CompanyId)
            .ToListAsync(cancellationToken);
        var accountCompanies = await db.Users
            .Where(item => myDispatchers.Contains(item.Id) && item.Role == UserRoles.Company && item.CompanyId != null)
            .Select(item => item.CompanyId!.Value)
            .ToListAsync(cancellationToken);
        var dispatcherCompanies = await db.CompanyMembers
            .Where(item => myDispatchers.Contains(item.UserId) && item.Role == UserRoles.Dispatcher)
            .Select(item => item.CompanyId)
            .ToListAsync(cancellationToken);
        var companies = memberCompanies.Concat(accountCompanies).Concat(dispatcherCompanies).ToHashSet();

        // 哪些调度员把我隐藏（拉黑）了。
        var hiddenBy = (await db.DriverNotes
            .Where(item => item.DriverId == driverId && item.Hidden)
            .Select(item => item.UserId)
            .ToListAsync(cancellationToken)).ToHashSet();

        return new Audience(user.Id, myDispatchers, companies, hiddenBy);
    }

    private static GrabOrderDto ToDto(Order order, List<GrabConflictDto> conflicts)
    {
        var open = OpenDays(order).ToList();
        var dates = open.Select(day => day.ServiceDate).ToHashSet();
        var dispatcher = order.AssignedDispatcher ?? order.CreatedBy;
        return new GrabOrderDto
        {
            OrderId = order.Id,
            ShareLevel = order.ShareLevel,
            CompanyName = order.Company?.Name,
            DispatcherName = dispatcher?.Name ?? string.Empty,
            GuestCount = order.GuestCount,
            TotalDayCount = order.Days.Count,
            Days = open.Select(day => new GrabDayDto
            {
                Id = day.Id,
                ServiceDate = day.ServiceDate,
                EndLocation = day.EndLocation,
                Description = day.Description,
                Activities = day.Activities
                    .OrderBy(activity => activity.SortOrder)
                    .ThenBy(activity => activity.Id)
                    .Select(activity => new GrabActivityDto
                    {
                        Content = activity.Content,
                        BookingTime = activity.BookingTime,
                        CheckinTime = activity.CheckinTime
                    })
                    .ToList()
            }).ToList(),
            Conflicts = conflicts
                .Where(item => dates.Contains(item.ServiceDate))
                .OrderBy(item => item.ServiceDate)
                .ToList()
        };
    }

    private sealed record Audience(Guid UserId, HashSet<Guid> MyDispatchers, HashSet<Guid> Companies, HashSet<Guid> HiddenBy)
    {
        public bool CanSee(Order order)
        {
            if (OrderRules.DispatcherId(order) is not Guid dispatcherId || dispatcherId == UserId)
            {
                return false;
            }

            // 被这位调度员隐藏就是拉黑：他放出的单一张都看不到，公开单也一样。
            if (HiddenBy.Contains(dispatcherId))
            {
                return false;
            }

            return order.ShareLevel switch
            {
                OrderShareLevels.Public => true,
                OrderShareLevels.Company => order.CompanyId is Guid companyId && Companies.Contains(companyId),
                _ => false,
            };
        }
    }
}
