using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

public class LicensePhotoTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly byte[] PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private readonly ApiFactory _factory;

    public LicensePhotoTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Approved_superiors_can_read_license_photos()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driverClient = _factory.CreateClient();
        var driver = await TestAuth.RegisterAsync(driverClient, $"ld_{suffix}", "司导", "driver");
        var companyClient = _factory.CreateClient();
        var company = await TestAuth.RegisterAsync(companyClient, $"lc_{suffix}", "公司", "company", $"驾照公司{suffix}");
        var (dispatcherClient, dispatcher) = await DispatcherAsync($"lp_{suffix}");
        var (strangerClient, _) = await DispatcherAsync($"ls_{suffix}");

        var front = await Upload(driverClient, 0, "front.png");
        var back = await Upload(driverClient, 1, "back.png");
        Assert.Equal(0, front.Side);
        Assert.Equal(1, back.Side);

        var duplicate = await driverClient.PostAsync("/api/auth/license-photos?side=0", PngForm("again.png"));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        var invalidSide = await driverClient.PostAsync("/api/auth/license-photos?side=2", PngForm("third.png"));
        Assert.Equal(HttpStatusCode.BadRequest, invalidSide.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await dispatcherClient.GetAsync($"/api/drivers/{driver.DriverId}/license-photos")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await companyClient.GetAsync($"/api/drivers/{driver.DriverId}/license-photos")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await strangerClient.GetAsync($"/api/drivers/{driver.DriverId}/license-photos")).StatusCode);

        await driverClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto { DispatcherUserId = dispatcher.Id });
        var dispatcherIncoming = (await dispatcherClient.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications", JsonOptions))!;
        (await dispatcherClient.PostAsJsonAsync($"/api/dispatchers/applications/{dispatcherIncoming.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        await driverClient.PostAsJsonAsync("/api/dispatchers/applications", new ApplyDriverDto { DispatcherUserId = company.Id });
        var companyIncoming = (await companyClient.GetFromJsonAsync<List<DriverApplicantDto>>("/api/dispatchers/applications", JsonOptions))!;
        (await companyClient.PostAsJsonAsync($"/api/dispatchers/applications/{companyIncoming.Single().Id}/approve", new { })).EnsureSuccessStatusCode();

        var seen = await dispatcherClient.GetFromJsonAsync<List<LicensePhotoReadDto>>($"/api/drivers/{driver.DriverId}/license-photos", JsonOptions);
        Assert.Equal(2, seen!.Count);
        Assert.Equal(HttpStatusCode.NotFound, (await strangerClient.GetAsync($"/api/drivers/{driver.DriverId}/license-photos")).StatusCode);

        var companySeen = await companyClient.GetFromJsonAsync<List<LicensePhotoReadDto>>($"/api/drivers/{driver.DriverId}/license-photos", JsonOptions);
        Assert.Equal(2, companySeen!.Count);
        var image = await companyClient.GetAsync($"/api/drivers/{driver.DriverId}/license-photos/{front.Id}");
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);

        var replaced = await PutFile(driverClient, front.Id, "front2.png");
        Assert.Equal(front.Id, replaced.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await dispatcherClient.DeleteAsync($"/api/auth/license-photos/{back.Id}")).StatusCode);

        var removed = await driverClient.DeleteAsync($"/api/auth/license-photos/{back.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        var left = await driverClient.GetFromJsonAsync<List<LicensePhotoReadDto>>("/api/auth/license-photos", JsonOptions);
        Assert.Single(left!);
        Assert.Equal(0, left![0].Side);
    }

    private async Task<(HttpClient Client, SessionUserDto User)> DispatcherAsync(string username)
    {
        var companyClient = _factory.CreateClient();
        var company = await TestAuth.RegisterAsync(companyClient, $"co_{username}", "管理人", "company", $"公司{username}");
        var client = _factory.CreateClient();
        var user = await TestAuth.RegisterAsync(client, username, "调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, user.Id, company.CompanyId!.Value);
        return (client, user);
    }

    private static async Task<LicensePhotoReadDto> Upload(HttpClient client, int side, string fileName)
    {
        var response = await client.PostAsync($"/api/auth/license-photos?side={side}", PngForm(fileName));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonSerializer.Deserialize<LicensePhotoReadDto>(text, JsonOptions)!;
    }

    private static async Task<LicensePhotoReadDto> PutFile(HttpClient client, Guid photoId, string fileName)
    {
        var response = await client.PutAsync($"/api/auth/license-photos/{photoId}", PngForm(fileName));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonSerializer.Deserialize<LicensePhotoReadDto>(text, JsonOptions)!;
    }

    private static MultipartFormDataContent PngForm(string fileName)
    {
        var content = new ByteArrayContent(PngBytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { content, "file", fileName } };
    }
}
