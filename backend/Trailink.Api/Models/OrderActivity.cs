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

    /// <summary>从活动库选的活动；手动填写的为 null。活动名是添加时的快照。</summary>
    public Guid? LibraryActivityId { get; set; }

    public ItineraryDay ItineraryDay { get; set; } = null!;
    public LibraryActivity? LibraryActivity { get; set; }
}
