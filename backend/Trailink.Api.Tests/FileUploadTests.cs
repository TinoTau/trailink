using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using Trailink.Api.DTOs;
using Trailink.Api.Services;

namespace Trailink.Api.Tests;

public class FileUploadTests : IClassFixture<ApiFactory>
{
    private static readonly byte[] PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private readonly ApiFactory _factory;

    public FileUploadTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Avatar_qr_ticket_and_order_screenshot_use_one_store()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"file_{suffix}",
            Password = "Passw0rd!",
            Name = "文件用户",
            AccountType = "company",
            CompanyName = $"文件公司{suffix}"
        });
        registered.EnsureSuccessStatusCode();
        var session = await registered.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.False(session!.HasAvatar);

        var avatar = await client.PostAsync("/api/auth/avatar", ImageForm("avatar.png"));
        avatar.EnsureSuccessStatusCode();
        var afterAvatar = await avatar.Content.ReadFromJsonAsync<SessionUserDto>();
        Assert.True(afterAvatar!.HasAvatar);

        var avatarGet = await client.GetAsync("/api/auth/avatar");
        avatarGet.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", avatarGet.Content.Headers.ContentType?.MediaType);

        var qr = await client.PostAsync("/api/company/qr", ImageForm("qr.png", session.CompanyId!.Value));
        qr.EnsureSuccessStatusCode();
        var home = await qr.Content.ReadFromJsonAsync<CompanyHomeDto>();
        Assert.True(home!.Desk!.HasQr);

        var qrGet = await client.GetAsync($"/api/company/{session.CompanyId}/qr");
        qrGet.EnsureSuccessStatusCode();

        var order = await client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 12, 1),
            GuestCount = 2
        });
        order.EnsureSuccessStatusCode();
        var createdOrder = await order.Content.ReadFromJsonAsync<OrderReadDto>();

        var screenshot = await client.PostAsync($"/api/orders/{createdOrder!.Id}/files", ImageForm("shot.png"));
        screenshot.EnsureSuccessStatusCode();
        var stored = await screenshot.Content.ReadFromJsonAsync<OrderFileReadDto>();
        Assert.Equal("shot.png", stored!.FileName);

        var fileGet = await client.GetAsync($"/api/orders/{createdOrder.Id}/files/{stored.Id}");
        fileGet.EnsureSuccessStatusCode();
        var files = await client.GetFromJsonAsync<List<OrderFileReadDto>>($"/api/orders/{createdOrder.Id}/files");
        Assert.Equal(stored.Id, Assert.Single(files!).Id);

        var day = await client.PostAsJsonAsync($"/api/orders/{createdOrder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2026, 12, 1)
        });
        day.EnsureSuccessStatusCode();
        var createdDay = await day.Content.ReadFromJsonAsync<ItineraryDayReadDto>();

        var activity = await client.PostAsJsonAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay!.Id}/activities",
            new OrderActivityWriteDto { Content = "缆车" });
        activity.EnsureSuccessStatusCode();
        var createdActivity = await activity.Content.ReadFromJsonAsync<OrderActivityReadDto>();
        Assert.Null(createdActivity!.TicketPath);

        var ticket = await client.PostAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}/ticket",
            ImageForm("ticket.png"));
        ticket.EnsureSuccessStatusCode();
        var withTicket = await ticket.Content.ReadFromJsonAsync<OrderActivityReadDto>();
        Assert.StartsWith("files/tickets/", withTicket!.TicketPath);

        var updated = await client.PutAsJsonAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}",
            new OrderActivityWriteDto { Content = "天空缆车" });
        updated.EnsureSuccessStatusCode();
        var stillTicket = await updated.Content.ReadFromJsonAsync<OrderActivityReadDto>();
        Assert.Equal(withTicket.TicketPath, stillTicket!.TicketPath);
        Assert.Equal("天空缆车", stillTicket.Content);

        var ticketGet = await client.GetAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}/ticket");
        ticketGet.EnsureSuccessStatusCode();

        var deleteTicket = await client.DeleteAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}/ticket");
        Assert.Equal(HttpStatusCode.NoContent, deleteTicket.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(
                $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}/ticket")).StatusCode);
        var withoutTicket = await client.GetFromJsonAsync<List<OrderActivityReadDto>>(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities");
        Assert.Null(Assert.Single(withoutTicket!).TicketPath);

        var deleteFile = await client.DeleteAsync($"/api/orders/{createdOrder.Id}/files/{stored.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteFile.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<OrderFileReadDto>>(
            $"/api/orders/{createdOrder.Id}/files"))!);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/orders/{createdOrder.Id}/files/{stored.Id}")).StatusCode);

        var deleteDay = await client.DeleteAsync($"/api/orders/{createdOrder.Id}/days/{createdDay.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteDay.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<ItineraryDayReadDto>>(
            $"/api/orders/{createdOrder.Id}/days"))!);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(
                $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities")).StatusCode);

        var rejected = await client.PostAsync("/api/auth/avatar", TextForm("note.txt"));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
    }

    [Fact]
    public async Task Avatar_is_resized_and_compressed()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"av_{suffix}",
            Password = "Passw0rd!",
            Name = "压缩头像",
            AccountType = "driver"
        });
        registered.EnsureSuccessStatusCode();

        using var source = new SKBitmap(800, 600);
        source.Erase(new SKColor(30, 120, 200));
        using var rawData = source.Encode(SKEncodedImageFormat.Png, 100);
        var raw = rawData.ToArray();

        var uploaded = await client.PostAsync("/api/auth/avatar", ImageForm("big.png", raw));
        uploaded.EnsureSuccessStatusCode();

        var stored = await client.GetAsync("/api/auth/avatar");
        stored.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", stored.Content.Headers.ContentType?.MediaType);
        var bytes = await stored.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length < 20_000);

        using var compressed = SKBitmap.Decode(bytes);
        Assert.Equal(AvatarImage.MaxEdge, compressed.Width);
        Assert.Equal(192, compressed.Height);
    }

    [Fact]
    public async Task Replacing_avatar_deletes_previous_file()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"rep_{suffix}",
            Password = "Passw0rd!",
            Name = "覆盖头像",
            AccountType = "driver"
        });
        registered.EnsureSuccessStatusCode();
        var session = await registered.Content.ReadFromJsonAsync<SessionUserDto>();

        var first = await client.PostAsync("/api/auth/avatar", ImageForm("first.png"));
        first.EnsureSuccessStatusCode();

        var env = _factory.Services.GetRequiredService<IWebHostEnvironment>();
        var folder = Path.Combine(env.ContentRootPath, "App_Data", "files", "avatars");
        var leftover = Path.Combine(folder, $"{session!.Id:D}.png");
        Directory.CreateDirectory(folder);
        await File.WriteAllBytesAsync(leftover, PngBytes);
        Assert.True(File.Exists(leftover));

        var second = await client.PostAsync("/api/auth/avatar", ImageForm("second.png"));
        second.EnsureSuccessStatusCode();

        Assert.False(File.Exists(leftover));
        var kept = Directory.GetFiles(folder, $"{session.Id:D}.*");
        Assert.Single(kept);
        Assert.Equal(".jpg", Path.GetExtension(kept[0]), ignoreCase: true);
    }

    [Fact]
    public async Task Tickets_and_screenshots_leave_one_week_after_the_order_ends()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"keep_{suffix}",
            Password = "Passw0rd!",
            Name = "过期附件",
            AccountType = "company",
            CompanyName = $"过期公司{suffix}"
        });
        registered.EnsureSuccessStatusCode();
        (await client.PostAsync("/api/auth/avatar", ImageForm("avatar.png"))).EnsureSuccessStatusCode();

        var today = DateOnly.FromDateTime(DateTime.Today);
        var expired = await CreateOrderWithFiles(client, today.AddDays(-OrderScheduling.AttachmentKeepDays));
        var recent = await CreateOrderWithFiles(client, today.AddDays(1 - OrderScheduling.AttachmentKeepDays));
        var extended = await CreateOrderWithFiles(client, today.AddDays(-30));
        (await client.PostAsJsonAsync($"/api/orders/{extended.OrderId}/days", new ItineraryDayWriteDto
        {
            ServiceDate = today
        })).EnsureSuccessStatusCode();

        await using var scope = _factory.Services.CreateAsyncScope();
        var scheduling = scope.ServiceProvider.GetRequiredService<OrderScheduling>();
        await scheduling.PurgeExpiredAttachmentsAsync(today, CancellationToken.None);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(expired.TicketUrl)).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<OrderFileReadDto>>($"/api/orders/{expired.OrderId}/files"))!);
        var expiredActivities = await client.GetFromJsonAsync<List<OrderActivityReadDto>>(
            $"/api/orders/{expired.OrderId}/days/{expired.DayId}/activities");
        var expiredActivity = Assert.Single(expiredActivities!);
        Assert.Equal("缆车", expiredActivity.Content);
        Assert.Null(expiredActivity.TicketPath);
        Assert.False(File.Exists(expired.TicketFile));
        Assert.False(File.Exists(expired.ScreenshotFile));

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(recent.TicketUrl)).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<List<OrderFileReadDto>>($"/api/orders/{recent.OrderId}/files"))!);
        Assert.True(File.Exists(recent.TicketFile));
        Assert.True(File.Exists(recent.ScreenshotFile));

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(extended.TicketUrl)).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<List<OrderFileReadDto>>($"/api/orders/{extended.OrderId}/files"))!);

        (await client.GetAsync("/api/auth/avatar")).EnsureSuccessStatusCode();

        foreach (var id in new[] { expired.OrderId, recent.OrderId, extended.OrderId })
        {
            (await client.DeleteAsync($"/api/orders/{id}")).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Desk_reads_avatar_only_for_people_it_can_see()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var registered = await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"avco_{suffix}",
            Password = "Passw0rd!",
            Name = "头像公司",
            AccountType = "company",
            CompanyName = $"头像公司{suffix}"
        });
        registered.EnsureSuccessStatusCode();
        var companyUser = (await registered.Content.ReadFromJsonAsync<SessionUserDto>())!;

        var before = await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.False(before!.Single(item => item.Id == companyUser!.DriverId).HasAvatar);

        (await company.PostAsync("/api/auth/avatar", ImageForm("avatar.png"))).EnsureSuccessStatusCode();
        var drivers = await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.True(drivers!.Single(item => item.Id == companyUser!.DriverId).HasAvatar);
        var selfAvatar = await company.GetAsync($"/api/drivers/{companyUser.DriverId}/avatar");
        selfAvatar.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", selfAvatar.Content.Headers.ContentType?.MediaType);

        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.True(home!.Desk!.Dispatchers.Single(item => item.UserId == companyUser.Id).HasAvatar);
        var memberAvatar = await company.GetAsync($"/api/company/dispatchers/{companyUser.Id}/avatar");
        memberAvatar.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", memberAvatar.Content.Headers.ContentType?.MediaType);

        var dispatcher = _factory.CreateClient();
        (await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"avdp_{suffix}",
            Password = "Passw0rd!",
            Name = "头像调度",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var dispatcherUser = (await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me"))!;
        (await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto
        {
            CompanyId = companyUser.CompanyId!.Value
        })).EnsureSuccessStatusCode();
        home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        (await company.PostAsJsonAsync(
            $"/api/company/applications/{home!.Desk!.Applications.Single().Id}/approve",
            new { })).EnsureSuccessStatusCode();

        home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.False(home!.Desk!.Dispatchers.Single(item => item.UserId == dispatcherUser!.Id).HasAvatar);
        Assert.Equal(HttpStatusCode.NotFound, (await company.GetAsync($"/api/company/dispatchers/{dispatcherUser.Id}/avatar")).StatusCode);

        (await dispatcher.PostAsync("/api/auth/avatar", ImageForm("avatar.png"))).EnsureSuccessStatusCode();
        home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        Assert.True(home!.Desk!.Dispatchers.Single(item => item.UserId == dispatcherUser.Id).HasAvatar);
        var dispatcherAvatar = await company.GetAsync($"/api/company/dispatchers/{dispatcherUser.Id}/avatar");
        dispatcherAvatar.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", dispatcherAvatar.Content.Headers.ContentType?.MediaType);

        var driver = _factory.CreateClient();
        (await driver.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"avdr_{suffix}",
            Password = "Passw0rd!",
            Name = "头像司导",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        var driverUser = await driver.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        (await driver.PostAsync("/api/auth/avatar", ImageForm("avatar.png"))).EnsureSuccessStatusCode();
        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = companyUser.Id
        })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await company.GetAsync($"/api/drivers/{driverUser!.DriverId}/avatar")).StatusCode);

        var incoming = await company.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        (await company.PostAsJsonAsync($"/api/dispatchers/applications/{incoming!.Single().Id}/approve", new { })).EnsureSuccessStatusCode();
        var roster = await company.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.True(roster!.Single(item => item.Id == driverUser.DriverId).HasAvatar);
        var driverAvatar = await company.GetAsync($"/api/drivers/{driverUser.DriverId}/avatar");
        driverAvatar.EnsureSuccessStatusCode();
        Assert.Equal("image/jpeg", driverAvatar.Content.Headers.ContentType?.MediaType);

        (await driver.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto
        {
            DispatcherUserId = dispatcherUser.Id
        })).EnsureSuccessStatusCode();
        var dispatcherIncoming = await dispatcher.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications");
        (await dispatcher.PostAsJsonAsync(
            $"/api/dispatchers/applications/{dispatcherIncoming!.Single().Id}/approve",
            new { })).EnsureSuccessStatusCode();
        var dispatcherRoster = await dispatcher.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers");
        Assert.True(dispatcherRoster!.Single(item => item.Id == driverUser.DriverId).HasAvatar);
        (await dispatcher.GetAsync($"/api/drivers/{driverUser.DriverId}/avatar")).EnsureSuccessStatusCode();

        var stranger = _factory.CreateClient();
        (await stranger.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"avst_{suffix}",
            Password = "Passw0rd!",
            Name = "外人",
            AccountType = "driver"
        })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/drivers/{driverUser.DriverId}/avatar")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/company/dispatchers/{dispatcherUser.Id}/avatar")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await dispatcher.GetAsync($"/api/company/dispatchers/{companyUser.Id}/avatar")).StatusCode);
    }

    private async Task<KeptFiles> CreateOrderWithFiles(HttpClient client, DateOnly day)
    {
        var order = await client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = day,
            GuestCount = 1
        });
        order.EnsureSuccessStatusCode();
        var createdOrder = await order.Content.ReadFromJsonAsync<OrderReadDto>();

        var screenshot = await client.PostAsync($"/api/orders/{createdOrder!.Id}/files", ImageForm("shot.png"));
        screenshot.EnsureSuccessStatusCode();
        var stored = await screenshot.Content.ReadFromJsonAsync<OrderFileReadDto>();

        var dayResponse = await client.PostAsJsonAsync(
            $"/api/orders/{createdOrder.Id}/days",
            new ItineraryDayWriteDto { ServiceDate = day });
        dayResponse.EnsureSuccessStatusCode();
        var createdDay = await dayResponse.Content.ReadFromJsonAsync<ItineraryDayReadDto>();

        var activity = await client.PostAsJsonAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay!.Id}/activities",
            new OrderActivityWriteDto { Content = "缆车" });
        activity.EnsureSuccessStatusCode();
        var createdActivity = await activity.Content.ReadFromJsonAsync<OrderActivityReadDto>();

        var ticket = await client.PostAsync(
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity!.Id}/ticket",
            ImageForm("ticket.png"));
        ticket.EnsureSuccessStatusCode();
        var withTicket = await ticket.Content.ReadFromJsonAsync<OrderActivityReadDto>();

        var env = _factory.Services.GetRequiredService<IWebHostEnvironment>();
        string Full(string relative) => Path.Combine(
            env.ContentRootPath,
            "App_Data",
            relative.Replace('/', Path.DirectorySeparatorChar));

        return new KeptFiles(
            createdOrder.Id,
            createdDay.Id,
            $"/api/orders/{createdOrder.Id}/days/{createdDay.Id}/activities/{createdActivity.Id}/ticket",
            Full(withTicket!.TicketPath!),
            Full($"files/orders/{stored!.Id:D}.png"));
    }

    private sealed record KeptFiles(Guid OrderId, Guid DayId, string TicketUrl, string TicketFile, string ScreenshotFile);

    private static MultipartFormDataContent ImageForm(string fileName, Guid? companyId = null) =>
        ImageForm(fileName, PngBytes, companyId);

    private static MultipartFormDataContent ImageForm(string fileName, byte[] bytes, Guid? companyId = null)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var form = new MultipartFormDataContent { { content, "file", fileName } };
        if (companyId is Guid id)
        {
            form.Add(new StringContent(id.ToString()), "companyId");
        }

        return form;
    }

    private static MultipartFormDataContent TextForm(string fileName)
    {
        var content = new ByteArrayContent("not-an-image"u8.ToArray());
        content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        return new MultipartFormDataContent { { content, "file", fileName } };
    }
}
