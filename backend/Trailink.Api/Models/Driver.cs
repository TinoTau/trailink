namespace Trailink.Api.Models;

public class Driver
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }

    public ICollection<ItineraryDay> ItineraryDays { get; set; } = [];
    public ICollection<DriverNote> ViewerNotes { get; set; } = [];
}
