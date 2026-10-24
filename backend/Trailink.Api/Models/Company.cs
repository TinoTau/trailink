namespace Trailink.Api.Models;

public class Company
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public string? QrPath { get; set; }

    public ICollection<User> Users { get; set; } = [];
    public ICollection<CompanyMember> Members { get; set; } = [];
    public ICollection<DispatcherApplication> Applications { get; set; } = [];
}
