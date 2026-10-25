namespace Trailink.Api.Models;

public class DispatcherNote
{
    public Guid Id { get; set; }
    public Guid DispatcherUserId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;

    public User? Dispatcher { get; set; }
    public User? User { get; set; }
}
