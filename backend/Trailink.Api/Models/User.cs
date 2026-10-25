namespace Trailink.Api.Models;

public class User
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public string Role { get; set; } = UserRoles.Driver;
    public Guid? CompanyId { get; set; }
    public Guid? DriverId { get; set; }
    public string? AvatarPath { get; set; }
    public string? AssignedColor { get; set; }

    public Company? Company { get; set; }
    public Driver? Driver { get; set; }
    public ICollection<CompanyMember> Memberships { get; set; } = [];
    public ICollection<DispatcherApplication> Applications { get; set; } = [];
    public ICollection<DriverApplication> DriverApplications { get; set; } = [];
    public ICollection<DriverApplication> IncomingDriverApplications { get; set; } = [];
    public ICollection<DriverNote> DriverNotes { get; set; } = [];
    public ICollection<OrderNote> OrderNotes { get; set; } = [];
    public ICollection<DispatcherNote> WrittenDispatcherNotes { get; set; } = [];
    public ICollection<DispatcherNote> IncomingDispatcherNotes { get; set; } = [];
    public ICollection<CompanyNote> CompanyNotes { get; set; } = [];
}
