namespace Trailink.Api.DTOs;

public class OrderWriteDto
{
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }
    public string? Notes { get; set; }
    public string? DriverNotes { get; set; }
    public Guid? CompanyId { get; set; }
}

public class OrderReadDto
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public int DayCount { get; set; }
    public int GuestCount { get; set; }
    public string? Notes { get; set; }
    public string? DriverNotes { get; set; }
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public string? CompanyNote { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public string? CreatedByName { get; set; }
    public Guid? AssignedDispatcherUserId { get; set; }
    public string? AssignedDispatcherName { get; set; }
    public string? AssignedDispatcherContact { get; set; }
    public int AssignedDayCount { get; set; }
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
