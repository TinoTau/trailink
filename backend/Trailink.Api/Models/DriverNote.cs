namespace Trailink.Api.Models;

public class DriverNote
{
    public Guid Id { get; set; }
    public Guid DriverId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;

    public Driver? Driver { get; set; }
    public User? User { get; set; }
}
