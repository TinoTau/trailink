using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Services;

/// <summary>
/// 把订单变成接口响应的唯一入口：映射字段、算出业务判断结果、带上当前用户自己的备注，
/// 并按身份隐藏不该看到的内容。列表、详情、行程日接口都走这里。
/// </summary>
public class OrderPresenter(TrailinkDbContext db, OrderScheduling scheduling, WeatherForecasts weather)
{
    /// <param name="outsideDeskDriverTrips">
    /// 调度台点开司导时，这位司导在别人订单上的日期只保留日期本身。
    /// </param>
    public async Task<List<OrderReadDto>> PresentAsync(
        IReadOnlyList<Order> orders,
        User? user,
        CancellationToken cancellationToken,
        bool outsideDeskDriverTrips = false)
    {
        var today = BusinessDate.Today;
        var historical = OrderRules.Historical(today).Compile();
        var overlaps = await scheduling.FindOverlapsAsync(orders.SelectMany(order => order.Days), cancellationToken);
        var weatherByDay = await WeatherByDayAsync(orders.SelectMany(order => order.Days), cancellationToken);
        var notes = await ViewerNotes.OrderNotesAsync(db, user, orders.Select(order => order.Id).ToList(), cancellationToken);
        var visible = outsideDeskDriverTrips ? orders.Where(order => InDeskScope(user, order)).ToList() : orders;
        var companyNotes = await CompanyNotesAsync(user, visible, cancellationToken);

        return orders.Select(order =>
        {
            var dto = Map(order, today, historical(order), overlaps, weatherByDay);
            dto.Notes = notes.GetValueOrDefault(order.Id);
            if (outsideDeskDriverTrips && !InDeskScope(user, order))
            {
                HideOutsideDesk(dto);
            }
            else if (dto.CompanyId is Guid companyId && companyNotes.TryGetValue(companyId, out var note))
            {
                dto.CompanyNote = note;
            }

            return dto;
        }).ToList();
    }

    public async Task<OrderReadDto> PresentAsync(Order order, User? user, CancellationToken cancellationToken) =>
        (await PresentAsync([order], user, cancellationToken))[0];

    /// <param name="day">需要带出 <c>Order.CreatedBy</c>，用来回退派出人。</param>
    public async Task<ItineraryDayReadDto> PresentDayAsync(ItineraryDay day, CancellationToken cancellationToken)
    {
        var overlaps = await scheduling.FindOverlapsAsync([day], cancellationToken);
        var weatherByDay = await WeatherByDayAsync([day], cancellationToken);
        return ToRead(day.Order, day, overlaps, weatherByDay);
    }

    public static OrderActivityReadDto ToRead(OrderActivity activity) => new()
    {
        Id = activity.Id,
        ItineraryDayId = activity.ItineraryDayId,
        Content = activity.Content,
        Provider = activity.Provider,
        BookingTime = activity.BookingTime,
        CheckinTime = activity.CheckinTime,
        TicketPath = activity.TicketPath,
        SortOrder = activity.SortOrder,
        LibraryActivityId = activity.LibraryActivityId
    };

    public static OrderFileReadDto ToRead(OrderFile file) => new()
    {
        Id = file.Id,
        OrderId = file.OrderId,
        FileName = file.FileName
    };

    private static OrderReadDto Map(
        Order order,
        DateOnly today,
        bool historical,
        ScheduleOverlaps overlaps,
        IReadOnlyDictionary<Guid, string> weatherByDay)
    {
        var days = order.Days.OrderBy(day => day.ServiceDate).Select(day => ToRead(order, day, overlaps, weatherByDay)).ToList();
        return new OrderReadDto
        {
            Id = order.Id,
            OrderNo = order.OrderNo,
            PlatformOrderNo = order.PlatformOrderNo,
            Label = OrderRules.Label(order.PlatformOrderNo, order.SharedNotes),
            StartDate = order.StartDate,
            EndDate = OrderRules.EndDate(order.Days),
            DayCount = order.Days.Count,
            AssignedDayCount = order.Days.Count(day => day.DriverId is not null),
            GuestCount = order.GuestCount,
            DriverNotes = order.DriverNotes,
            SharedNotes = order.SharedNotes,
            CompanyId = order.CompanyId,
            CompanyName = order.Company?.Name,
            CreatedByUserId = order.CreatedByUserId,
            CreatedByName = order.CreatedBy?.Name,
            AssignedDispatcherUserId = order.AssignedDispatcherUserId,
            AssignedDispatcherName = order.AssignedDispatcher?.Name,
            AssignedDispatcherContact = order.AssignedDispatcher?.Contact,
            IsSplit = OrderRules.IsSplit(order),
            IsFinished = OrderRules.IsFinished(order, today),
            IsInProgress = OrderRules.IsInProgress(order, today),
            IsHistorical = historical,
            HasDriverConflict = days.Any(day => day.HasDriverConflict),
            Days = days,
            Files = order.Files.OrderBy(file => file.FileName).Select(ToRead).ToList()
        };
    }

    /// <summary>
    /// 派出人字段已经按 <see cref="OrderRules.AssignerId"/> 回退到建单人，前端直接用；没派司导的日期没有派出人。
    /// </summary>
    private static ItineraryDayReadDto ToRead(
        Order order,
        ItineraryDay day,
        ScheduleOverlaps overlaps,
        IReadOnlyDictionary<Guid, string> weatherByDay)
    {
        var assigner = day.DriverId is null ? null : day.AssignedByUserId is null ? order.CreatedBy : day.AssignedBy;
        return new ItineraryDayReadDto
        {
            Id = day.Id,
            OrderId = day.OrderId,
            ServiceDate = day.ServiceDate,
            Description = day.Description,
            EndLocation = day.EndLocation,
            DriverId = day.DriverId,
            DriverName = day.Driver?.Name,
            AssignedByUserId = day.DriverId is null ? null : OrderRules.AssignerId(order, day),
            AssignedByName = assigner?.Name,
            AssignedByContact = assigner?.Contact,
            VehicleId = day.VehicleId,
            VehiclePlate = day.Vehicle?.Plate,
            VehicleInfo = day.Vehicle?.Info,
            VehicleSharedNotes = day.Vehicle?.SharedNotes,
            HasDriverConflict = overlaps.DriverOverlaps(day),
            HasVehicleConflict = overlaps.VehicleOverlaps(day),
            Weather = weatherByDay.GetValueOrDefault(day.Id),
            Activities = day.Activities
                .OrderBy(activity => activity.SortOrder)
                .ThenBy(activity => activity.Id)
                .Select(ToRead)
                .ToList()
        };
    }

    /// <summary>
    /// 每个行程日要显示的天气。地点按 <see cref="WeatherRules"/> 选：住宿地，或当天的库克山飞机、峡湾项目。
    /// 活动内容统一用一次查询取，列表接口不必带出整套活动。
    /// </summary>
    private async Task<Dictionary<Guid, string>> WeatherByDayAsync(IEnumerable<ItineraryDay> source, CancellationToken cancellationToken)
    {
        var days = source.Where(day => WeatherRules.StayPoint(day.EndLocation) is not null).ToList();
        if (days.Count == 0)
        {
            return [];
        }

        var dayIds = days.Select(day => day.Id).ToList();
        var activities = (await db.OrderActivities
                .Where(activity => dayIds.Contains(activity.ItineraryDayId))
                .Select(activity => new { activity.ItineraryDayId, activity.Content })
                .ToListAsync(cancellationToken))
            .ToLookup(activity => activity.ItineraryDayId, activity => activity.Content);
        var result = new Dictionary<Guid, string>();
        foreach (var day in days)
        {
            var point = WeatherRules.PointFor(day.EndLocation, activities[day.Id]);
            if (weather.For(point, day.ServiceDate) is string text)
            {
                result[day.Id] = text;
            }
        }

        return result;
    }

    private Task<Dictionary<Guid, string>> CompanyNotesAsync(
        User? user,
        IEnumerable<Order> orders,
        CancellationToken cancellationToken)
    {
        if (user is null)
        {
            return Task.FromResult(new Dictionary<Guid, string>());
        }

        var companies = orders
            .Where(order => order.CompanyId is not null && order.Company is not null)
            .Select(order => (order.CompanyId!.Value, order.Company!.Name));
        return CompanyNotes.EnsureAsync(db, user.Id, companies, cancellationToken);
    }

    private static bool InDeskScope(User? user, Order order) => user?.Role switch
    {
        UserRoles.Company => order.CompanyId == user.CompanyId,
        UserRoles.Dispatcher => order.AssignedDispatcherUserId == user.Id,
        _ => false
    };

    /// <summary>别人的订单只留下日期和住宿地点的第一个字，用来表示这天已有行程。</summary>
    private static void HideOutsideDesk(OrderReadDto dto)
    {
        dto.PlatformOrderNo = null;
        dto.Label = null;
        dto.CompanyName = null;
        dto.CompanyNote = null;
        dto.CreatedByName = null;
        dto.AssignedDispatcherName = null;
        dto.AssignedDispatcherContact = null;
        dto.Notes = null;
        dto.DriverNotes = null;
        dto.SharedNotes = null;
        dto.GuestCount = 0;
        dto.Files = [];
        foreach (var day in dto.Days)
        {
            day.Description = null;
            day.EndLocation = TextValue.FirstTextElement(day.EndLocation);
            day.AssignedByName = null;
            day.AssignedByContact = null;
            day.Weather = null;
            day.Activities = [];
        }
    }
}
