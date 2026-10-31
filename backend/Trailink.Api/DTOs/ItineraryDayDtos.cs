using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public class ItineraryDayWriteDto
{
    public DateOnly ServiceDate { get; set; }
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public Guid? DriverId { get; set; }
    public bool FailOnConflict { get; set; }
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
    public Guid? AssignedByUserId { get; set; }
    public string? AssignedByName { get; set; }
    public Guid? VehicleId { get; set; }
    public string? VehiclePlate { get; set; }
    public string? VehicleInfo { get; set; }
    public string? VehicleSharedNotes { get; set; }
    public string? AssignedByContact { get; set; }

    /// <summary>这位司导这一天还有别的订单。</summary>
    public bool HasDriverConflict { get; set; }

    /// <summary>这辆车这一天还有别的订单。</summary>
    public bool HasVehicleConflict { get; set; }

    /// <summary>住宿位置是常用地点、且在预报范围内时，这一天的天气短词，例如「晴」「多云」「降雨50%」。</summary>
    public string? Weather { get; set; }

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
