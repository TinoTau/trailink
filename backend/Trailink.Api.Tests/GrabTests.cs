using System.Net;
using System.Net.Http.Json;
using Trailink.Api.DTOs;
using Trailink.Api.Services;

namespace Trailink.Api.Tests;

public class GrabTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public GrabTests(ApiFactory factory)
    {
        _factory = factory;
    }

    private sealed record Party(HttpClient Client, SessionUserDto Me);

    private async Task<Party> RegisterAsync(string prefix, string name, string type = "driver", string? company = null)
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        await TestAuth.RegisterAsync(client, $"{prefix}_{suffix}", name, type, company is null ? null : $"{company}{suffix}");
        var me = await client.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        return new Party(client, me!);
    }

    /// <summary>司导向 target（调度员或公司账户）申请，target 批准。</summary>
    private static async Task BecomeDriverOfAsync(Party driver, Party target)
    {
        (await driver.Client.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto { DispatcherUserId = target.Me.Id })).EnsureSuccessStatusCode();
        var incoming = await target.Client.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        var mine = incoming!.Single(item => item.UserId == driver.Me.Id);
        (await target.Client.PostAsJsonAsync($"/api/dispatchers/applications/{mine.Id}/approve", new { })).EnsureSuccessStatusCode();
    }

    private static async Task<OrderReadDto> CreateOrderAsync(Party dispatcher, Guid? companyId, DateOnly start, int days)
    {
        var created = await (await dispatcher.Client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"G-{Guid.NewGuid():N}"[..10],
            StartDate = start,
            GuestCount = 4,
            CompanyId = companyId,
            SharedNotes = "只有接到的人能看",
        })).Content.ReadFromJsonAsync<OrderReadDto>();
        for (var i = 0; i < days; i++)
        {
            (await dispatcher.Client.PostAsJsonAsync($"/api/orders/{created!.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = start.AddDays(i),
                EndLocation = "特卡波",
            })).EnsureSuccessStatusCode();
        }

        return (await dispatcher.Client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created!.Id}"))!;
    }

    private static Task<HttpResponseMessage> SetLevelAsync(Party who, Guid orderId, int level) =>
        who.Client.PutAsJsonAsync($"/api/orders/{orderId}/share-level", new ShareLevelWriteDto { ShareLevel = level });

    private static async Task<List<GrabOrderDto>> ListAsync(Party who) =>
        (await who.Client.GetFromJsonAsync<List<GrabOrderDto>>("/api/grab"))!;

    private static Task<HttpResponseMessage> GrabAsync(Party who, GrabOrderDto item) =>
        who.Client.PostAsJsonAsync($"/api/grab/{item.OrderId}", new GrabWriteDto { DayIds = [.. item.Days.Select(day => day.Id)] });

    private async Task<(Party Company, Party Dispatcher)> CompanyWithDispatcherAsync()
    {
        var company = await RegisterAsync("gco", "抢单公司", "company", "抢单公司");
        var dispatcher = await RegisterAsync("gdi", "抢单调度");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcher.Me.Id, company.Me.CompanyId!.Value);
        return (company, dispatcher);
    }

    [Fact]
    public async Task Share_levels_decide_who_sees_the_order()
    {
        var (company, dispatcher) = await CompanyWithDispatcherAsync();
        var companyId = company.Me.CompanyId!.Value;
        var own = await RegisterAsync("gown", "自己的司导");
        await BecomeDriverOfAsync(own, dispatcher);
        var colleague = await RegisterAsync("gcol", "公司的司导");
        await BecomeDriverOfAsync(colleague, company);
        var stranger = await RegisterAsync("gstr", "陌生司导");

        var start = BusinessDate.Today.AddDays(40);
        var order = await CreateOrderAsync(dispatcher, companyId, start, 2);
        Assert.Equal(0, order.ShareLevel);
        Assert.True(order.CanSetShareLevel);

        // 调度自留：不放出，自己的司导、公司的司导、陌生人、调度员自己都看不到。
        Assert.DoesNotContain(await ListAsync(own), item => item.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(colleague), item => item.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(stranger), item => item.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(dispatcher), item => item.OrderId == order.Id);
        var ownGrab = await own.Client.PostAsJsonAsync($"/api/grab/{order.Id}", new GrabWriteDto { DayIds = [.. order.Days.Select(day => day.Id)] });
        Assert.Equal(HttpStatusCode.NotFound, ownGrab.StatusCode);

        // 隐藏（拉黑）自己的司导，用于下面的公司内部、面向所有人。
        (await dispatcher.Client.PutAsJsonAsync($"/api/drivers/{own.Me.DriverId}/hidden", new DriverHiddenWriteDto { Hidden = true })).EnsureSuccessStatusCode();

        // 这张单的调度员和所属公司能改等级；别的人不能。
        var companyView = await company.Client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}");
        Assert.True(companyView!.CanSetShareLevel);
        Assert.Equal(1, (await (await SetLevelAsync(company, order.Id, 1)).Content.ReadFromJsonAsync<OrderReadDto>())!.ShareLevel);
        (await SetLevelAsync(company, order.Id, 0)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await SetLevelAsync(colleague, order.Id, 1)).StatusCode);
        var otherCompany = await RegisterAsync("gox", "别家公司", "company", "别家公司");
        Assert.Equal(HttpStatusCode.Forbidden, (await SetLevelAsync(otherCompany, order.Id, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await SetLevelAsync(dispatcher, order.Id, 3)).StatusCode);

        // 公司内部：公司的司导看得到，陌生人看不到，被隐藏的看不到。
        var internalOrder = await (await SetLevelAsync(dispatcher, order.Id, 1)).Content.ReadFromJsonAsync<OrderReadDto>();
        Assert.Equal(1, internalOrder!.ShareLevel);
        // 内容不带公司订单号和共用备注。
        var seen = (await ListAsync(colleague)).Single(item => item.OrderId == order.Id && item.ShareLevel == 1);
        Assert.Equal(2, seen.Days.Count);
        Assert.Equal("抢单调度", seen.DispatcherName);
        Assert.StartsWith("抢单公司", seen.CompanyName);
        Assert.DoesNotContain("只有接到的人能看", System.Text.Json.JsonSerializer.Serialize(seen));
        Assert.DoesNotContain(await ListAsync(stranger), item => item.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(own), item => item.OrderId == order.Id);

        // 面向所有人：陌生人看得到；被隐藏（拉黑）的仍看不到，恢复后又能看到。
        (await SetLevelAsync(dispatcher, order.Id, 2)).EnsureSuccessStatusCode();
        Assert.Contains(await ListAsync(stranger), item => item.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(own), item => item.OrderId == order.Id);
        (await dispatcher.Client.PutAsJsonAsync($"/api/drivers/{own.Me.DriverId}/hidden", new DriverHiddenWriteDto { Hidden = false })).EnsureSuccessStatusCode();
        Assert.Contains(await ListAsync(own), item => item.OrderId == order.Id);
        // 拉黑的人也不能直接接单。
        (await dispatcher.Client.PutAsJsonAsync($"/api/drivers/{own.Me.DriverId}/hidden", new DriverHiddenWriteDto { Hidden = true })).EnsureSuccessStatusCode();
        var blocked = await own.Client.PostAsJsonAsync($"/api/grab/{order.Id}", new GrabWriteDto { DayIds = [.. order.Days.Select(day => day.Id)] });
        Assert.Equal(HttpStatusCode.NotFound, blocked.StatusCode);

        // 没绑公司的单只能调度自留；解绑公司后回到调度自留。
        var loose = await CreateOrderAsync(dispatcher, null, start.AddDays(10), 1);
        Assert.Equal(HttpStatusCode.BadRequest, (await SetLevelAsync(dispatcher, loose.Id, 2)).StatusCode);
        var unbound = await (await dispatcher.Client.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            PlatformOrderNo = order.PlatformOrderNo,
            StartDate = order.StartDate,
            GuestCount = order.GuestCount,
            CompanyId = null,
        })).Content.ReadFromJsonAsync<OrderReadDto>();
        Assert.Equal(0, unbound!.ShareLevel);
    }

    private static async Task<List<OrderClaimDto>> ClaimsAsync(Party who) =>
        (await who.Client.GetFromJsonAsync<List<OrderClaimDto>>("/api/grab/claims"))!;

    private static Task<HttpResponseMessage> ConfirmAsync(Party who, Guid orderId, Guid driverId) =>
        who.Client.PostAsJsonAsync($"/api/grab/{orderId}/confirm", new ConfirmClaimDto { DriverId = driverId });

    [Fact]
    public async Task Returning_an_order_to_the_company_drops_its_pending_claims()
    {
        var (company, dispatcher) = await CompanyWithDispatcherAsync();
        var driver = await RegisterAsync("grt", "抢了被退回的单");
        var start = BusinessDate.Today.AddDays(70);
        var order = await CreateOrderAsync(dispatcher, company.Me.CompanyId!.Value, start, 2);
        (await SetLevelAsync(dispatcher, order.Id, 2)).EnsureSuccessStatusCode();
        var item = (await ListAsync(driver)).Single(entry => entry.OrderId == order.Id);
        (await GrabAsync(driver, item)).EnsureSuccessStatusCode();
        Assert.Contains(await ClaimsAsync(dispatcher), claim => claim.OrderId == order.Id);

        // 调度员「删除」公司的单 = 退回公司：自己的列表、待确认抢单、抢单池里都不再有它。
        (await dispatcher.Client.DeleteAsync($"/api/orders/{order.Id}")).EnsureSuccessStatusCode();
        Assert.DoesNotContain(await ClaimsAsync(dispatcher), claim => claim.OrderId == order.Id);
        Assert.DoesNotContain(await ClaimsAsync(company), claim => claim.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(driver), entry => entry.OrderId == order.Id);
        var board = await dispatcher.Client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders");
        Assert.DoesNotContain(board!, entry => entry.Id == order.Id);
        var companyList = await company.Client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders");
        var kept = companyList!.Single(entry => entry.Id == order.Id);
        Assert.Null(kept.AssignedDispatcherUserId);
        Assert.Equal(HttpStatusCode.Forbidden, (await dispatcher.Client.PutAsJsonAsync($"/api/orders/{order.Id}/dates", new OrderDatesWriteDto
        {
            StartDate = start.AddDays(1),
            EndDate = start.AddDays(2),
        })).StatusCode);
    }

    [Fact]
    public async Task Company_releasing_a_pool_order_takes_it_onto_its_own_desk()
    {
        var company = await RegisterAsync("gpc", "放池公司", "company", "放池公司");
        var driver = await RegisterAsync("gpd", "抢池单");
        var start = BusinessDate.Today.AddDays(80);
        // 派给调度里建的单：没有调度员，在公司订单池里。
        var order = await CreateOrderAsync(company, company.Me.CompanyId!.Value, start, 2);
        Assert.Null(order.AssignedDispatcherUserId);

        var released = await (await SetLevelAsync(company, order.Id, 2)).Content.ReadFromJsonAsync<OrderReadDto>();
        Assert.Equal(company.Me.Id, released!.AssignedDispatcherUserId);
        var desk = await company.Client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders?desk=true");
        Assert.Contains(desk!, entry => entry.Id == order.Id);

        var item = (await ListAsync(driver)).Single(entry => entry.OrderId == order.Id);
        (await GrabAsync(driver, item)).EnsureSuccessStatusCode();
        Assert.Contains(await ClaimsAsync(company), claim => claim.OrderId == order.Id && claim.DriverId == driver.Me.DriverId);
        (await ConfirmAsync(company, order.Id, driver.Me.DriverId!.Value)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Company_account_unbinds_its_own_driver_on_its_desk()
    {
        var company = await RegisterAsync("gub", "解绑公司", "company", "解绑公司");
        var driver = await RegisterAsync("gud", "公司的司导");
        await BecomeDriverOfAsync(driver, company);
        Assert.Contains((await company.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, item => item.Id == driver.Me.DriverId);

        (await company.Client.DeleteAsync($"/api/dispatchers/drivers/{driver.Me.DriverId}")).EnsureSuccessStatusCode();
        Assert.DoesNotContain((await company.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, item => item.Id == driver.Me.DriverId);
        Assert.Equal(HttpStatusCode.BadRequest, (await company.Client.DeleteAsync($"/api/dispatchers/drivers/{company.Me.DriverId}")).StatusCode);
    }

    [Fact]
    public async Task Several_drivers_claim_and_the_dispatcher_confirms_one()
    {
        var (company, dispatcher) = await CompanyWithDispatcherAsync();
        var companyId = company.Me.CompanyId!.Value;
        var stranger = await RegisterAsync("gtk", "抢公开单");
        var second = await RegisterAsync("gsc", "也来抢");
        var own = await RegisterAsync("gow", "已派的司导");
        await BecomeDriverOfAsync(own, dispatcher);

        var start = BusinessDate.Today.AddDays(60);
        var order = await CreateOrderAsync(dispatcher, companyId, start, 3);
        // 第一天先派给自己的司导：拆单，剩下两天放出去。
        var first = order.Days[0];
        (await dispatcher.Client.PutAsJsonAsync($"/api/orders/{order.Id}/days/{first.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = first.ServiceDate,
            EndLocation = first.EndLocation,
            DriverId = own.Me.DriverId,
        })).EnsureSuccessStatusCode();
        (await SetLevelAsync(dispatcher, order.Id, 2)).EnsureSuccessStatusCode();

        // 陌生司导自己第三天已有行程：列表标出冲突，抢单被拒。
        var mine = await (await stranger.Client.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = start.AddDays(2), GuestCount = 1 })).Content.ReadFromJsonAsync<OrderReadDto>();
        var mineDay = await (await stranger.Client.PostAsJsonAsync($"/api/orders/{mine!.Id}/days", new ItineraryDayWriteDto { ServiceDate = start.AddDays(2), DriverId = stranger.Me.DriverId })).Content.ReadFromJsonAsync<ItineraryDayReadDto>();
        var item = (await ListAsync(stranger)).Single(entry => entry.OrderId == order.Id);
        Assert.Equal(3, item.TotalDayCount);
        Assert.Equal([start.AddDays(1), start.AddDays(2)], item.Days.Select(day => day.ServiceDate));
        Assert.Equal(start.AddDays(2), Assert.Single(item.Conflicts).ServiceDate);
        Assert.Equal(HttpStatusCode.Conflict, (await GrabAsync(stranger, item)).StatusCode);

        // 不能只抢其中几天。
        var partial = await stranger.Client.PostAsJsonAsync($"/api/grab/{order.Id}", new GrabWriteDto { DayIds = [item.Days[0].Id] });
        Assert.Equal(HttpStatusCode.Conflict, partial.StatusCode);

        // 取消冲突的那一天后可以抢；抢了还没派，订单仍在列表里，标着已抢。另一个人也能抢。
        (await stranger.Client.PutAsJsonAsync($"/api/orders/{mine.Id}/days/{mineDay!.Id}", new ItineraryDayWriteDto { ServiceDate = start.AddDays(2), DriverId = null })).EnsureSuccessStatusCode();
        (await GrabAsync(stranger, item)).EnsureSuccessStatusCode();
        (await GrabAsync(stranger, item)).EnsureSuccessStatusCode();
        Assert.True((await ListAsync(stranger)).Single(entry => entry.OrderId == order.Id).ClaimedByMe);
        (await GrabAsync(second, (await ListAsync(second)).Single(entry => entry.OrderId == order.Id))).EnsureSuccessStatusCode();
        var still = await dispatcher.Client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}");
        Assert.All(still!.Days.Skip(1), day => Assert.Null(day.DriverId));

        // 调度员看到两条待确认；单子在调度员的调度台上，公司账户的调度台不列出。陌生司导的日历、头像接口对调度员开放。
        var claims = await ClaimsAsync(dispatcher);
        Assert.Equal(2, claims.Count(claim => claim.OrderId == order.Id));
        Assert.Contains(claims, claim => claim.DriverId == stranger.Me.DriverId && claim.DriverName == "抢公开单" && !claim.InRoster);
        Assert.DoesNotContain(await ClaimsAsync(company), claim => claim.OrderId == order.Id);
        Assert.Empty(await ClaimsAsync(own));
        (await dispatcher.Client.GetAsync($"/api/drivers/{stranger.Me.DriverId}")).EnsureSuccessStatusCode();
        var trip = await (await stranger.Client.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = start.AddDays(20), GuestCount = 1 })).Content.ReadFromJsonAsync<OrderReadDto>();
        await stranger.Client.PostAsJsonAsync($"/api/orders/{trip!.Id}/days", new ItineraryDayWriteDto { ServiceDate = start.AddDays(20), DriverId = stranger.Me.DriverId });
        Assert.Contains((await dispatcher.Client.GetFromJsonAsync<List<OrderReadDto>>($"/api/orders?driverId={stranger.Me.DriverId}"))!, entry => entry.Id == trip.Id);
        Assert.DoesNotContain((await dispatcher.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, driver => driver.Id == stranger.Me.DriverId);

        // 撤回后不再列出；再抢回来。
        (await second.Client.DeleteAsync($"/api/grab/{order.Id}")).EnsureSuccessStatusCode();
        Assert.Single(await ClaimsAsync(dispatcher), claim => claim.OrderId == order.Id);
        (await GrabAsync(second, (await ListAsync(second)).Single(entry => entry.OrderId == order.Id))).EnsureSuccessStatusCode();

        // 别人不能确认；没抢的人不能被确认。
        Assert.Equal(HttpStatusCode.Forbidden, (await ConfirmAsync(own, order.Id, stranger.Me.DriverId!.Value)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ConfirmAsync(dispatcher, order.Id, own.Me.DriverId!.Value)).StatusCode);

        // 调度员确认陌生司导：两天派给他，派出人是调度员；抢单清空，等级回到调度自留；成了调度员和公司的司导。
        (await ConfirmAsync(dispatcher, order.Id, stranger.Me.DriverId.Value)).EnsureSuccessStatusCode();
        var after = await dispatcher.Client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}");
        Assert.Equal(0, after!.ShareLevel);
        Assert.All(after.Days.Skip(1), day =>
        {
            Assert.Equal(stranger.Me.DriverId, day.DriverId);
            Assert.Equal(dispatcher.Me.Id, day.AssignedByUserId);
        });
        Assert.DoesNotContain(await ClaimsAsync(dispatcher), claim => claim.OrderId == order.Id);
        Assert.DoesNotContain(await ListAsync(second), entry => entry.OrderId == order.Id);
        Assert.Contains((await dispatcher.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, driver => driver.Id == stranger.Me.DriverId);
        Assert.Contains((await company.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, driver => driver.Id == stranger.Me.DriverId);
        Assert.Contains((await stranger.Client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders"))!, entry => entry.Id == order.Id);
    }

    [Fact]
    public async Task Confirm_rechecks_conflicts_and_blocked_claims_disappear()
    {
        var (company, dispatcher) = await CompanyWithDispatcherAsync();
        var colleague = await RegisterAsync("gin", "公司内部司导");
        await BecomeDriverOfAsync(colleague, company);
        var start = BusinessDate.Today.AddDays(80);
        var order = await CreateOrderAsync(dispatcher, company.Me.CompanyId, start, 2);
        (await SetLevelAsync(dispatcher, order.Id, 1)).EnsureSuccessStatusCode();
        var item = (await ListAsync(colleague)).Single(entry => entry.OrderId == order.Id);

        // 调度员在司导看着列表时又加了一天：司导手里的日期和现在的不一样，要刷新。
        await dispatcher.Client.PostAsJsonAsync($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto { ServiceDate = start.AddDays(2) });
        var stale = await GrabAsync(colleague, item);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("刷新", await stale.Content.ReadAsStringAsync());
        var fresh = (await ListAsync(colleague)).Single(entry => entry.OrderId == order.Id);
        Assert.Equal(3, fresh.Days.Count);
        (await GrabAsync(colleague, fresh)).EnsureSuccessStatusCode();

        // 抢单之后司导又接了别的行程：确认时被拒。
        var other = await (await colleague.Client.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = start, GuestCount = 1 })).Content.ReadFromJsonAsync<OrderReadDto>();
        var otherDay = await (await colleague.Client.PostAsJsonAsync($"/api/orders/{other!.Id}/days", new ItineraryDayWriteDto { ServiceDate = start, DriverId = colleague.Me.DriverId })).Content.ReadFromJsonAsync<ItineraryDayReadDto>();
        Assert.Equal(HttpStatusCode.Conflict, (await ConfirmAsync(dispatcher, order.Id, colleague.Me.DriverId!.Value)).StatusCode);
        (await colleague.Client.PutAsJsonAsync($"/api/orders/{other.Id}/days/{otherDay!.Id}", new ItineraryDayWriteDto { ServiceDate = start, DriverId = null })).EnsureSuccessStatusCode();

        // 调度员拉黑后，这条抢单不再列给他；恢复后又出现。公司账户也能确认。
        (await dispatcher.Client.PutAsJsonAsync($"/api/drivers/{colleague.Me.DriverId}/hidden", new DriverHiddenWriteDto { Hidden = true })).EnsureSuccessStatusCode();
        Assert.Empty(await ClaimsAsync(dispatcher));
        (await dispatcher.Client.PutAsJsonAsync($"/api/drivers/{colleague.Me.DriverId}/hidden", new DriverHiddenWriteDto { Hidden = false })).EnsureSuccessStatusCode();
        Assert.Single(await ClaimsAsync(dispatcher));
        (await ConfirmAsync(company, order.Id, colleague.Me.DriverId.Value)).EnsureSuccessStatusCode();
        Assert.Contains((await dispatcher.Client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers"))!, driver => driver.Id == colleague.Me.DriverId);
    }
}
