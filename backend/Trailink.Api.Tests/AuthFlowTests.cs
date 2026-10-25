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
    public async Task Login_logout_and_company_contact_work()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var username = $"session_{suffix}";
        var client = _factory.CreateClient();
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = username,
            Password = "Passw0rd!",
            Name = "会话公司",
            AccountType = "company",
            CompanyName = $"会话公司{suffix}"
        });
        registered.EnsureSuccessStatusCode();
        var session = await registered.Content.ReadFromJsonAsync<SessionUserDto>();

        var contact = await client.PutAsJsonAsync("/api/company", new CompanyContactDto
        {
            CompanyId = session!.CompanyId!.Value,
            Contact = "  021-123456  "
        });
        contact.EnsureSuccessStatusCode();
        var home = await contact.Content.ReadFromJsonAsync<CompanyHomeDto>();
        Assert.Equal("021-123456", home!.Desk!.Contact);
        Assert.Equal($"会话公司{suffix}", home.Desk.Name);

        var renamed = await client.PutAsJsonAsync("/api/company", new CompanyContactDto
        {
            CompanyId = session.CompanyId.Value,
            Name = $"  新公司{suffix}  "
        });
        renamed.EnsureSuccessStatusCode();
        var renamedHome = await renamed.Content.ReadFromJsonAsync<CompanyHomeDto>();
        Assert.Equal($"新公司{suffix}", renamedHome!.Desk!.Name);
        Assert.Equal("021-123456", renamedHome.Desk.Contact);

        var blank = await client.PutAsJsonAsync("/api/company", new CompanyContactDto
        {
            CompanyId = session.CompanyId.Value,
            Name = " "
        });
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);

        var other = _factory.CreateClient();
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"other_{suffix}",
            Password = "Passw0rd!",
            Name = "另一家",
            AccountType = "company",
            CompanyName = $"占用公司{suffix}"
        })).EnsureSuccessStatusCode();
        var duplicate = await client.PutAsJsonAsync("/api/company", new CompanyContactDto
        {
            CompanyId = session.CompanyId.Value,
            Name = $"占用公司{suffix}"
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"viewer_{suffix}",
            Password = "Passw0rd!",
            Name = "旁观司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var denied = await driver.PutAsJsonAsync("/api/company", new CompanyContactDto
        {
            CompanyId = session.CompanyId.Value,
            Name = "不能改"
        });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var logout = await client.PostAsJsonAsync("/api/auth/logout", new { });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);

        var rejected = await client.PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = username,
            Password = "wrong-password"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = username,
            Password = "Passw0rd!"
        });
        login.EnsureSuccessStatusCode();
        var signedIn = await login.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.Equal(session.Id, signedIn!.Id);
        var kept = await client.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.Equal("021-123456", kept!.Desk!.Contact);
        Assert.Equal($"新公司{suffix}", kept.Desk.Name);
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
        Assert.Contains(afterApprove.Desk.Dispatchers, item => item.UserId == companyUser.Id);
        Assert.Contains(afterApprove.Desk.Dispatchers, item => item.UserId == driverUser.Id);

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
        Assert.Equal("新司导", incoming![0].Name);

        var approved = await dispatcherClient.PostAsJsonAsync($"/api/dispatchers/applications/{incoming![0].Id}/approve", new { });
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

        Assert.Equal(HttpStatusCode.Forbidden, (await companyClient.DeleteAsync($"/api/dispatchers/drivers/{applicantMe.DriverId}")).StatusCode);
        (await dispatcherClient.DeleteAsync($"/api/dispatchers/drivers/{applicantMe.DriverId}")).EnsureSuccessStatusCode();
        var roster = await dispatcherClient.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(roster!, item => item.Id == applicantMe.DriverId);
        var companyRoster = await companyClient.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(companyRoster!, item => item.Id == applicantMe.DriverId);
        var reapply = await applicantClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser.Id
        });
        reapply.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Dispatcher_unbind_reclaims_unfinished_days_only()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var today = DateOnly.FromDateTime(DateTime.Today);
        var companyClient = _factory.CreateClient();
        await companyClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "回收公司",
            AccountType = "company",
            CompanyName = $"回收公司{suffix}"
        });
        var companyUser = await (await companyClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();

        var dispatcherClient = _factory.CreateClient();
        await dispatcherClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"disp_{suffix}",
            Password = "Passw0rd!",
            Name = "回收调度",
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
            Name = "回收司导",
            AccountType = "driver"
        });
        var driverUser = await (await driverClient.GetAsync("/api/auth/me")).Content.ReadFromJsonAsync<SessionUserDto>();
        await driverClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser!.Id
        });
        var incoming = await dispatcherClient.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        await dispatcherClient.PostAsJsonAsync($"/api/dispatchers/applications/{incoming![0].Id}/approve", new { });

        async Task<OrderReadDto> AddOrderAsync(HttpClient client, params (DateOnly Date, Guid? DriverId)[] days)
        {
            var created = await client.PostAsJsonAsync("/api/orders", new OrderWriteDto
            {
                StartDate = days[0].Date,
                CompanyId = client == driverClient ? null : companyUser.CompanyId
            });
            created.EnsureSuccessStatusCode();
            var order = await created.Content.ReadFromJsonAsync<OrderReadDto>();
            foreach (var day in days)
            {
                var added = await client.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
                {
                    ServiceDate = day.Date,
                    DriverId = day.DriverId
                });
                added.EnsureSuccessStatusCode();
            }

            return (await client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order!.Id}"))!;
        }

        var open = await AddOrderAsync(
            dispatcherClient,
            (today.AddDays(2), driverUser!.DriverId),
            (today.AddDays(3), dispatcherUser!.DriverId));
        var finished = await AddOrderAsync(dispatcherClient, (today.AddDays(-5), driverUser.DriverId));
        var ownTrip = await AddOrderAsync(driverClient, (today.AddDays(4), driverUser.DriverId));

        (await dispatcherClient.DeleteAsync($"/api/dispatchers/drivers/{driverUser.DriverId}")).EnsureSuccessStatusCode();

        var openAfter = await dispatcherClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{open.Id}");
        Assert.Null(openAfter!.Days.Single(day => day.ServiceDate == today.AddDays(2)).DriverId);
        Assert.Equal(dispatcherUser.DriverId, openAfter.Days.Single(day => day.ServiceDate == today.AddDays(3)).DriverId);
        var finishedAfter = await dispatcherClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{finished.Id}");
        Assert.Equal(driverUser.DriverId, finishedAfter!.Days.Single().DriverId);
        var ownAfter = await driverClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{ownTrip.Id}");
        Assert.Equal(driverUser.DriverId, ownAfter!.Days.Single().DriverId);

        var roster = await dispatcherClient.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(roster!, item => item.Id == driverUser.DriverId);
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
        var drovePast = await AddOrderAsync(companyClient, today.AddDays(-6), dispatcherUser.DriverId);
        var future = await AddOrderAsync(dispatcherClient, today.AddDays(5), driverUser.DriverId);
        var openPast = await AddOrderAsync(dispatcherClient, today.AddDays(-4), null);
        var handedOff = await AddOrderAsync(dispatcherClient, today.AddDays(-5), null);
        var handedOrder = await dispatcherClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{handedOff}");
        var handedDay = handedOrder!.Days[0];
        (await companyClient.PutAsJsonAsync($"/api/orders/{handedOff}/days/{handedDay.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = handedDay.ServiceDate,
            DriverId = driverUser.DriverId
        })).EnsureSuccessStatusCode();

        var companyDesk = await companyClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var dispatcherDesk = await dispatcherClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var driverDesk = await driverClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");

        Assert.True(companyDesk!.Desk!.CanManage);
        Assert.Contains(companyDesk.Desk.Dispatchers, item => item.UserId == dispatcherUser!.Id);
        Assert.False(dispatcherDesk!.Desk!.CanManage);
        Assert.Empty(dispatcherDesk.Desk.Dispatchers);
        Assert.Empty(dispatcherDesk.Desk.Applications);
        Assert.False(driverDesk!.Desk!.CanManage);
        Assert.Empty(driverDesk.Desk.Dispatchers);

        Assert.Equal(4, companyDesk.Desk.Orders.Count);
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == assignedPast && item.Kind == "company");
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == companyPast);
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == drovePast);
        Assert.Contains(companyDesk.Desk.Orders, item => item.Id == handedOff);
        Assert.DoesNotContain(companyDesk.Desk.Orders, item => item.Id == future);
        Assert.DoesNotContain(companyDesk.Desk.Orders, item => item.Id == openPast);

        Assert.Equal(3, dispatcherDesk!.Desk!.Orders.Count);
        Assert.Contains(dispatcherDesk.Desk.Orders, item => item.Id == assignedPast && item.Kind == "assigned");
        Assert.Contains(dispatcherDesk.Desk.Orders, item => item.Id == drovePast && item.Kind == "driven");
        Assert.Contains(dispatcherDesk.Desk.Orders, item => item.Id == future && item.Kind == "assigned");
        Assert.DoesNotContain(dispatcherDesk.Desk.Orders, item => item.Id == companyPast);
        Assert.DoesNotContain(dispatcherDesk.Desk.Orders, item => item.Id == handedOff);
        Assert.DoesNotContain(dispatcherDesk.Desk.Orders, item => item.Id == openPast);

        Assert.Equal(4, driverDesk!.Desk!.Orders.Count);
        Assert.All(driverDesk.Desk.Orders, item => Assert.Equal("driven", item.Kind));
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == assignedPast);
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == companyPast);
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == handedOff);
        Assert.Contains(driverDesk.Desk.Orders, item => item.Id == future);
        Assert.DoesNotContain(driverDesk.Desk.Orders, item => item.Id == drovePast);

        var driverOrders = await driverClient.GetFromJsonAsync<List<OrderReadDto>>("/api/orders");
        Assert.Contains(driverOrders!, item => item.Id == assignedPast);
        Assert.Contains(driverOrders!, item => item.Id == companyPast);
        Assert.Contains(driverOrders!, item => item.Id == future);

        var replacement = await TestAuth.RegisterAsync(_factory.CreateClient(), $"hist2_{suffix}", "接手司导", "driver");
        var futureOrder = await dispatcherClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{future}");
        var futureDay = futureOrder!.Days[0];
        (await companyClient.PutAsJsonAsync($"/api/orders/{future}/days/{futureDay.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = futureDay.ServiceDate,
            DriverId = replacement.DriverId
        })).EnsureSuccessStatusCode();
        var dispatcherAfter = await dispatcherClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var driverAfter = await driverClient.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.DoesNotContain(dispatcherAfter!.Desk!.Orders, item => item.Id == future);
        Assert.DoesNotContain(driverAfter!.Desk!.Orders, item => item.Id == future);
    }

    [Fact]
    public async Task Assigned_color_is_private_to_each_user()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var first = _factory.CreateClient();
        (await first.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"c1_{suffix}",
            Password = "Passw0rd!",
            Name = "颜色一",
            AccountType = "company",
            CompanyName = $"颜色公司一{suffix}"
        })).EnsureSuccessStatusCode();
        var firstMe = await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal(AssignedColors.Default, firstMe!.AssignedColor);

        var second = _factory.CreateClient();
        (await second.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"c2_{suffix}",
            Password = "Passw0rd!",
            Name = "颜色二",
            AccountType = "company",
            CompanyName = $"颜色公司二{suffix}"
        })).EnsureSuccessStatusCode();

        var saved = await first.PutAsJsonAsync("/api/auth/assigned-color", new AssignedColorWriteDto
        {
            AssignedColor = "#1677ff"
        });
        saved.EnsureSuccessStatusCode();
        var firstSaved = await saved.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.Equal("#1677ff", firstSaved!.AssignedColor);

        var secondMe = await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        Assert.Equal(AssignedColors.Default, secondMe!.AssignedColor);

        (await second.PutAsJsonAsync("/api/auth/assigned-color", new AssignedColorWriteDto
        {
            AssignedColor = "#eb2f96"
        })).EnsureSuccessStatusCode();

        Assert.Equal("#1677ff", (await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.AssignedColor);
        Assert.Equal("#eb2f96", (await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.AssignedColor);

        var invalid = await first.PutAsJsonAsync("/api/auth/assigned-color", new AssignedColorWriteDto
        {
            AssignedColor = "#ffffff"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task User_can_update_own_name()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var first = _factory.CreateClient();
        (await first.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"nm1_{suffix}",
            Password = "Passw0rd!",
            Name = "原名甲",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        var second = _factory.CreateClient();
        (await second.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"nm2_{suffix}",
            Password = "Passw0rd!",
            Name = "原名乙",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        var saved = await first.PutAsJsonAsync("/api/auth/name", new ProfileNameWriteDto { Name = " 新名字 " });
        saved.EnsureSuccessStatusCode();
        var firstSaved = await saved.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.Equal("新名字", firstSaved!.Name);
        Assert.Equal("新名字", (await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Name);
        Assert.Equal("原名乙", (await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Name);
        var listed = await first.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.Contains(listed!, item => item.Id == firstSaved.DriverId && item.Name == "新名字");
        Assert.DoesNotContain(listed!, item => item.Name == "原名乙");

        var empty = await first.PutAsJsonAsync("/api/auth/name", new ProfileNameWriteDto { Name = "  " });
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }

    [Fact]
    public async Task User_can_change_own_username_and_password()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var firstName = $"u1_{suffix}";
        var secondName = $"u2_{suffix}";
        var renamed = $"u1b_{suffix}";

        var first = _factory.CreateClient();
        (await first.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = firstName,
            Password = "Passw0rd!",
            Name = "改号甲",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        var second = _factory.CreateClient();
        (await second.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = secondName,
            Password = "Passw0rd!",
            Name = "改号乙",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        var taken = await first.PutAsJsonAsync("/api/auth/username", new ProfileUsernameWriteDto
        {
            Username = $" {secondName.ToUpperInvariant()} "
        });
        Assert.Equal(HttpStatusCode.BadRequest, taken.StatusCode);

        var tooShort = await first.PutAsJsonAsync("/api/auth/username", new ProfileUsernameWriteDto { Username = "ab" });
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);

        var renamedResponse = await first.PutAsJsonAsync("/api/auth/username", new ProfileUsernameWriteDto
        {
            Username = $" {renamed} "
        });
        renamedResponse.EnsureSuccessStatusCode();
        Assert.Equal(renamed, (await renamedResponse.Content.ReadFromJsonAsync<SessionUserDto>())!.Username);
        Assert.Equal(renamed, (await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Username);
        Assert.Equal(secondName, (await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Username);

        var oldLogin = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = firstName,
            Password = "Passw0rd!"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        var newLogin = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = renamed,
            Password = "Passw0rd!"
        });
        newLogin.EnsureSuccessStatusCode();

        var wrongPassword = await first.PutAsJsonAsync("/api/auth/password", new ProfilePasswordWriteDto
        {
            CurrentPassword = "wrong-pass",
            Password = "NewPass1!"
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);

        var shortPassword = await first.PutAsJsonAsync("/api/auth/password", new ProfilePasswordWriteDto
        {
            CurrentPassword = "Passw0rd!",
            Password = "short"
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);

        (await first.PutAsJsonAsync("/api/auth/password", new ProfilePasswordWriteDto
        {
            CurrentPassword = "Passw0rd!",
            Password = "NewPass1!"
        })).EnsureSuccessStatusCode();

        var stalePassword = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = renamed,
            Password = "Passw0rd!"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, stalePassword.StatusCode);

        var changedLogin = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginDto
        {
            Username = renamed,
            Password = "NewPass1!"
        });
        changedLogin.EnsureSuccessStatusCode();
        Assert.Equal(secondName, (await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Username);
    }

    [Fact]
    public async Task User_contact_is_private_and_shown_on_the_company_dispatcher_list()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        (await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctco_{suffix}",
            Password = "Passw0rd!",
            Name = "联系公司",
            AccountType = "company",
            CompanyName = $"联系公司{suffix}"
        })).EnsureSuccessStatusCode();
        var companyUser = await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctds_{suffix}",
            Password = "Passw0rd!",
            Name = "联系调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        var saved = await dispatcher.PutAsJsonAsync("/api/auth/contact", new ProfileContactWriteDto
        {
            Contact = "  微信-甲  "
        });
        saved.EnsureSuccessStatusCode();
        Assert.Equal("微信-甲", (await saved.Content.ReadFromJsonAsync<SessionUserDto>())!.Contact);

        var other = _factory.CreateClient();
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctot_{suffix}",
            Password = "Passw0rd!",
            Name = "旁人",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        Assert.Null((await other.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Contact);

        var tooLong = await dispatcher.PutAsJsonAsync("/api/auth/contact", new ProfileContactWriteDto
        {
            Contact = new string('微', 201)
        });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal("微信-甲", (await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Contact);

        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var application = home!.Desk!.Applications.Single();
        Assert.Equal("联系调度", application.Name);
        Assert.Equal("微信-甲", application.Contact);
        (await company.PostAsJsonAsync($"/api/company/applications/{application.Id}/approve", new { })).EnsureSuccessStatusCode();
        var desk = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        var member = desk!.Desk!.Dispatchers.Single(item => item.Name == "联系调度");
        Assert.Equal("联系调度", member.Name);
        Assert.Equal("微信-甲", member.Contact);

        (await dispatcher.PutAsJsonAsync("/api/auth/contact", new ProfileContactWriteDto { Contact = "  " })).EnsureSuccessStatusCode();
        Assert.Null((await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Contact);
        var cleared = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.Null(cleared!.Desk!.Dispatchers.Single(item => item.Name == "联系调度").Contact);
        Assert.Null((await other.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Contact);
    }

    [Fact]
    public async Task Dispatcher_and_driver_can_read_each_others_contact()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        (await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctco2_{suffix}",
            Password = "Passw0rd!",
            Name = "联系公司二",
            AccountType = "company",
            CompanyName = $"联系公司二{suffix}"
        })).EnsureSuccessStatusCode();
        var companyUser = await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctds2_{suffix}",
            Password = "Passw0rd!",
            Name = "联系调度二",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        (await company.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications.Single().Id}/approve", new { })).EnsureSuccessStatusCode();
        (await dispatcher.PutAsJsonAsync("/api/auth/contact", new ProfileContactWriteDto { Contact = "调度微信" })).EnsureSuccessStatusCode();

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ctdrv_{suffix}",
            Password = "Passw0rd!",
            Name = "联系司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await driver.PutAsJsonAsync("/api/auth/contact", new ProfileContactWriteDto { Contact = "司导微信" })).EnsureSuccessStatusCode();
        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser!.Id
        })).EnsureSuccessStatusCode();
        var incoming = await dispatcher.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        var applicant = incoming!.Single();
        Assert.Equal("联系司导", applicant.Name);
        Assert.Equal("司导微信", applicant.Contact);
        (await dispatcher.PostAsJsonAsync($"/api/dispatchers/applications/{applicant.Id}/approve", new { })).EnsureSuccessStatusCode();

        var listed = await dispatcher.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        var card = listed!.Single(item => item.Id == driverUser!.DriverId);
        Assert.Equal("联系司导", card.Name);
        Assert.Equal("司导微信", card.Contact);
        Assert.Null(card.Phone);

        var created = await dispatcher.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-CONTACT-{suffix}",
            StartDate = new DateOnly(2036, 4, 2),
            GuestCount = 1
        });
        created.EnsureSuccessStatusCode();
        var order = await created.Content.ReadFromJsonAsync<OrderReadDto>();
        Assert.Equal("调度微信", order!.AssignedDispatcherContact);
        (await dispatcher.PostAsJsonAsync($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2036, 4, 2)
        })).EnsureSuccessStatusCode();
        (await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}/driver", new AssignDriverDto
        {
            DriverId = driverUser!.DriverId
        })).EnsureSuccessStatusCode();

        var detail = await driver.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}");
        var day = Assert.Single(detail!.Days);
        Assert.Equal(dispatcherUser.Id, day.AssignedByUserId);
        Assert.Equal("联系调度二", day.AssignedByName);
        Assert.Equal("调度微信", day.AssignedByContact);
        Assert.Equal("调度微信", detail.AssignedDispatcherContact);

        (await dispatcher.DeleteAsync($"/api/orders/{order.Id}")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task People_stay_hidden_until_their_application_is_approved()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];

        var companyA = _factory.CreateClient();
        (await companyA.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ca_{suffix}",
            Password = "Passw0rd!",
            Name = "甲公司",
            AccountType = "company",
            CompanyName = $"甲公司{suffix}"
        })).EnsureSuccessStatusCode();
        var companyAUser = await companyA.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var companyB = _factory.CreateClient();
        (await companyB.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"cb_{suffix}",
            Password = "Passw0rd!",
            Name = "乙公司",
            AccountType = "company",
            CompanyName = $"乙公司{suffix}"
        })).EnsureSuccessStatusCode();

        async Task<HttpClient> DispatcherOf(HttpClient company, string username, string name)
        {
            var client = _factory.CreateClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
            {
                Username = username,
                Password = "Passw0rd!",
                Name = name,
                AccountType = "driver"
            })).EnsureSuccessStatusCode();
            var me = await client.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
            (await client.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
            {
                CompanyId = companyAUser!.CompanyId!.Value
            })).EnsureSuccessStatusCode();
            var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
            var application = home!.Desk!.Applications.Single(item => item.UserId == me!.Id);
            (await company.PostAsJsonAsync($"/api/company/applications/{application.Id}/approve", new { })).EnsureSuccessStatusCode();
            return client;
        }

        var first = await DispatcherOf(companyA, $"d1_{suffix}", "甲调度");
        var second = await DispatcherOf(companyA, $"d2_{suffix}", "乙调度");
        var firstUser = await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        var secondUser = await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var outsider = _factory.CreateClient();
        (await outsider.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"out_{suffix}",
            Password = "Passw0rd!",
            Name = "外公司调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var outsiderUser = await outsider.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        var companyBUser = await companyB.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await outsider.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyBUser!.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var homeB = await companyB.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        (await companyB.PostAsJsonAsync($"/api/company/applications/{homeB!.Desk!.Applications[0].Id}/approve", new { })).EnsureSuccessStatusCode();

        var deskA = await companyA.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.Contains(deskA!.Desk!.Dispatchers, item => item.UserId == firstUser!.Id);
        Assert.Contains(deskA.Desk.Dispatchers, item => item.UserId == secondUser!.Id);
        Assert.DoesNotContain(deskA.Desk.Dispatchers, item => item.UserId == outsiderUser!.Id);
        var deskB = await companyB.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.DoesNotContain(deskB!.Desk!.Dispatchers, item => item.UserId == firstUser!.Id);

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"gd_{suffix}",
            Password = "Passw0rd!",
            Name = "待批司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var before = await first.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(before!, item => item.Id == driverUser!.DriverId);
        Assert.Equal(HttpStatusCode.NotFound, (await first.GetAsync($"/api/drivers/{driverUser!.DriverId}")).StatusCode);
        var companyBefore = await companyA.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(companyBefore!, item => item.Id == driverUser.DriverId);

        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = firstUser!.Id
        })).EnsureSuccessStatusCode();
        var stillHidden = await first.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(stillHidden!, item => item.Id == driverUser.DriverId);

        var incoming = await first.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        (await first.PostAsJsonAsync($"/api/dispatchers/applications/{incoming!.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var after = await first.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.Contains(after!, item => item.Id == driverUser.DriverId);
        var otherDispatcher = await second.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(otherDispatcher!, item => item.Id == driverUser.DriverId);
        var companyAfter = await companyA.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(companyAfter!, item => item.Id == driverUser.DriverId);
        var otherCompany = await companyB.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(otherCompany!, item => item.Id == driverUser.DriverId);

        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = secondUser!.Id
        })).EnsureSuccessStatusCode();
        var secondIncoming = await second.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        (await second.PostAsJsonAsync($"/api/dispatchers/applications/{secondIncoming!.Single().Id}/approve", new { })).EnsureSuccessStatusCode();
        var shared = await second.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.Contains(shared!, item => item.Id == driverUser.DriverId);
    }

    [Fact]
    public async Task Company_desk_lists_only_drivers_who_applied_to_the_company_account()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        (await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm_{suffix}",
            Password = "Passw0rd!",
            Name = "人事公司",
            AccountType = "company",
            CompanyName = $"人事公司{suffix}"
        })).EnsureSuccessStatusCode();
        var companyUser = await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me");

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"disp_{suffix}",
            Password = "Passw0rd!",
            Name = "带队调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser!.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        (await company.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications[0].Id}/approve", new { })).EnsureSuccessStatusCode();

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"guide_{suffix}",
            Password = "Passw0rd!",
            Name = "跟调度的司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser!.Id
        })).EnsureSuccessStatusCode();
        var dispatcherIncoming = await dispatcher.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        (await dispatcher.PostAsJsonAsync($"/api/dispatchers/applications/{dispatcherIncoming!.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var companyRoster = await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(companyRoster!, item => item.Id == driverUser!.DriverId);

        var found = await driver.GetFromJsonAsync<List<DispatcherSearchDto>>("/api/dispatchers?name=人事公司");
        Assert.Contains(found!, item => item.Id == companyUser.Id);
        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = companyUser.Id
        })).EnsureSuccessStatusCode();
        var beforeApprove = await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.DoesNotContain(beforeApprove!, item => item.Id == driverUser!.DriverId);

        var incoming = (await company.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications"))!;
        Assert.Equal("跟调度的司导", incoming.Single().Name);
        (await company.PostAsJsonAsync($"/api/dispatchers/applications/{incoming.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var after = (await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!;
        var listed = Assert.Single(after, item => item.Id == driverUser!.DriverId);
        Assert.False(listed.Hidden);
    }

    [Fact]
    public async Task Every_account_starts_as_its_own_approved_driver()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        (await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"selfco_{suffix}",
            Password = "Passw0rd!",
            Name = "自派公司",
            AccountType = "company",
            CompanyName = $"自派公司全称{suffix}"
        })).EnsureSuccessStatusCode();
        var companyUser = (await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!;
        Assert.Empty(companyUser.PendingDriverApplications);
        var companyRoster = (await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!;
        var companySelf = Assert.Single(companyRoster);
        Assert.Equal(companyUser.DriverId, companySelf.Id);
        Assert.Equal("自派公司", companySelf.Name);
        Assert.False(companySelf.Hidden);

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"selfdd_{suffix}",
            Password = "Passw0rd!",
            Name = "自派调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = (await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!;
        var selfApply = await dispatcher.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, selfApply.StatusCode);

        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        (await company.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var desk = (await dispatcher.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!;
        var dispatcherSelf = Assert.Single(desk);
        Assert.Equal(dispatcherUser.DriverId, dispatcherSelf.Id);
        Assert.False(dispatcherSelf.Hidden);

        (await dispatcher.PutAsJsonAsync($"/api/drivers/{dispatcherUser.DriverId}/hidden", new DriverHiddenWriteDto
        {
            Hidden = true
        })).EnsureSuccessStatusCode();
        var unbind = await dispatcher.DeleteAsync($"/api/dispatchers/drivers/{dispatcherUser.DriverId}");
        Assert.Equal(HttpStatusCode.BadRequest, unbind.StatusCode);
        var stillThere = (await dispatcher.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!;
        Assert.Contains(stillThere, item => item.Id == dispatcherUser.DriverId && item.Hidden);
    }

    [Fact]
    public async Task Company_is_its_own_dispatcher_and_can_hide_or_remove_others()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var date = new DateOnly(2038, 6, 2);
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"owndd_{suffix}", "自派调度公司", "company", $"自派调度公司{suffix}");
        var home = (await company.GetFromJsonAsync<CompanyHomeDto>("/api/company"))!;
        var self = Assert.Single(home.Desk!.Dispatchers);
        Assert.Equal(companyUser.Id, self.UserId);
        Assert.False(self.Hidden);
        Assert.Equal(UserRoles.Company, (await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!.Role);

        var plain = _factory.CreateClient();
        var plainUser = await TestAuth.RegisterAsync(plain, $"ownplain_{suffix}", "普通司导", "driver");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            Assert.False(db.CompanyMembers.Any(item => item.UserId == plainUser.Id && item.Role == UserRoles.Dispatcher));
        }

        var denied = await company.DeleteAsync($"/api/company/dispatchers/{companyUser.Id}");
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Contains((await company.GetFromJsonAsync<CompanyHomeDto>("/api/company"))!.Desk!.Dispatchers, item => item.UserId == companyUser.Id);

        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"owndisp_{suffix}", "可移除调度", "driver");
        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        var pending = (await company.GetFromJsonAsync<CompanyHomeDto>("/api/company"))!;
        (await company.PostAsJsonAsync($"/api/company/applications/{pending.Desk!.Applications.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var order = await company.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-DD-{suffix}",
            StartDate = date,
            GuestCount = 1
        });
        order.EnsureSuccessStatusCode();
        var created = (await order.Content.ReadFromJsonAsync<OrderReadDto>())!;
        (await company.PostAsJsonAsync($"/api/orders/{created.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = date
        })).EnsureSuccessStatusCode();
        (await company.PutAsJsonAsync($"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        })).EnsureSuccessStatusCode();

        var finishedResponse = await company.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-DONE-{suffix}",
            StartDate = new DateOnly(2020, 1, 2),
            GuestCount = 1
        });
        finishedResponse.EnsureSuccessStatusCode();
        var finished = (await finishedResponse.Content.ReadFromJsonAsync<OrderReadDto>())!;
        (await company.PostAsJsonAsync($"/api/orders/{finished.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2020, 1, 2)
        })).EnsureSuccessStatusCode();
        (await company.PutAsJsonAsync($"/api/orders/{finished.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        })).EnsureSuccessStatusCode();

        (await company.PutAsJsonAsync($"/api/company/dispatchers/{dispatcherUser.Id}/hidden", new DriverHiddenWriteDto
        {
            Hidden = true
        })).EnsureSuccessStatusCode();
        var hidden = (await company.GetFromJsonAsync<CompanyHomeDto>("/api/company"))!;
        Assert.True(hidden.Desk!.Dispatchers.Single(item => item.UserId == dispatcherUser.Id).Hidden);
        Assert.False(hidden.Desk.Dispatchers.Single(item => item.UserId == companyUser.Id).Hidden);

        (await company.DeleteAsync($"/api/company/dispatchers/{dispatcherUser.Id}")).EnsureSuccessStatusCode();
        var after = (await company.GetFromJsonAsync<CompanyHomeDto>("/api/company"))!;
        Assert.DoesNotContain(after.Desk!.Dispatchers, item => item.UserId == dispatcherUser.Id);
        var reclaimed = (await company.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}"))!;
        Assert.Null(reclaimed.AssignedDispatcherUserId);
        Assert.All(reclaimed.Days, day => Assert.Null(day.DriverId));
        var kept = (await company.GetFromJsonAsync<OrderReadDto>($"/api/orders/{finished.Id}"))!;
        Assert.Equal(dispatcherUser.Id, kept.AssignedDispatcherUserId);
    }
}
