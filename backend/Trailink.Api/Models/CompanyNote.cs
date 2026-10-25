namespace Trailink.Api.Models;

public class CompanyNote
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;

    public Company? Company { get; set; }
    public User? User { get; set; }
}
