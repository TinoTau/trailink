namespace Trailink.Api.Models;

public class OrderActivity
{
    public Guid Id { get; set; }
    public Guid ItineraryDayId { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Provider { get; set; }
    public DateTime? BookingTime { get; set; }
    public DateTime? CheckinTime { get; set; }
    public string? TicketPath { get; set; }
    public int SortOrder { get; set; }

    public ItineraryDay ItineraryDay { get; set; } = null!;
}
