namespace Trailink.Api.Models;

public class DriverApplication
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DispatcherUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public User Dispatcher { get; set; } = null!;
}
