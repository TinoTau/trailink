namespace Trailink.Api.Models;

public class DispatcherNote : IViewerNote
{
    public Guid Id { get; set; }
    public Guid DispatcherUserId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public bool Hidden { get; set; }

    public User? Dispatcher { get; set; }
    public User? User { get; set; }
}
