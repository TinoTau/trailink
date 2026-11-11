using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

/// <summary>
/// 抢单列表里的一张单。只带行程信息、公司名和调度员姓名；公司订单号、各人备注、共用备注、联系方式、附件都不带，接到后在我的行程里看。
/// </summary>
public class GrabOrderDto
{
    public Guid OrderId { get; set; }

    /// <summary>0 调度自留，1 公司内部，2 面向所有人。</summary>
    public int ShareLevel { get; set; }

    public string? CompanyName { get; set; }
    public string DispatcherName { get; set; } = string.Empty;
    public int GuestCount { get; set; }

    /// <summary>整张订单的天数；拆单时大于待接天数。</summary>
    public int TotalDayCount { get; set; }

    /// <summary>这次要一起接下的日期（订单里还没派的全部日期），按日期排序。</summary>
    public List<GrabDayDto> Days { get; set; } = [];

    /// <summary>自己这些日期已经有行程，不能接；先在我的行程里处理掉再来。</summary>
    public List<GrabConflictDto> Conflicts { get; set; } = [];

    /// <summary>自己已经抢了这张单，正在等调度员确认。</summary>
    public bool ClaimedByMe { get; set; }
}

public class GrabDayDto
{
    public Guid Id { get; set; }
    public DateOnly ServiceDate { get; set; }
    public string? EndLocation { get; set; }
    public string? Description { get; set; }
    public List<GrabActivityDto> Activities { get; set; } = [];
}

public class GrabActivityDto
{
    public string Content { get; set; } = string.Empty;

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }
}

public class GrabConflictDto
{
    public Guid OrderId { get; set; }
    public DateOnly ServiceDate { get; set; }

    /// <summary>自己那张单的显示名（公司订单号或共用备注），没有时为空。</summary>
    public string? OrderLabel { get; set; }
}

public class GrabWriteDto
{
    /// <summary>列表里看到的待接日期。和当前未派的日期不一致时（被别人接走、调度员改过）返回 409。</summary>
    public List<Guid> DayIds { get; set; } = [];
}

public class GrabResultDto
{
    public Guid OrderId { get; set; }
    public List<DateOnly> Dates { get; set; } = [];
}

/// <summary>调度台：自己（调度员或所属公司）订单上待确认的抢单，每位抢单司导一条。</summary>
public class OrderClaimDto
{
    public Guid OrderId { get; set; }
    public Guid DriverId { get; set; }
    public string DriverName { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public bool HasAvatar { get; set; }

    /// <summary>这位司导已经在调度员自己的司导名单里。</summary>
    public bool InRoster { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public class ConfirmClaimDto
{
    public Guid DriverId { get; set; }
}
