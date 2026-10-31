using Microsoft.EntityFrameworkCore;
using Trailink.Api.Models;

namespace Trailink.Api.Data;

/// <summary>订单和行程日读取时要带出的关联数据，只在这里定义一次。</summary>
public static class OrderQueries
{
    /// <summary>订单列表：行程日（司导、派出人、车辆）、截图、建单人、公司、调度员。不带活动。</summary>
    public static IQueryable<Order> WithSummary(this IQueryable<Order> orders) => orders
        .Include(order => order.Days).ThenInclude(day => day.Driver)
        .Include(order => order.Days).ThenInclude(day => day.AssignedBy)
        .Include(order => order.Days).ThenInclude(day => day.Vehicle)
        .Include(order => order.Files)
        .Include(order => order.CreatedBy)
        .Include(order => order.Company)
        .Include(order => order.AssignedDispatcher);

    /// <summary>订单详情：在列表的基础上再带出每天的活动。</summary>
    public static IQueryable<Order> WithDetails(this IQueryable<Order> orders) => orders
        .WithSummary()
        .Include(order => order.Days).ThenInclude(day => day.Activities);

    /// <summary>单个行程日：所属订单的建单人、司导、派出人、车辆、活动。</summary>
    public static IQueryable<ItineraryDay> WithDetails(this IQueryable<ItineraryDay> days) => days
        .Include(day => day.Order).ThenInclude(order => order.CreatedBy)
        .Include(day => day.Driver)
        .Include(day => day.AssignedBy)
        .Include(day => day.Vehicle)
        .Include(day => day.Activities);
}
