using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public class DriverCalendarPreviewDto
{
    public bool Preview { get; set; }
    public bool IdentityIsolated { get; set; }
    public Guid? DriverId { get; set; }
    public string? DriverName { get; set; }
    public List<DriverCalendarDayDto> Days { get; set; } = [];
}

public class DriverCalendarDayDto
{
    public DateOnly Date { get; set; }
    public List<DriverCalendarTripDto> Items { get; set; } = [];
}

public class DriverCalendarTripDto
{
    public Guid OrderId { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public Guid ItineraryDayId { get; set; }
    public string? EndLocation { get; set; }
    public string? Description { get; set; }
    public List<DriverCalendarActivityDto> Activities { get; set; } = [];
}

public class DriverCalendarActivityDto
{
    public Guid Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Provider { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }
    public bool HasTicket { get; set; }
    public bool TicketAccessible { get; set; }
}

public class DriverCalendarClaimDto
{
    public string OrderNo { get; set; } = string.Empty;
}

public class DriverCalendarRangeDto
{
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}

public class DriverCalendarMutationDto
{
    public Guid OrderId { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public Guid? DriverId { get; set; }
    public int UpdatedDayCount { get; set; }
    public List<string> Warnings { get; set; } = [];
}
