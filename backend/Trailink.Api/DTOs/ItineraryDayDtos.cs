using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public class ItineraryDayWriteDto
{
    public DateOnly ServiceDate { get; set; }
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public Guid? DriverId { get; set; }
}

public class ItineraryDayReadDto
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public DateOnly ServiceDate { get; set; }
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public Guid? DriverId { get; set; }
    public string? DriverName { get; set; }
    public int ActivityCount { get; set; }
    public List<OrderActivityReadDto> Activities { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}

public class OrderActivityWriteDto
{
    public string Content { get; set; } = string.Empty;
    public string? Provider { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }

    public string? TicketPath { get; set; }
}

public class OrderActivityReorderDto
{
    public List<Guid> ActivityIds { get; set; } = [];
}

public class OrderActivityReadDto
{
    public Guid Id { get; set; }
    public Guid ItineraryDayId { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Provider { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }

    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }

    public string? TicketPath { get; set; }
    public int SortOrder { get; set; }
}
