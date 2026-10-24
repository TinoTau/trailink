namespace Trailink.Api.Models;

public class CompanyMember
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid CompanyId { get; set; }
    public string Role { get; set; } = UserRoles.Dispatcher;

    public User User { get; set; } = null!;
    public Company Company { get; set; } = null!;
}
