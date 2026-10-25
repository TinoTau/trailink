using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Tests;

public class CrudApiTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public CrudApiTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        TestAuth.SignInCompanyAsync(_client).GetAwaiter().GetResult();
    }

    [Fact]
    public async Task Health_connects_to_database()
    {
        var response = await _client.GetAsync("/api/health");
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ok", document.RootElement.GetProperty("status").GetString());
        Assert.Equal("connected", document.RootElement.GetProperty("database").GetString());
    }

    [Fact]
    public async Task Driver_crud_works()
    {
        var created = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto
        {
            Name = "张师傅",
            Phone = "0210000001"
        });
        Assert.Equal("张师傅", created.Name);
        created = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "测试司机"
        });

        var fetched = await _client.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.Equal(created.Id, fetched!.Id);
        Assert.Equal("测试司机", fetched.Notes);

        var updated = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}", new DriverWriteDto
        {
            Name = "张师傅-改",
            Phone = "0210000002"
        });
        updated = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "已更新"
        });
        Assert.Equal("张师傅-改", updated.Name);
        Assert.Equal("已更新", updated.Notes);

        var list = await _client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers", JsonOptions);
        Assert.DoesNotContain(list!, item => item.Id == created.Id);

        var deleteResponse = await _client.DeleteAsync($"/api/drivers/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var missing = await _client.GetAsync($"/api/drivers/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Driver_notes_are_private_to_each_viewer()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var created = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto
        {
            Name = "分备注司机"
        });
        created = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "公司备注"
        });

        var other = _factory.CreateClient();
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"dn_{suffix}",
            Password = "Passw0rd!",
            Name = "另一调度",
            AccountType = "company",
            CompanyName = $"备注公司{suffix}"
        })).EnsureSuccessStatusCode();

        var otherView = await other.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.Null(otherView!.Notes);

        var otherWrite = await other.PutAsJsonAsync($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "另一人备注"
        });
        otherWrite.EnsureSuccessStatusCode();
        var otherSaved = await otherWrite.Content.ReadFromJsonAsync<DriverReadDto>(JsonOptions);
        Assert.Equal("另一人备注", otherSaved!.Notes);

        var ownerView = await _client.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.Equal("公司备注", ownerView!.Notes);

        var first = other.PutAsJsonAsync($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "并发一"
        });
        var second = other.PutAsJsonAsync($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "并发二"
        });
        var raced = await Task.WhenAll(first, second);
        Assert.All(raced, response => response.EnsureSuccessStatusCode());
        var afterRace = await other.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.True(afterRace!.Notes is "并发一" or "并发二");

        await _client.DeleteAsync($"/api/drivers/{created.Id}");
    }

    [Fact]
    public async Task Driver_hide_is_private_and_kept_when_notes_are_cleared()
    {
        var created = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto
        {
            Name = "可隐藏司机"
        });
        Assert.False(created.Hidden);

        var hidden = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/hidden", new DriverHiddenWriteDto
        {
            Hidden = true
        });
        Assert.True(hidden.Hidden);
        Assert.Null(hidden.Notes);

        var noted = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = "仍隐藏"
        });
        Assert.True(noted.Hidden);
        Assert.Equal("仍隐藏", noted.Notes);

        var cleared = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/notes", new DriverNoteWriteDto
        {
            Notes = ""
        });
        Assert.True(cleared.Hidden);
        Assert.Null(cleared.Notes);

        var other = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"hide_{suffix}",
            Password = "Passw0rd!",
            Name = "另一查看者",
            AccountType = "company",
            CompanyName = $"隐藏公司{suffix}"
        })).EnsureSuccessStatusCode();
        var otherView = await other.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.False(otherView!.Hidden);

        var restored = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}/hidden", new DriverHiddenWriteDto
        {
            Hidden = false
        });
        Assert.False(restored.Hidden);
        Assert.Null(restored.Notes);

        await _client.DeleteAsync($"/api/drivers/{created.Id}");
    }

    [Fact]
    public async Task Order_days_activities_and_assignment_work()
    {
        var zhang = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "张师傅-派单" });
        var li = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "李师傅-派单" });

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 12),
            GuestCount = 6
        });

        Assert.False(string.IsNullOrWhiteSpace(order.OrderNo));
        Assert.StartsWith("TL-", order.OrderNo);
        Assert.Null(order.PlatformOrderNo);
        Assert.Equal("测试管理人", order.CreatedByName);
        Assert.Empty(order.Days);

        var dates = new[]
        {
            new DateOnly(2026, 11, 12),
            new DateOnly(2026, 11, 13),
            new DateOnly(2026, 11, 14)
        };
        var days = new List<ItineraryDayReadDto>();
        foreach (var date in dates)
        {
            days.Add(await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = date,
                Description = $"{date:MM-dd} 行程"
            }));
        }

        Assert.Equal(3, days.Count);

        var firstDay = await PutAsync<ItineraryDayReadDto>(
            $"/api/orders/{order.Id}/days/{days[0].Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = days[0].ServiceDate,
                Description = "基督城接客，前往特卡波。",
                EndLocation = "特卡波"
            });
        Assert.Equal("特卡波", firstDay.EndLocation);

        var activityA = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{days[0].Id}/activities",
            new OrderActivityWriteDto { Content = "好牧羊人教堂" });
        var activityB = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{days[0].Id}/activities",
            new OrderActivityWriteDto { Content = " trekking " });

        var updatedActivity = await PutAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{days[0].Id}/activities/{activityA.Id}",
            new OrderActivityWriteDto
            {
                Content = "好牧羊人教堂",
                Provider = "本地向导",
                BookingTime = new DateTime(2026, 11, 12, 9, 0, 0, DateTimeKind.Unspecified)
            });
        Assert.Equal("本地向导", updatedActivity.Provider);
        Assert.Equal(new DateTime(2026, 11, 12, 9, 0, 0, DateTimeKind.Unspecified), updatedActivity.BookingTime);

        var deleteActivity = await _client.DeleteAsync(
            $"/api/orders/{order.Id}/days/{days[0].Id}/activities/{activityB.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteActivity.StatusCode);

        var assignment = await PutAsync<AssignmentResultDto>(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = zhang.Id });
        Assert.Equal(3, assignment.UpdatedDayCount);
        var listed = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        var listedOrder = listed!.Single(item => item.Id == order.Id);
        Assert.Equal(3, listedOrder.AssignedDayCount);
        Assert.All(listedOrder.Days, day => Assert.Equal(zhang.Id, day.DriverId));
        Assert.Equal(3, listedOrder.Days.Count);

        var reassigned = await PutAsync<ItineraryDayReadDto>(
            $"/api/orders/{order.Id}/days/{days[2].Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = days[2].ServiceDate,
                Description = "箭镇",
                EndLocation = "皇后镇",
                DriverId = li.Id
            });
        Assert.Equal(li.Id, reassigned.DriverId);

        var detail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(3, detail!.DayCount);
        Assert.Equal(new DateOnly(2026, 11, 14), detail.EndDate);
        Assert.Equal(zhang.Id, detail.Days[0].DriverId);
        Assert.Equal(zhang.Id, detail.Days[1].DriverId);
        Assert.Equal(li.Id, detail.Days[2].DriverId);

        var listedSplit = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        var splitSummary = listedSplit!.Single(item => item.Id == order.Id);
        Assert.Equal(3, splitSummary.AssignedDayCount);
        Assert.Equal(2, splitSummary.Days.Count(day => day.DriverId == zhang.Id));
        Assert.Equal(li.Id, splitSummary.Days.Single(day => day.ServiceDate == new DateOnly(2026, 11, 14)).DriverId);
        Assert.Single(detail.Days[0].Activities);
        Assert.Equal("本地向导", detail.Days[0].Activities[0].Provider);

        var deleteOrder = await _client.DeleteAsync($"/api/orders/{order.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteOrder.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/orders/{order.Id}/days")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await _client.GetAsync($"/api/orders/{order.Id}/days/{days[0].Id}/activities")).StatusCode);

        await _client.DeleteAsync($"/api/drivers/{zhang.Id}");
        await _client.DeleteAsync($"/api/drivers/{li.Id}");
    }

    [Fact]
    public async Task AssignDriver_conflict_warns_but_saves_and_null_unbinds()
    {
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "冲突司机-整单" });
        var first = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-ASSIGN-CONFLICT-A",
            StartDate = new DateOnly(2031, 8, 11),
            GuestCount = 2
        });
        var second = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-ASSIGN-CONFLICT-B",
            StartDate = new DateOnly(2031, 8, 11),
            GuestCount = 2
        });

        await PostAsync<ItineraryDayReadDto>($"/api/orders/{first.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2031, 8, 11)
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{first.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2031, 8, 12)
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{second.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2031, 8, 12)
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{second.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2031, 8, 13)
        });

        var assigned = await PutAsync<AssignmentResultDto>(
            $"/api/orders/{first.Id}/driver",
            new AssignDriverDto { DriverId = driver.Id });
        Assert.Equal(2, assigned.UpdatedDayCount);
        Assert.Empty(assigned.Warnings);

        var conflicted = await PutAsync<AssignmentResultDto>(
            $"/api/orders/{second.Id}/driver",
            new AssignDriverDto { DriverId = driver.Id });
        Assert.Equal(2, conflicted.UpdatedDayCount);
        Assert.Contains(conflicted.Warnings, item => item.Contains("2031-08-12") && item.Contains(first.PlatformOrderNo!));
        Assert.DoesNotContain(conflicted.Warnings, item => item.Contains(first.OrderNo));

        var secondDetail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{second.Id}", JsonOptions);
        Assert.All(secondDetail!.Days, day => Assert.Equal(driver.Id, day.DriverId));

        var cleared = await PutAsync<AssignmentResultDto>(
            $"/api/orders/{first.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(2, cleared.UpdatedDayCount);
        Assert.Null(cleared.DriverId);
        Assert.Empty(cleared.Warnings);

        var firstDetail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{first.Id}", JsonOptions);
        Assert.Equal(2, firstDetail!.Days.Count);
        Assert.All(firstDetail.Days, day => Assert.Null(day.DriverId));

        var stillAssigned = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{second.Id}", JsonOptions);
        Assert.All(stillAssigned!.Days, day => Assert.Equal(driver.Id, day.DriverId));

        var blocked = await _client.PutAsJsonAsync(
            $"/api/orders/{first.Id}/driver",
            new AssignDriverDto { DriverId = driver.Id, FailOnConflict = true });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var stillClear = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{first.Id}", JsonOptions);
        Assert.All(stillClear!.Days, day => Assert.Null(day.DriverId));

        await _client.DeleteAsync($"/api/orders/{first.Id}");
        await _client.DeleteAsync($"/api/orders/{second.Id}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    [Fact]
    public async Task Other_user_cannot_clear_assignment_but_owner_and_driver_can()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driverClient = _factory.CreateClient();
        var driverRegister = await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ubd_{suffix}",
            Password = "Passw0rd!",
            Name = "解绑司导",
            AccountType = "driver"
        });
        driverRegister.EnsureSuccessStatusCode();
        var driverUser = await driverRegister.Content.ReadFromJsonAsync<SessionUserDto>(JsonOptions);

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-UNBIND-OWN",
            StartDate = new DateOnly(2033, 4, 11),
            GuestCount = 2
        });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2033, 4, 11)
        });
        await PutAsync<AssignmentResultDto>(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = driverUser!.DriverId });

        var other = _factory.CreateClient();
        var otherRegister = await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"oth_{suffix}",
            Password = "Passw0rd!",
            Name = "其他调度",
            AccountType = "company",
            CompanyName = $"其他公司{suffix}"
        });
        otherRegister.EnsureSuccessStatusCode();

        var blockedWhole = await other.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, blockedWhole.StatusCode);

        var blockedDay = await other.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{day.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = day.ServiceDate,
                DriverId = null
            });
        Assert.Equal(HttpStatusCode.Forbidden, blockedDay.StatusCode);

        var stillAssigned = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(stillAssigned!.Days, item => Assert.Equal(driverUser.DriverId, item.DriverId));

        var driverCleared = await driverClient.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        driverCleared.EnsureSuccessStatusCode();
        var afterDriver = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(afterDriver!.Days, item => Assert.Null(item.DriverId));

        await PutAsync<AssignmentResultDto>(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = driverUser.DriverId });
        var ownerCleared = await PutAsync<AssignmentResultDto>(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Null(ownerCleared.DriverId);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Unrelated_driver_cannot_clear_another_drivers_assignment()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var assignedDriver = _factory.CreateClient();
        var assignedRegistration = await assignedDriver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"own_drv_{suffix}",
            Password = "Passw0rd!",
            Name = "被派司导",
            AccountType = "driver"
        });
        assignedRegistration.EnsureSuccessStatusCode();
        var assignedUser = await assignedRegistration.Content.ReadFromJsonAsync<SessionUserDto>(JsonOptions);

        var unrelatedDriver = _factory.CreateClient();
        var unrelatedRegistration = await unrelatedDriver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"other_drv_{suffix}",
            Password = "Passw0rd!",
            Name = "无关司导",
            AccountType = "driver"
        });
        unrelatedRegistration.EnsureSuccessStatusCode();

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-DRIVER-CLEAR-SCOPE",
            StartDate = new DateOnly(2033, 4, 12),
            GuestCount = 2
        });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2033, 4, 12)
        });
        await PutAsync<AssignmentResultDto>(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = assignedUser!.DriverId });

        var blockedWhole = await unrelatedDriver.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, blockedWhole.StatusCode);

        var blockedDay = await unrelatedDriver.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{day.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = day.ServiceDate,
                DriverId = null
            });
        Assert.Equal(HttpStatusCode.Forbidden, blockedDay.StatusCode);

        var unchanged = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(assignedUser.DriverId, Assert.Single(unchanged!.Days).DriverId);

        var ownerClear = await assignedDriver.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{day.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = day.ServiceDate,
                DriverId = null
            });
        ownerClear.EnsureSuccessStatusCode();

        var cleared = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Null(Assert.Single(cleared!.Days).DriverId);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Assigner_can_clear_even_if_not_creator()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "分配人司机" });
        var created = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-ASSIGNER-UNBIND",
            StartDate = new DateOnly(2034, 5, 11),
            GuestCount = 2
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{created.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2034, 5, 11)
        });

        var assigner = _factory.CreateClient();
        var registered = await assigner.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"asg_{suffix}",
            Password = "Passw0rd!",
            Name = "实际分配人",
            AccountType = "company",
            CompanyName = $"分配公司{suffix}"
        });
        registered.EnsureSuccessStatusCode();

        var assigned = await assigner.PutAsJsonAsync(
            $"/api/orders/{created.Id}/driver",
            new AssignDriverDto { DriverId = driver.Id });
        assigned.EnsureSuccessStatusCode();
        var afterAssign = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.All(afterAssign!.Days, day => Assert.Equal("实际分配人", day.AssignedByName));

        var creatorBlocked = await _client.PutAsJsonAsync(
            $"/api/orders/{created.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, creatorBlocked.StatusCode);

        var assignerCleared = await assigner.PutAsJsonAsync(
            $"/api/orders/{created.Id}/driver",
            new AssignDriverDto { DriverId = null });
        assignerCleared.EnsureSuccessStatusCode();
        var afterClear = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.All(afterClear!.Days, day => Assert.Null(day.DriverId));

        await _client.DeleteAsync($"/api/orders/{created.Id}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    [Fact]
    public async Task Two_assigners_same_driver_each_clears_own_day_and_driver_clears_any()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driverClient = _factory.CreateClient();
        var driverRegister = await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ub2_{suffix}",
            Password = "Passw0rd!",
            Name = "双派司导",
            AccountType = "driver"
        });
        driverRegister.EnsureSuccessStatusCode();
        var driverUser = await driverRegister.Content.ReadFromJsonAsync<SessionUserDto>(JsonOptions);

        var firstAssigner = _factory.CreateClient();
        (await firstAssigner.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"a1_{suffix}",
            Password = "Passw0rd!",
            Name = "第一分配人",
            AccountType = "company",
            CompanyName = $"第一公司{suffix}"
        })).EnsureSuccessStatusCode();

        var secondAssigner = _factory.CreateClient();
        (await secondAssigner.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"a2_{suffix}",
            Password = "Passw0rd!",
            Name = "第二分配人",
            AccountType = "company",
            CompanyName = $"第二公司{suffix}"
        })).EnsureSuccessStatusCode();

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-TWO-ASSIGNERS",
            StartDate = new DateOnly(2035, 6, 11),
            GuestCount = 2
        });
        var dayOne = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2035, 6, 11)
        });
        var dayTwo = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2035, 6, 12)
        });

        (await firstAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayOne.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayOne.ServiceDate, DriverId = driverUser!.DriverId }))
            .EnsureSuccessStatusCode();
        (await secondAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayTwo.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayTwo.ServiceDate, DriverId = driverUser.DriverId }))
            .EnsureSuccessStatusCode();

        var firstWhole = await firstAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, firstWhole.StatusCode);
        var secondWhole = await secondAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, secondWhole.StatusCode);

        var firstStealsSecond = await firstAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayTwo.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayTwo.ServiceDate, DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, firstStealsSecond.StatusCode);

        (await firstAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayOne.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayOne.ServiceDate, DriverId = null }))
            .EnsureSuccessStatusCode();
        (await secondAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayTwo.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayTwo.ServiceDate, DriverId = null }))
            .EnsureSuccessStatusCode();

        (await firstAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayOne.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayOne.ServiceDate, DriverId = driverUser.DriverId }))
            .EnsureSuccessStatusCode();
        (await secondAssigner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayTwo.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayTwo.ServiceDate, DriverId = driverUser.DriverId }))
            .EnsureSuccessStatusCode();

        (await driverClient.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayOne.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayOne.ServiceDate, DriverId = null }))
            .EnsureSuccessStatusCode();
        (await driverClient.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{dayTwo.Id}",
            new ItineraryDayWriteDto { ServiceDate = dayTwo.ServiceDate, DriverId = null }))
            .EnsureSuccessStatusCode();

        var afterDriver = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(afterDriver!.Days, day => Assert.Null(day.DriverId));

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task UpdateDay_failOnConflict_returns_409_without_saving()
    {
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "冲突司机-按天" });
        var first = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-DAY-CONFLICT-A",
            StartDate = new DateOnly(2032, 3, 11),
            GuestCount = 2
        });
        var second = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-DAY-CONFLICT-B",
            StartDate = new DateOnly(2032, 3, 11),
            GuestCount = 2
        });

        await PostAsync<ItineraryDayReadDto>($"/api/orders/{first.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2032, 3, 11)
        });
        var secondDay = await PostAsync<ItineraryDayReadDto>($"/api/orders/{second.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2032, 3, 11)
        });

        await PutAsync<AssignmentResultDto>(
            $"/api/orders/{first.Id}/driver",
            new AssignDriverDto { DriverId = driver.Id });

        var blocked = await _client.PutAsJsonAsync(
            $"/api/orders/{second.Id}/days/{secondDay.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = secondDay.ServiceDate,
                DriverId = driver.Id,
                FailOnConflict = true
            });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        var stillClear = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{second.Id}", JsonOptions);
        Assert.Null(stillClear!.Days.Single().DriverId);

        var warned = await PutAsync<ItineraryDayReadDto>(
            $"/api/orders/{second.Id}/days/{secondDay.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = secondDay.ServiceDate,
                DriverId = driver.Id
            });
        Assert.Equal(driver.Id, warned.DriverId);
        Assert.Contains(warned.Warnings, item => item.Contains("2032-03-11") && item.Contains(first.PlatformOrderNo!));
        Assert.DoesNotContain(warned.Warnings, item => item.Contains(first.OrderNo));

        await _client.DeleteAsync($"/api/orders/{first.Id}");
        await _client.DeleteAsync($"/api/orders/{second.Id}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    [Fact]
    public async Task Local_service_date_roundtrips_without_shift()
    {
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 13),
            GuestCount = 2
        });

        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 11, 13)
        });

        using var orderJson = JsonDocument.Parse(await (await _client.GetAsync($"/api/orders/{order.Id}")).Content.ReadAsStringAsync());
        using var dayJson = JsonDocument.Parse(await (await _client.GetAsync($"/api/orders/{order.Id}/days")).Content.ReadAsStringAsync());

        Assert.Equal("2026-11-13", orderJson.RootElement.GetProperty("startDate").GetString());
        Assert.Equal("2026-11-13", day.ServiceDate.ToString("yyyy-MM-dd"));
        Assert.Equal("2026-11-13", dayJson.RootElement[0].GetProperty("serviceDate").GetString());

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Activity_local_time_roundtrips_without_offset()
    {
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 13),
            GuestCount = 1
        });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 11, 13)
        });

        var created = await PostRawAsync(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            """{"content":"库克山直升机","bookingTime":"2026-11-13T10:30:00","checkinTime":"2026-11-13T10:00:00"}""");
        created.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        Assert.Equal("2026-11-13T10:30:00", document.RootElement.GetProperty("bookingTime").GetString());
        Assert.Equal("2026-11-13T10:00:00", document.RootElement.GetProperty("checkinTime").GetString());
        Assert.NotEqual("2026-11-12T21:30:00", document.RootElement.GetProperty("bookingTime").GetString());

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Activity_order_is_manual_not_by_time()
    {
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 13),
            GuestCount = 1
        });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 11, 13)
        });

        var morning = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            new OrderActivityWriteDto
            {
                Content = "早上项目",
                BookingTime = new DateTime(2026, 11, 13, 8, 0, 0, DateTimeKind.Unspecified)
            });
        var afternoon = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            new OrderActivityWriteDto
            {
                Content = "下午项目",
                BookingTime = new DateTime(2026, 11, 13, 14, 0, 0, DateTimeKind.Unspecified)
            });

        Assert.Equal(0, morning.SortOrder);
        Assert.Equal(1, afternoon.SortOrder);

        var listed = await _client.GetFromJsonAsync<List<OrderActivityReadDto>>(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            JsonOptions);
        Assert.Equal(["早上项目", "下午项目"], listed!.Select(item => item.Content).ToArray());

        var reordered = await PutAsync<List<OrderActivityReadDto>>(
            $"/api/orders/{order.Id}/days/{day.Id}/activities/reorder",
            new OrderActivityReorderDto { ActivityIds = [afternoon.Id, morning.Id] });
        Assert.Equal(["下午项目", "早上项目"], reordered.Select(item => item.Content).ToArray());
        Assert.Equal([0, 1], reordered.Select(item => item.SortOrder).ToArray());

        var detail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(["下午项目", "早上项目"], detail!.Days[0].Activities.Select(item => item.Content).ToArray());

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Theory]
    [InlineData("2026-11-13T10:30:00Z")]
    [InlineData("2026-11-13T10:30:00+13:00")]
    public async Task Activity_time_with_timezone_is_rejected(string bookingTime)
    {
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 13),
            GuestCount = 1
        });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 11, 13)
        });

        var response = await PostRawAsync(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            $$$"""{"content":"直升机","bookingTime":"{{{bookingTime}}}"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Order_dispatcher_and_driver_notes_stay_separate()
    {
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 20),
            GuestCount = 2,
            Notes = "调度备注"
        });
        Assert.Equal("调度备注", order.Notes);
        Assert.Null(order.DriverNotes);

        var driverClient = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var registered = await driverClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"note_{suffix}",
            Password = "Passw0rd!",
            Name = "备注司导",
            AccountType = "driver"
        });
        registered.EnsureSuccessStatusCode();

        var asDriver = await driverClient.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Null(asDriver!.Notes);
        Assert.Null(asDriver.DriverNotes);

        var driverWrite = await driverClient.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            Notes = "想改调度备注",
            DriverNotes = "司导备注"
        });
        driverWrite.EnsureSuccessStatusCode();
        var driverSaved = await driverWrite.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Null(driverSaved!.Notes);
        Assert.Equal("司导备注", driverSaved.DriverNotes);

        var asCompany = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal("调度备注", asCompany!.Notes);
        Assert.Equal("司导备注", asCompany.DriverNotes);

        var numbered = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            PlatformOrderNo = "P-KEEP",
            Notes = "调度备注"
        });
        Assert.Equal("P-KEEP", numbered.PlatformOrderNo);

        var blocked = await driverClient.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            PlatformOrderNo = "司机改号",
            DriverNotes = "司导备注"
        });
        blocked.EnsureSuccessStatusCode();
        var kept = await blocked.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal("P-KEEP", kept!.PlatformOrderNo);
        Assert.Equal("司导备注", kept.DriverNotes);
    }

    [Fact]
    public async Task Order_notes_are_private_to_each_dispatcher()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var created = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 7, 11),
            GuestCount = 2,
            Notes = "创建人备注"
        });

        var other = _factory.CreateClient();
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"on_{suffix}",
            Password = "Passw0rd!",
            Name = "另一调度备注",
            AccountType = "company",
            CompanyName = $"订单备注公司{suffix}"
        })).EnsureSuccessStatusCode();

        var otherView = await other.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.Null(otherView!.Notes);

        var otherWrite = await other.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            Notes = "另一人订单备注"
        });
        otherWrite.EnsureSuccessStatusCode();
        var otherSaved = await otherWrite.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal("另一人订单备注", otherSaved!.Notes);

        var ownerView = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.Equal("创建人备注", ownerView!.Notes);

        var first = other.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            Notes = "并发一"
        });
        var second = other.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            Notes = "并发二"
        });
        var raced = await Task.WhenAll(first, second);
        Assert.All(raced, response => response.EnsureSuccessStatusCode());
        var afterRace = await other.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.True(afterRace!.Notes is "并发一" or "并发二");

        await _client.DeleteAsync($"/api/orders/{created.Id}");
    }

    [Fact]
    public async Task Company_order_notes_are_hidden_from_dispatcher_and_driver()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var created = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 10, 6),
            GuestCount = 2,
            Notes = "公司私密备注"
        });
        Assert.Equal("公司私密备注", created.Notes);

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"cn_{suffix}",
            Password = "Passw0rd!",
            Name = "看备注调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = dispatcherUser!.Id,
                CompanyId = company!.CompanyId!.Value,
                Role = UserRoles.Dispatcher
            });
            var user = await db.Users.FindAsync(dispatcherUser.Id);
            user!.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync();
        }

        await PutAsync<OrderReadDto>($"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser!.Id
        });

        var asDispatcher = await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.Null(asDispatcher!.Notes);

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"cnd_{suffix}",
            Password = "Passw0rd!",
            Name = "看备注司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var asDriver = await driver.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.Null(asDriver!.Notes);

        var stillCompany = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions);
        Assert.Equal("公司私密备注", stillCompany!.Notes);

        await _client.DeleteAsync($"/api/orders/{created.Id}");
    }

    [Fact]
    public async Task Company_assigns_whole_order_to_one_dispatcher()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 8, 2),
            GuestCount = 2,
            CompanyId = company!.CompanyId
        });
        Assert.Equal(company.CompanyId, order.CompanyId);
        Assert.Null(order.AssignedDispatcherUserId);

        var first = _factory.CreateClient();
        (await first.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ad1_{suffix}",
            Password = "Passw0rd!",
            Name = "第一调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var firstUser = await first.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        var second = _factory.CreateClient();
        (await second.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"ad2_{suffix}",
            Password = "Passw0rd!",
            Name = "第二调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var secondUser = await second.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.AddRange(
                new CompanyMember
                {
                    Id = Guid.NewGuid(),
                    UserId = firstUser!.Id,
                    CompanyId = company.CompanyId!.Value,
                    Role = UserRoles.Dispatcher
                },
                new CompanyMember
                {
                    Id = Guid.NewGuid(),
                    UserId = secondUser!.Id,
                    CompanyId = company.CompanyId.Value,
                    Role = UserRoles.Dispatcher
                });
            var firstEntity = await db.Users.FindAsync(firstUser.Id);
            var secondEntity = await db.Users.FindAsync(secondUser.Id);
            firstEntity!.Role = UserRoles.Dispatcher;
            secondEntity!.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync();
        }

        var forbidden = await first.PutAsJsonAsync($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = firstUser!.Id
        });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var assigned = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = firstUser.Id
        });
        Assert.Equal(firstUser.Id, assigned.AssignedDispatcherUserId);
        Assert.Equal("第一调度", assigned.AssignedDispatcherName);

        var firstList = await first.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Contains(firstList!, item => item.Id == order.Id);
        var secondList = await second.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.DoesNotContain(secondList!, item => item.Id == order.Id);

        var moved = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = secondUser!.Id
        });
        Assert.Equal(secondUser.Id, moved.AssignedDispatcherUserId);

        firstList = await first.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.DoesNotContain(firstList!, item => item.Id == order.Id);
        secondList = await second.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Contains(secondList!, item => item.Id == order.Id);

        var outsider = _factory.CreateClient();
        (await outsider.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"adx_{suffix}",
            Password = "Passw0rd!",
            Name = "外人调度",
            AccountType = "company",
            CompanyName = $"外人公司{suffix}"
        })).EnsureSuccessStatusCode();
        var outsiderUser = await outsider.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var invalid = await _client.PutAsJsonAsync($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = outsiderUser!.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var unchangedDispatcher = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(secondUser.Id, unchangedDispatcher!.AssignedDispatcherUserId);

        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "收回司导" });
        var day = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2036, 8, 4),
            Description = "收回前行程内容",
            EndLocation = "皇后镇",
            DriverId = driver.Id
        });
        Assert.Equal(driver.Id, day.DriverId);
        var activity = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{day.Id}/activities",
            new OrderActivityWriteDto { Content = "收回后应保留的活动" });

        var withDriver = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = firstUser.Id
        });
        Assert.Equal(1, withDriver.AssignedDayCount);
        var listed = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        var listedDay = listed!.Single(item => item.Id == order.Id).Days.Single(item => item.Id == day.Id);
        Assert.Equal(driver.Name, listedDay.DriverName);

        var cleared = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = null
        });
        Assert.Null(cleared.AssignedDispatcherUserId);
        Assert.Equal(0, cleared.AssignedDayCount);
        Assert.All(cleared.Days, item => Assert.Null(item.DriverId));
        var preservedDay = Assert.Single(cleared.Days);
        Assert.Null(preservedDay.AssignedByUserId);
        Assert.Equal("收回前行程内容", preservedDay.Description);
        Assert.Equal("皇后镇", preservedDay.EndLocation);
        Assert.Equal(activity.Id, Assert.Single(preservedDay.Activities).Id);
        Assert.Equal(company.CompanyId, cleared.CompanyId);

        var givenBack = await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = firstUser.Id
        });
        Assert.Equal(firstUser.Id, givenBack.AssignedDispatcherUserId);
        Assert.Equal(0, givenBack.AssignedDayCount);

        await _client.PutAsJsonAsync($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = null
        });

        var createdByDispatcher = await first.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 8, 3),
            GuestCount = 1
        });
        createdByDispatcher.EnsureSuccessStatusCode();
        var own = await createdByDispatcher.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(firstUser.Id, own!.AssignedDispatcherUserId);
        Assert.Null(own.CompanyId);

        var claimed = await PutAsync<OrderReadDto>($"/api/orders/{own.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = firstUser.Id
        });
        Assert.Equal(company.CompanyId, claimed.CompanyId);
        Assert.Equal(firstUser.Id, claimed.AssignedDispatcherUserId);

        var returnedClaim = await PutAsync<OrderReadDto>($"/api/orders/{own.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = null
        });
        Assert.Equal(company.CompanyId, returnedClaim.CompanyId);
        Assert.Null(returnedClaim.AssignedDispatcherUserId);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
        await _client.DeleteAsync($"/api/orders/{own.Id}");
    }

    [Fact]
    public async Task Dispatcher_delete_returns_order_to_company_pool()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"rd_{suffix}",
            Password = "Passw0rd!",
            Name = "退回调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var driverUser = _factory.CreateClient();
        (await driverUser.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"rk_{suffix}",
            Password = "Passw0rd!",
            Name = "看删除司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = dispatcherUser!.Id,
                CompanyId = company!.CompanyId!.Value,
                Role = UserRoles.Dispatcher
            });
            var entity = await db.Users.FindAsync(dispatcherUser.Id);
            entity!.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync();
        }

        var unbound = await dispatcher.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 9, 1),
            GuestCount = 1
        });
        unbound.EnsureSuccessStatusCode();
        var unboundOrder = await unbound.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        var deletedUnbound = await dispatcher.DeleteAsync($"/api/orders/{unboundOrder!.Id}");
        deletedUnbound.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await dispatcher.GetAsync($"/api/orders/{unboundOrder.Id}")).StatusCode);

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 9, 2),
            GuestCount = 2,
            CompanyId = company.CompanyId
        });
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "退回司导" });
        var orderDay = await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2036, 9, 2),
            Description = "退回公司仍保留",
            DriverId = driver.Id
        });
        var activity = await PostAsync<OrderActivityReadDto>(
            $"/api/orders/{order.Id}/days/{orderDay.Id}/activities",
            new OrderActivityWriteDto { Content = "退回后保留活动" });
        await PutAsync<OrderReadDto>($"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });

        Assert.Equal(HttpStatusCode.Forbidden, (await driverUser.DeleteAsync($"/api/orders/{order.Id}")).StatusCode);

        var released = await dispatcher.DeleteAsync($"/api/orders/{order.Id}");
        released.EnsureSuccessStatusCode();

        var pooled = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(company.CompanyId, pooled!.CompanyId);
        Assert.Null(pooled.AssignedDispatcherUserId);
        Assert.Equal(0, pooled.AssignedDayCount);
        Assert.All(pooled.Days, day => Assert.Null(day.DriverId));
        var preservedDay = Assert.Single(pooled.Days);
        Assert.Null(preservedDay.AssignedByUserId);
        Assert.Equal("退回公司仍保留", preservedDay.Description);
        Assert.Equal(activity.Id, Assert.Single(preservedDay.Activities).Id);

        var companyDelete = await _client.DeleteAsync($"/api/orders/{order.Id}");
        companyDelete.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/orders/{order.Id}")).StatusCode);
    }

    [Fact]
    public async Task Company_dispatcher_notes_are_hidden_from_dispatcher()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"dn_{suffix}",
            Password = "Passw0rd!",
            Name = "备注调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var company = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = dispatcherUser!.Id,
                CompanyId = company!.CompanyId!.Value,
                Role = UserRoles.Dispatcher
            });
            var user = await db.Users.FindAsync(dispatcherUser.Id);
            user!.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync();
        }

        var saved = await PutAsync<CompanyHomeDto>($"/api/company/dispatchers/{dispatcherUser!.Id}/notes", new DispatcherNoteWriteDto
        {
            Notes = "公司给调度的备注"
        });
        var member = saved.Desk!.Dispatchers.Single(item => item.UserId == dispatcherUser.Id);
        Assert.Equal("公司给调度的备注", member.Notes);

        var asDispatcher = await dispatcher.GetFromJsonAsync<CompanyHomeDto>("/api/company", JsonOptions);
        Assert.DoesNotContain(asDispatcher!.Desk!.Dispatchers, item => item.UserId == dispatcherUser.Id && item.Notes == "公司给调度的备注");

        var forbidden = await dispatcher.PutAsJsonAsync($"/api/company/dispatchers/{dispatcherUser.Id}/notes", new DispatcherNoteWriteDto
        {
            Notes = "调度自己改"
        });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var stillCompany = await _client.GetFromJsonAsync<CompanyHomeDto>("/api/company", JsonOptions);
        Assert.Equal("公司给调度的备注", stillCompany!.Desk!.Dispatchers.Single(item => item.UserId == dispatcherUser.Id).Notes);
    }

    [Fact]
    public async Task Dispatcher_can_rebind_order_company()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var firstCompany = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        var other = _factory.CreateClient();
        (await other.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"firm2_{suffix}",
            Password = "Passw0rd!",
            Name = "第二公司",
            AccountType = "company",
            CompanyName = $"改绑公司{suffix}"
        })).EnsureSuccessStatusCode();
        var secondCompany = await other.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"bind_{suffix}",
            Password = "Passw0rd!",
            Name = "改绑调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = dispatcherUser!.Id,
                CompanyId = firstCompany!.CompanyId!.Value,
                Role = UserRoles.Dispatcher
            });
            var user = await db.Users.FindAsync(dispatcherUser.Id);
            user!.Role = UserRoles.Dispatcher;
            await db.SaveChangesAsync();
        }

        var created = await dispatcher.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 9, 4),
            GuestCount = 1
        });
        created.EnsureSuccessStatusCode();
        var unbound = await created.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Null(unbound!.CompanyId);
        Assert.Equal(dispatcherUser.Id, unbound.AssignedDispatcherUserId);

        var bound = await dispatcher.PutAsJsonAsync($"/api/orders/{unbound.Id}", new OrderWriteDto
        {
            StartDate = unbound.StartDate,
            GuestCount = unbound.GuestCount,
            CompanyId = firstCompany!.CompanyId
        });
        bound.EnsureSuccessStatusCode();
        var order = await bound.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(firstCompany!.CompanyId, order!.CompanyId);

        var missingCompany = await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            CompanyId = Guid.NewGuid()
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingCompany.StatusCode);
        var afterMissingCompany = await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(firstCompany.CompanyId, afterMissingCompany!.CompanyId);
        Assert.Equal(dispatcherUser.Id, afterMissingCompany.AssignedDispatcherUserId);

        var firstList = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Contains(firstList!, item => item.Id == order.Id);
        var secondList = await other.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.DoesNotContain(secondList!, item => item.Id == order.Id);

        var moved = await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            CompanyId = secondCompany!.CompanyId
        });
        moved.EnsureSuccessStatusCode();
        var rebound = await moved.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(secondCompany.CompanyId, rebound!.CompanyId);
        Assert.Equal("改绑公司" + suffix, rebound.CompanyName);

        firstList = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.DoesNotContain(firstList!, item => item.Id == order.Id);
        secondList = await other.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Contains(secondList!, item => item.Id == order.Id);

        var blocked = await other.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            CompanyId = firstCompany.CompanyId
        });
        blocked.EnsureSuccessStatusCode();
        var stillSecond = await blocked.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(secondCompany.CompanyId, stillSecond!.CompanyId);

        var unboundAgain = await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            CompanyId = null
        });
        unboundAgain.EnsureSuccessStatusCode();
        var unboundRead = await unboundAgain.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Null(unboundRead!.CompanyId);

        var companyCreated = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2036, 9, 5),
            GuestCount = 2
        });
        Assert.Equal(firstCompany.CompanyId, companyCreated.CompanyId);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
        await _client.DeleteAsync($"/api/orders/{companyCreated.Id}");
    }

    [Fact]
    public async Task Negative_guest_count_is_rejected()
    {
        var response = await _client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 12),
            GuestCount = -1
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Company_abbreviation_is_private_and_shown_on_the_drivers_order()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"abbr_{suffix}",
            Password = "Passw0rd!",
            Name = "缩写司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = driverUser!.Id,
                CompanyId = company!.CompanyId!.Value,
                Role = UserRoles.Driver
            });
            await db.SaveChangesAsync();
        }

        var saved = await driver.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = company!.CompanyId!.Value,
            Notes = " 北 "
        });
        saved.EnsureSuccessStatusCode();
        var driverDesk = await saved.Content.ReadFromJsonAsync<CompanyHomeDto>(JsonOptions);
        Assert.Equal("北", driverDesk!.Desk!.Notes);
        Assert.Equal(company!.CompanyName, driverDesk.Desk.Name);
        Assert.Equal("北", driverDesk.Companies.Single(item => item.Id == company.CompanyId).Notes);

        var companyDesk = await _client.GetFromJsonAsync<CompanyHomeDto>("/api/company", JsonOptions);
        Assert.Equal(company!.CompanyName![..2], companyDesk!.Desk!.Notes);
        Assert.Equal(company.CompanyName, companyDesk.Desk.Name);
        Assert.Equal(company.CompanyName![..2], companyDesk.Companies.Single(item => item.Id == company.CompanyId).Notes);

        var stranger = _factory.CreateClient();
        (await stranger.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"outsider_{suffix}",
            Password = "Passw0rd!",
            Name = "外人",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var denied = await stranger.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = company.CompanyId!.Value,
            Notes = "偷看"
        });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var tooLong = await driver.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = company.CompanyId.Value,
            Notes = new string('岛', 21)
        });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 12, 2),
            GuestCount = 1
        });
        (await _client.PostAsJsonAsync($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 12, 2),
            DriverId = driverUser!.DriverId
        })).EnsureSuccessStatusCode();

        var driverOrders = await driver.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Equal("北", driverOrders!.Single(item => item.Id == order.Id).CompanyNote);
        var companyOrders = await _client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        Assert.Equal(company.CompanyName![..2], companyOrders!.Single(item => item.Id == order.Id).CompanyNote);

        var cleared = await driver.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = company.CompanyId.Value,
            Notes = " "
        });
        cleared.EnsureSuccessStatusCode();
        var afterClear = await cleared.Content.ReadFromJsonAsync<CompanyHomeDto>(JsonOptions);
        Assert.Equal(company.CompanyName![..2], afterClear!.Desk!.Notes);
    }

    [Fact]
    public async Task Driver_who_took_company_orders_can_switch_those_companies()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var north = await _client.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);
        var southClient = _factory.CreateClient();
        (await southClient.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"south_{suffix}",
            Password = "Passw0rd!",
            Name = "南岛管理",
            AccountType = "company",
            CompanyName = $"南岛公司{suffix}"
        })).EnsureSuccessStatusCode();
        var south = await southClient.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"took_{suffix}",
            Password = "Passw0rd!",
            Name = "接单司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me", JsonOptions);

        async Task AssignAsync(HttpClient company, Guid companyId)
        {
            var created = await company.PostAsJsonAsync("/api/orders", new OrderWriteDto
            {
                StartDate = new DateOnly(2026, 12, 8),
                GuestCount = 1,
                CompanyId = companyId
            });
            created.EnsureSuccessStatusCode();
            var order = await created.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
            (await company.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = new DateOnly(2026, 12, 8),
                DriverId = driverUser!.DriverId
            })).EnsureSuccessStatusCode();
        }

        (await _client.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = north!.CompanyId!.Value,
            Notes = "官称"
        })).EnsureSuccessStatusCode();

        await AssignAsync(_client, north.CompanyId!.Value);
        await AssignAsync(southClient, south!.CompanyId!.Value);

        var home = await driver.GetFromJsonAsync<CompanyHomeDto>("/api/company", JsonOptions);
        Assert.Contains(home!.Companies, item => item.Id == north.CompanyId);
        Assert.Contains(home.Companies, item => item.Id == south.CompanyId);

        var switched = await driver.GetFromJsonAsync<CompanyHomeDto>(
            $"/api/company?companyId={north.CompanyId}",
            JsonOptions);
        Assert.Equal(north.CompanyId, switched!.Desk!.Id);
        Assert.Equal("官称", switched.Desk.Notes);
        var southDesk = await driver.GetFromJsonAsync<CompanyHomeDto>(
            $"/api/company?companyId={south.CompanyId}",
            JsonOptions);
        Assert.Equal(south.CompanyName![..2], southDesk!.Desk!.Notes);

        var kept = await driver.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = north.CompanyId.Value,
            Notes = "北"
        });
        kept.EnsureSuccessStatusCode();
        var again = await driver.GetFromJsonAsync<CompanyHomeDto>(
            $"/api/company?companyId={north.CompanyId}",
            JsonOptions);
        Assert.Equal("北", again!.Desk!.Notes);
        Assert.Equal("官称", (await _client.GetFromJsonAsync<CompanyHomeDto>("/api/company", JsonOptions))!.Desk!.Notes);

        (await _client.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = north.CompanyId.Value,
            Notes = "新称"
        })).EnsureSuccessStatusCode();
        Assert.Equal("北", (await driver.GetFromJsonAsync<CompanyHomeDto>(
            $"/api/company?companyId={north.CompanyId}",
            JsonOptions))!.Desk!.Notes);

        var cleared = await driver.PutAsJsonAsync("/api/company/notes", new CompanyNoteWriteDto
        {
            CompanyId = north.CompanyId.Value,
            Notes = " "
        });
        cleared.EnsureSuccessStatusCode();
        Assert.Equal("新称", (await cleared.Content.ReadFromJsonAsync<CompanyHomeDto>(JsonOptions))!.Desk!.Notes);
    }

    private async Task<T> PostAsync<T>(string url, object body)
    {
        var response = await _client.PostAsJsonAsync(url, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }

    private async Task<T> PutAsync<T>(string url, object body)
    {
        var response = await _client.PutAsJsonAsync(url, body);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"{(int)response.StatusCode} {response.ReasonPhrase} for PUT {url}: {detail}");
        }

        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }

    private Task<HttpResponseMessage> PostRawAsync(string url, string json)
    {
        return _client.PostAsync(url, new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
    }
}
