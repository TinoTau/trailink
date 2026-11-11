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

public class AssignedColorWriteDto
{
    public string AssignedColor { get; set; } = string.Empty;
}

public class ProfileNameWriteDto
{
    public string Name { get; set; } = string.Empty;
}

public class ProfileUsernameWriteDto
{
    public string Username { get; set; } = string.Empty;
}

public class ProfilePasswordWriteDto
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class ProfileContactWriteDto
{
    public string? Contact { get; set; }
}

public class SessionUserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public string Role { get; set; } = string.Empty;
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public Guid? DriverId { get; set; }
    public bool HasAvatar { get; set; }
    public string AssignedColor { get; set; } = AssignedColors.Default;
    public List<CompanyBriefDto> Companies { get; set; } = [];
    public List<PendingApplicationDto> PendingApplications { get; set; } = [];
    public List<PendingDriverApplicationDto> PendingDriverApplications { get; set; } = [];
}

public class CompanyBriefDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Notes { get; set; }

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
    public string? Contact { get; set; }
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
    public string? Notes { get; set; }
    public bool HasQr { get; set; }
    public bool CanEdit { get; set; }
    public bool CanManage { get; set; }
    public List<CompanyApplicationDto> Applications { get; set; } = [];
    public List<CompanyMemberDto> Dispatchers { get; set; } = [];
}

/// <summary>公司信息页「订单记录」的一行：调度员看分配给自己的单，公司账户看本公司全部，司导看自己跑的。</summary>
public class CompanyOrderRecordDto
{
    public Guid Id { get; set; }

    /// <summary>订单显示名，规则同 <see cref="OrderReadDto.Label"/>。</summary>
    public string? Label { get; set; }

    public int GuestCount { get; set; }
    public string? VehicleType { get; set; }

    /// <summary>south / north / both；没填为 null（界面按南岛显示）。</summary>
    public string? Island { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int DayCount { get; set; }

    /// <summary>行程路线：共用备注。界面只显示前 10 个字。</summary>
    public string? Route { get; set; }

    /// <summary>派到的司导，按日期先后、不重复。</summary>
    public List<string> Drivers { get; set; } = [];

    /// <summary>和 <see cref="Drivers"/> 一一对应的司导 id（订单记录点司导跳到调度台用）。</summary>
    public List<Guid> DriverIds { get; set; } = [];

    /// <summary>配到的车牌，按日期先后、不重复。</summary>
    public List<string> Plates { get; set; } = [];

    /// <summary>和 <see cref="Plates"/> 一一对应的车辆 id。</summary>
    public List<Guid> VehicleIds { get; set; } = [];

    /// <summary>这张单在自己的调度台上（公司账户、调度员）：点司导、车牌可以跳到调度台。</summary>
    public bool OnDesk { get; set; }

    /// <summary>还没派司导的天数。</summary>
    public int UnassignedDays { get; set; }

    /// <summary>还没配车的天数。</summary>
    public int NoVehicleDays { get; set; }

    public int ShareLevel { get; set; }

    /// <summary>能改订单信息（调度员、公司账户）。</summary>
    public bool CanEdit { get; set; }

    /// <summary>能改抢单状态，规则同 <see cref="OrderReadDto.CanSetShareLevel"/>。</summary>
    public bool CanSetShareLevel { get; set; }

    /// <summary>能退回公司：单子在自己调度台上且已绑公司（同调度台上的删除）。</summary>
    public bool CanReturn { get; set; }
}

public class CompanyContactDto
{
    public Guid CompanyId { get; set; }
    public string? Name { get; set; }
    public string? Contact { get; set; }
}

public class CompanyApplicationDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Contact { get; set; }
}

public class CompanyMemberDto
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Contact { get; set; }
    public string? Notes { get; set; }
    public bool Hidden { get; set; }
    public bool HasAvatar { get; set; }
}

public class DispatcherNoteWriteDto
{
    public string? Notes { get; set; }
}

public class CompanyNoteWriteDto
{
    public Guid CompanyId { get; set; }
    public string? Notes { get; set; }
}
