namespace Trailink.Api.Models;

public class ItineraryDay
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public DateOnly ServiceDate { get; set; }
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public Guid? DriverId { get; set; }

    public Order Order { get; set; } = null!;
    public Driver? Driver { get; set; }
    public ICollection<OrderActivity> Activities { get; set; } = [];
}
