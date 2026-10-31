namespace Trailink.Api.Models;

public class Vehicle
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public string Plate { get; set; } = string.Empty;
    public string? SharedNotes { get; set; }
    public string? Info { get; set; }
    public bool Available { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public ICollection<VehiclePhoto> Photos { get; set; } = [];
    public ICollection<ItineraryDay> ItineraryDays { get; set; } = [];
}
