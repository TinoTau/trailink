using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Tests;

public class AuthFlowTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthFlowTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Drivers_require_login()
    {
        var anonymous = _factory.CreateClient();
        var response = await anonymous.GetAsync("/api/drivers");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Driver_can_apply_and_company_can_approve_and_remove()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var companyClient = _factory.CreateClient();
        var companyRegister = await companyClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "公司管理人",
            AccountType = "company",
            CompanyName = $"申请公司{suffix}"
        });
        companyRegister.EnsureSuccessStatusCode();
        var companyUser = await companyRegister.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.Equal("company", companyUser!.Role);
        Assert.NotNull(companyUser.DriverId);

        var driverClient = _factory.CreateClient();
        var driverRegister = await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"drv_{suffix}",
            Password = "Passw0rd!",
            Name = "申请司导",
            AccountType = "driver"
        });
        driverRegister.EnsureSuccessStatusCode();
        var driverUser = await driverRegister.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.Equal("driver", driverUser!.Role);
        Assert.NotNull(driverUser.DriverId);

        var found = await driverClient.GetFromJsonAsync<List<CompanyBriefDto>>($"/api/companies?name=申请公司{suffix}");
        Assert.Contains(found!, item => item.Id == companyUser.CompanyId);

        var applied = await driverClient.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser.CompanyId!.Value
        });
        applied.EnsureSuccessStatusCode();

        var home = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.Single(home!.Desk!.Applications);

        var approved = await companyClient.PostAsJsonAsync($"/api/company/applications/{home.Desk.Applications[0].Id}/approve", new { });
        approved.EnsureSuccessStatusCode();
        var afterApprove = await approved.Content.ReadFromJsonAsync<CompanyHomeDto>();
        Assert.Empty(afterApprove!.Desk!.Applications);
        Assert.Single(afterApprove.Desk.Dispatchers);

        var driverMe = await driverClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal("dispatcher", driverMe!.Role);
        Assert.Equal(companyUser.CompanyId, driverMe.CompanyId);
        Assert.Contains(driverMe.Companies, item => item.Id == companyUser.CompanyId);

        var second = _factory.CreateClient();
        var secondRegister = await second.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm2_{suffix}",
            Password = "Passw0rd!",
            Name = "第二公司",
            AccountType = "company",
            CompanyName = $"第二公司{suffix}"
        });
        secondRegister.EnsureSuccessStatusCode();
        var secondUser = await secondRegister.Content.ReadFromJsonAsync<SessionUserDto>();
        var secondApply = await driverClient.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = secondUser!.CompanyId!.Value
        });
        secondApply.EnsureSuccessStatusCode();
        var secondHome = await second.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var secondApproved = await second.PostAsJsonAsync($"/api/company/applications/{secondHome!.Desk!.Applications[0].Id}/approve", new { });
        secondApproved.EnsureSuccessStatusCode();
        var twoCompanies = await driverClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal(2, twoCompanies!.Companies.Count);

        var removed = await companyClient.DeleteAsync($"/api/company/dispatchers/{driverMe.Id}");
        removed.EnsureSuccessStatusCode();
        var afterRemove = await driverClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal("dispatcher", afterRemove!.Role);
        Assert.Contains(afterRemove.Companies, item => item.Id == secondUser.CompanyId);
        var firstHome = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.DoesNotContain(firstHome!.Desk!.Dispatchers, item => item.UserId == driverMe.Id);
    }

    [Fact]
    public async Task Driver_member_can_apply_to_become_dispatcher()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var companyClient = _factory.CreateClient();
        var companyRegister = await companyClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "公司管理人",
            AccountType = "company",
            CompanyName = $"司导公司{suffix}"
        });
        companyRegister.EnsureSuccessStatusCode();
        var companyUser = await companyRegister.Content.ReadFromJsonAsync<SessionUserDto>();

        var driverClient = _factory.CreateClient();
        var driverRegister = await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"drv_{suffix}",
            Password = "Passw0rd!",
            Name = "在职司导",
            AccountType = "driver"
        });
        driverRegister.EnsureSuccessStatusCode();
        var driverUser = await driverRegister.Content.ReadFromJsonAsync<SessionUserDto>();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = driverUser!.Id,
                CompanyId = companyUser!.CompanyId!.Value,
                Role = UserRoles.Driver
            });
            await db.SaveChangesAsync();
        }

        var applied = await driverClient.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        });
        applied.EnsureSuccessStatusCode();

        var home = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var approved = await companyClient.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications[0].Id}/approve", new { });
        approved.EnsureSuccessStatusCode();
        var after = await approved.Content.ReadFromJsonAsync<CompanyHomeDto>();
        Assert.Contains(after!.Desk!.Dispatchers, item => item.UserId == driverUser!.Id);

        var me = await driverClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal("dispatcher", me!.Role);
    }

    [Fact]
    public async Task Driver_can_apply_to_dispatcher_and_dispatcher_can_approve()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var companyClient = _factory.CreateClient();
        await companyClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "公司管理人",
            AccountType = "company",
            CompanyName = $"司导申请公司{suffix}"
        });
        var companyUser = await (await companyClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();

        var dispatcherClient = _factory.CreateClient();
        await dispatcherClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"disp_{suffix}",
            Password = "Passw0rd!",
            Name = "可搜调度",
            AccountType = "driver"
        });
        var dispatcherUser = await (await dispatcherClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();
        await dispatcherClient.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        });
        var home = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        await companyClient.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications[0].Id}/approve", new { });

        var applicantClient = _factory.CreateClient();
        await applicantClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"guide_{suffix}",
            Password = "Passw0rd!",
            Name = "新司导",
            AccountType = "driver"
        });

        var found = await applicantClient.GetFromJsonAsync<List<DispatcherSearchDto>>($"/api/dispatchers?name=可搜调度");
        Assert.Contains(found!, item => item.Id == dispatcherUser!.Id);

        var applied = await applicantClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser!.Id
        });
        applied.EnsureSuccessStatusCode();
        var pending = await applicantClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Contains(pending!.PendingDriverApplications, item => item.DispatcherUserId == dispatcherUser.Id);

        var incoming = await dispatcherClient.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        Assert.Single(incoming!);
        Assert.Equal("新司导", incoming[0].Name);

        var approved = await dispatcherClient.PostAsJsonAsync($"/api/dispatchers/applications/{incoming[0].Id}/approve", new { });
        approved.EnsureSuccessStatusCode();
        var after = await approved.Content.ReadFromJsonAsync<List<DriverApplicantDto>>();
        Assert.Empty(after!);

        var applicantMe = await applicantClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal("driver", applicantMe!.Role);
        Assert.Contains(applicantMe.Companies, item => item.Id == companyUser.CompanyId);
        Assert.Empty(applicantMe.PendingDriverApplications);

        var again = await applicantClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public async Task Company_desk_lists_only_handled_historical_orders()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var today = DateOnly.FromDateTime(DateTime.Today);
        var companyClient = _factory.CreateClient();
        await companyClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "历史公司",
            AccountType = "company",
            CompanyName = $"历史公司{suffix}"
        });
        var companyUser = await (await companyClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();

        var dispatcherClient = _factory.CreateClient();
        await dispatcherClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"disp_{suffix}",
            Password = "Passw0rd!",
            Name = "历史调度",
            AccountType = "driver"
        });
        var dispatcherUser = await (await dispatcherClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();
        await dispatcherClient.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        });
        var home = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        await companyClient.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications[0].Id}/approve", new { });

        var driverClient = _factory.CreateClient();
        await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"guide_{suffix}",
            Password = "Passw0rd!",
            Name = "历史司导",
            AccountType = "driver"
        });
        var driverUser = await (await driverClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();
        await driverClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser!.Id
        });
        var incoming = await dispatcherClient.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        await dispatcherClient.PostAsJsonAsync($"/api/dispatchers/applications/{incoming![0].Id}/approve", new { });

        async Task<Guid> AddOrderAsync(HttpClient client, DateOnly date, Guid? driverId)
        {
            var created = await client.PostAsJsonAsync("/api/orders", new OrderWriteDto
            {
                StartDate = date,
                CompanyId = companyUser.CompanyId
            });
            created.EnsureSuccessStatusCode();
            var order = await created.Content.ReadFromJsonAsync<OrderReadDto>();
            var day = await client.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = date,
                DriverId = driverId
            });
            day.EnsureSuccessStatusCode();
            return order.Id;
        }

        var assignedPast = await AddOrderAsync(dispatcherClient, today.AddDays(-3), driverUser!.DriverId);
        var companyPast = await AddOrderAsync(companyClient, today.AddDays(-2), driverUser.DriverId);
        var future = await AddOrderAsync(dispatcherClient, today.AddDays(5), driverUser.DriverId);
        var openPast = await AddOrderAsync(dispatcherClient, today.AddDays(-4), null);

        var companyDesk = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var dispatcherDesk = await dispatcherClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var driverDesk = await driverClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");

        Assert.Equal(2, companyDesk!.Desk!.Orders.Count);
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == assignedPast && item.Kind == "company");
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == companyPast);
        Assert.DoesNotContain(companyDesk.Desk.Orders, item => item.Id == future);
        Assert.DoesNotContain(companyDesk.Desk.Orders, item => item.Id == openPast);

        Assert.Single(dispatcherDesk!.Desk!.Orders);
        Assert.Equal(assignedPast, dispatcherDesk.Desk.Orders[0].Id);
        Assert.Equal("assigned", dispatcherDesk.Desk.Orders[0].Kind);

        Assert.Equal(2, driverDesk!.Desk!.Orders.Count);
        Assert.All(driverDesk.Desk.Orders, item => Assert.Equal("driven", item.Kind));
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == assignedPast);
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == companyPast);
    }
}
