namespace Trailink.Api.DTOs;

public class OrderWriteDto
{
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }

    /// <summary>车型，自由填写，最多 50 字。</summary>
    public string? VehicleType { get; set; }

    /// <summary>south / north / both，空为没填。</summary>
    public string? Island { get; set; }

    public string? Notes { get; set; }
    public string? DriverNotes { get; set; }
    public string? SharedNotes { get; set; }
    public Guid? CompanyId { get; set; }

    /// <summary>只在新建时用：公司账户在调度台建单传 true，单子放在自己的调度台上；在派给调度建单不传，留在公司订单池。</summary>
    public bool? OnMyDesk { get; set; }
}

public class OrderReadDto
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string? PlatformOrderNo { get; set; }

    /// <summary>订单显示名：公司订单号第一行，否则共用备注第一行。</summary>
    public string? Label { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public int DayCount { get; set; }
    public int GuestCount { get; set; }
    public string? VehicleType { get; set; }
    public string? Island { get; set; }
    public string? Notes { get; set; }
    public string? DriverNotes { get; set; }
    public string? SharedNotes { get; set; }
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public string? CompanyNote { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public string? CreatedByName { get; set; }
    public Guid? AssignedDispatcherUserId { get; set; }
    public string? AssignedDispatcherName { get; set; }
    public string? AssignedDispatcherContact { get; set; }
    public int AssignedDayCount { get; set; }

    /// <summary>拆单：多位司导、多个派出人，或派了一部分。</summary>
    public bool IsSplit { get; set; }

    /// <summary>结束日期早于今天（新西兰日期）。</summary>
    public bool IsFinished { get; set; }

    public bool IsInProgress { get; set; }

    /// <summary>历史单：已派完且已结束。</summary>
    public bool IsHistorical { get; set; }

    /// <summary>有某一天的司导同一天还有别的订单。</summary>
    public bool HasDriverConflict { get; set; }

    /// <summary>抢单范围：0 调度自留，1 公司内部，2 面向所有人。</summary>
    public int ShareLevel { get; set; }

    /// <summary>当前用户能改抢单范围：这张单的调度员，或所属公司的公司账户。</summary>
    public bool CanSetShareLevel { get; set; }

    /// <summary>当前用户能重新选择起止日期（PUT /api/orders/{id}/dates）。</summary>
    public bool CanReschedule { get; set; }

    public List<ItineraryDayReadDto> Days { get; set; } = [];
    public List<OrderFileReadDto> Files { get; set; } = [];
}

public class OrderFileReadDto
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public string FileName { get; set; } = string.Empty;
}

public class AssignDriverDto
{
    public Guid? DriverId { get; set; }
    public bool FailOnConflict { get; set; }
}

public class ShareLevelWriteDto
{
    public int ShareLevel { get; set; }
}

public class AssignDispatcherDto
{
    public Guid? DispatcherUserId { get; set; }
}

public class AssignmentResultDto
{
    public Guid OrderId { get; set; }
    public Guid? DriverId { get; set; }
    public int UpdatedDayCount { get; set; }
    public List<string> Warnings { get; set; } = [];
}

/// <summary>改订单日期：新的起止日期，以及原来每一天平移多少天（拖整段时不为 0，拖开头或末尾时为 0）。</summary>
public class OrderDatesWriteDto
{
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int ShiftDays { get; set; }
}

public class OrderDatesResultDto
{
    public OrderReadDto Order { get; set; } = null!;

    /// <summary>落到新范围外、被删掉的天数。</summary>
    public int RemovedDayCount { get; set; }

    /// <summary>搬到新日期后和司导、车辆别的订单冲突、已改回未派或去掉车辆的日期。</summary>
    public List<string> Warnings { get; set; } = [];
}
