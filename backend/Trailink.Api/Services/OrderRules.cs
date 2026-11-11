using System.Linq.Expressions;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

/// <summary>
/// 订单相关业务规则的唯一定义。后端各处和返回给前端的判断结果都从这里来。
/// </summary>
public static class OrderRules
{
    /// <summary>派出人：当前把这一天派给司导的人；旧数据没有记录时回退建单人。</summary>
    /// <summary>
    /// 订单的调度员：公司分给的调度员；没分时是建单人（公司自己留着的单就是公司账户，调度员建单时也写成自己）。
    /// 抢单等级只有他能改，抢到后各天的派出人也记成他。
    /// </summary>
    public static Guid? DispatcherId(Order order) => order.AssignedDispatcherUserId ?? order.CreatedByUserId;

    /// <summary>能改抢单范围：这张单的调度员，或订单所属公司的公司账户。</summary>
    public static bool CanSetShareLevel(Order order, User? user) =>
        user is not null &&
        (DispatcherId(order) == user.Id ||
         (user.Role == UserRoles.Company && user.CompanyId is Guid companyId && order.CompanyId == companyId));

    public static Guid? AssignerId(Order order, ItineraryDay day) =>
        day.AssignedByUserId ?? order.CreatedByUserId;

    /// <summary>结束日期 = 行程日期最大值，不单独存储。</summary>
    public static DateOnly? EndDate(IEnumerable<ItineraryDay> days)
    {
        DateOnly? end = null;
        foreach (var day in days)
        {
            if (end is null || day.ServiceDate > end.Value)
            {
                end = day.ServiceDate;
            }
        }

        return end;
    }

    /// <summary>已结束：结束日期早于今天。没有行程日的订单不算结束。</summary>
    public static bool IsFinished(Order order, DateOnly today) =>
        EndDate(order.Days) is DateOnly end && end < today;

    /// <summary>进行中：起始日期不晚于今天，且还没结束。</summary>
    public static bool IsInProgress(Order order, DateOnly today) =>
        order.StartDate <= today && (EndDate(order.Days) ?? order.StartDate) >= today;

    /// <summary>
    /// 历史单：有行程日、全部已派、且已结束。写成表达式，既能在数据库查询里用，也能编译后在内存里用。
    /// </summary>
    public static Expression<Func<Order, bool>> Historical(DateOnly today) => order =>
        order.Days.Any() &&
        order.Days.All(day => day.DriverId != null) &&
        order.Days.Max(day => day.ServiceDate) < today;

    /// <summary>
    /// 拆单：有多位司导、有多个派出人，或者已经派了一部分但没派完。
    /// </summary>
    public static bool IsSplit(Order order)
    {
        var assigned = order.Days.Where(day => day.DriverId is not null).ToList();
        if (assigned.Count == 0)
        {
            return false;
        }

        return assigned.Select(day => day.DriverId).Distinct().Count() > 1 ||
               assigned.Select(day => AssignerId(order, day)).Distinct().Count() > 1 ||
               assigned.Count < order.Days.Count;
    }

    /// <summary>
    /// 新建订单放在谁的调度台上：调度员建的单是自己的；公司账户在调度台建（onMyDesk）也是自己的，
    /// 在派给调度建则留在公司订单池（没有调度员）。司导建的占位单没有调度员。
    /// </summary>
    public static Guid? InitialDispatcher(User? user, bool? onMyDesk) => user?.Role switch
    {
        UserRoles.Dispatcher => user.Id,
        UserRoles.Company when onMyDesk == true => user.Id,
        _ => null
    };

    /// <summary>
    /// 调度台上的单：分给自己的单。按界面算，不按角色：公司账户的调度台和调度员的调度台是同一套范围。
    /// 公司账户另外带上没分调度员的两类本公司旧单：自己在调度台上派过司导的；已经放出去抢的
    /// （现在放出去时会直接分给公司账户自己，这条只管以前放出去的）。
    /// </summary>
    public static Expression<Func<Order, bool>> OnDesk(User user)
    {
        var userId = user.Id;
        var companyId = user.Role == UserRoles.Company ? user.CompanyId : null;
        return order =>
            order.AssignedDispatcherUserId == userId ||
            (companyId != null &&
             order.AssignedDispatcherUserId == null &&
             order.CompanyId == companyId &&
             (order.ShareLevel != OrderShareLevels.Own || order.Days.Any(day => day.AssignedByUserId == userId)));
    }

    /// <summary>和 <see cref="OnDesk"/> 同一条规则，用在已经读出来的订单上（要带上行程日）。</summary>
    public static bool IsOnDesk(Order order, User user) =>
        order.AssignedDispatcherUserId == user.Id ||
        (user.Role == UserRoles.Company &&
         user.CompanyId is not null &&
         order.AssignedDispatcherUserId is null &&
         order.CompanyId == user.CompanyId &&
         (order.ShareLevel != OrderShareLevels.Own || order.Days.Any(day => day.AssignedByUserId == user.Id)));

    /// <summary>真实订单：已绑定公司。</summary>
    public static bool IsRealOrder(Order order) => order.CompanyId is not null;

    /// <summary>某位司导的占位单：没绑公司、由这位司导本人建的单。</summary>
    public static Expression<Func<Order, bool>> PlaceholderOf(Guid driverId) => order =>
        order.CompanyId == null &&
        order.CreatedBy != null &&
        order.CreatedBy.DriverId == driverId;

    /// <summary>订单显示名：公司订单号的第一行，否则共用备注的第一行。界面再按需要截断。</summary>
    public static string? Label(string? platformOrderNo, string? sharedNotes) =>
        FirstLine(platformOrderNo) ?? FirstLine(sharedNotes);

    private static string? FirstLine(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var line = value.Trim().Split(['\r', '\n'], 2)[0].Trim();
        return string.IsNullOrEmpty(line) ? null : line;
    }
}
