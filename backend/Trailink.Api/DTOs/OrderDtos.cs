namespace Trailink.Api.DTOs;

public class OrderWriteDto
{
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }
    public string? Notes { get; set; }
    public string? DriverNotes { get; set; }
    public string? SharedNotes { get; set; }
    public Guid? CompanyId { get; set; }
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
