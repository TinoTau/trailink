namespace Trailink.Api.DTOs;

public class OrderWriteDto
{
    public string? PlatformOrderNo { get; set; }
    public string? SourceCompany { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }
    public string? Notes { get; set; }
}

public class OrderReadDto
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string? PlatformOrderNo { get; set; }
    public string? SourceCompany { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public int DayCount { get; set; }
    public int GuestCount { get; set; }
    public string? Notes { get; set; }
    public List<ItineraryDayReadDto> Days { get; set; } = [];
}

public class AssignDriverDto
{
    public Guid? DriverId { get; set; }
}

public class AssignmentResultDto
{
    public Guid OrderId { get; set; }
    public Guid? DriverId { get; set; }
    public int UpdatedDayCount { get; set; }
    public List<string> Warnings { get; set; } = [];
}
