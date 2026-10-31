using System.Linq.Expressions;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

/// <summary>
/// 订单相关业务规则的唯一定义。后端各处和返回给前端的判断结果都从这里来。
/// </summary>
public static class OrderRules
{
    /// <summary>派出人：当前把这一天派给司导的人；旧数据没有记录时回退建单人。</summary>
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
