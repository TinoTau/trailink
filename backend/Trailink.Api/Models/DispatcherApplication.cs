namespace Trailink.Api.Models;

public class DispatcherApplication
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid CompanyId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Company Company { get; set; } = null!;
}
