namespace Trailink.Api.Models;

public class DriverNote : IViewerNote
{
    public Guid Id { get; set; }
    public Guid DriverId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public bool Hidden { get; set; }

    public Driver? Driver { get; set; }
    public User? User { get; set; }
}
