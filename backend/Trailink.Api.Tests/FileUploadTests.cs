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
