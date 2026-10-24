using Trailink.Api.Models;

namespace Trailink.Api.DTOs;

public class RegisterDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string AccountType { get; set; } = "driver";
    public string? CompanyName { get; set; }
}

public class LoginDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class SessionUserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public Guid? DriverId { get; set; }
    public bool HasAvatar { get; set; }
    public List<CompanyBriefDto> Companies { get; set; } = [];
    public List<PendingApplicationDto> PendingApplications { get; set; } = [];
    public List<PendingDriverApplicationDto> PendingDriverApplications { get; set; } = [];
}

public class CompanyBriefDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public static List<CompanyBriefDto> FromMemberships(User user)
    {
        var companies = new List<CompanyBriefDto>();
        if (user.Role == UserRoles.Company && user.Company is not null)
        {
            companies.Add(new CompanyBriefDto { Id = user.Company.Id, Name = user.Company.Name });
        }

        foreach (var member in user.Memberships.OrderBy(item => item.Company.Name))
        {
            if (companies.All(item => item.Id != member.CompanyId))
            {
                companies.Add(new CompanyBriefDto { Id = member.CompanyId, Name = member.Company.Name });
            }
        }

        return companies;
    }
}

public class PendingApplicationDto
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string CompanyName { get; set; } = string.Empty;
}

public class DispatcherSearchDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class ApplyDriverDto
{
    public Guid DispatcherUserId { get; set; }
}

public class PendingDriverApplicationDto
{
    public Guid Id { get; set; }
    public Guid DispatcherUserId { get; set; }
    public string DispatcherName { get; set; } = string.Empty;
}

public class DriverApplicantDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class ApplyDispatcherDto
{
    public Guid CompanyId { get; set; }
}

public class CompanyHomeDto
{
    public List<CompanyBriefDto> Companies { get; set; } = [];
    public CompanyDeskDto? Desk { get; set; }
}

public class CompanyDeskDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public bool HasQr { get; set; }
    public bool CanEdit { get; set; }
    public bool CanManage { get; set; }
    public List<CompanyApplicationDto> Applications { get; set; } = [];
    public List<CompanyMemberDto> Dispatchers { get; set; } = [];
    public List<CompanyOrderDto> Orders { get; set; } = [];
}

public class CompanyOrderDto
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public int DayCount { get; set; }
    public string Kind { get; set; } = "company";
}

public class CompanyContactDto
{
    public Guid CompanyId { get; set; }
    public string? Contact { get; set; }
}

public class CompanyApplicationDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class CompanyMemberDto
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
