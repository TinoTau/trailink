namespace Trailink.Api.Models;

public class Order
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }
    public string? DriverNotes { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public Guid? AssignedDispatcherUserId { get; set; }

    public Company? Company { get; set; }
    public User? CreatedBy { get; set; }
    public User? AssignedDispatcher { get; set; }
    public ICollection<ItineraryDay> Days { get; set; } = [];
    public ICollection<OrderFile> Files { get; set; } = [];
    public ICollection<OrderNote> ViewerNotes { get; set; } = [];

    public static string NewOrderNo()
    {
        return $"TL-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
    }
}
