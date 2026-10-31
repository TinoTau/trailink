using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

public class VehicleTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly byte[] PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private readonly ApiFactory _factory;

    public VehicleTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Dispatcher_owns_vehicles_and_bind_covers_only_that_drivers_days()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (owner, _) = await DispatcherAsync($"va_{suffix}");
        var (other, _) = await DispatcherAsync($"vb_{suffix}");
        var company = _factory.CreateClient();
        await TestAuth.RegisterAsync(company, $"vc_{suffix}", "公司", "company", $"车辆公司{suffix}");

        var companyList = await company.GetFromJsonAsync<List<VehicleReadDto>>("/api/vehicles", JsonOptions);
        Assert.NotNull(companyList);
        var companyVehicle = await PostAsync<VehicleReadDto>(company, "/api/vehicles", new VehicleWriteDto { Plate = $"司{suffix}"[..8] });
        Assert.Equal($"司{suffix}"[..8], companyVehicle.Plate);
        var companyDelete = await company.DeleteAsync($"/api/vehicles/{companyVehicle.Id}");
        Assert.Equal(HttpStatusCode.NoContent, companyDelete.StatusCode);

        var plate = $"测{suffix}"[..8];
        var created = await PostAsync<VehicleReadDto>(owner, "/api/vehicles", new VehicleWriteDto
        {
            Plate = $"  {plate}  ",
            SharedNotes = "共用",
            Info = "七座"
        });
        Assert.Equal(plate, created.Plate);
        Assert.True(created.Available);

        var duplicate = await owner.PostAsJsonAsync("/api/vehicles", new VehicleWriteDto { Plate = plate });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var hidden = await other.GetFromJsonAsync<List<VehicleReadDto>>("/api/vehicles", JsonOptions);
        Assert.DoesNotContain(hidden!, item => item.Id == created.Id);

        var driver = await PostAsync<DriverReadDto>(owner, "/api/drivers", new DriverWriteDto { Name = $"司导{suffix}" });
        var order = await PostAsync<OrderReadDto>(owner, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2031, 6, 1),
            GuestCount = 2
        });
        var days = new List<ItineraryDayReadDto>();
        for (var index = 0; index < 5; index++)
        {
            days.Add(await PostAsync<ItineraryDayReadDto>(owner, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = new DateOnly(2031, 6, 1 + index),
                DriverId = index < 2 ? driver.Id : null
            }));
        }

        var bound = await PutAsync<VehicleBindResultDto>(
            owner,
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto { VehicleId = created.Id });
        Assert.Equal(2, bound.DayIds.Count);
        Assert.Contains(days[0].Id, bound.DayIds);
        Assert.Contains(days[1].Id, bound.DayIds);

        var listedDays = await owner.GetFromJsonAsync<List<ItineraryDayReadDto>>($"/api/orders/{order.Id}/days", JsonOptions);
        var shown = listedDays!.Single(item => item.Id == days[0].Id);
        Assert.Equal(created.Id, shown.VehicleId);
        Assert.Equal(plate, shown.VehiclePlate);
        Assert.Equal("七座", shown.VehicleInfo);
        Assert.Equal("共用", shown.VehicleSharedNotes);
        Assert.Equal(created.Id, listedDays!.Single(item => item.Id == days[1].Id).VehicleId);
        Assert.All(listedDays.Where(item => item.Id != days[0].Id && item.Id != days[1].Id), item =>
        {
            Assert.Null(item.VehicleId);
            Assert.Null(item.VehiclePlate);
            Assert.Null(item.VehicleInfo);
            Assert.Null(item.VehicleSharedNotes);
        });

        var foreign = await other.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto { VehicleId = created.Id });
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);

        var otherCar = await PostAsync<VehicleReadDto>(owner, "/api/vehicles", new VehicleWriteDto { Plate = $"乙{suffix}"[..8] });
        var blocked = await owner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto { VehicleId = otherCar.Id });
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.Contains("已经绑定了其他车辆", await blocked.Content.ReadAsStringAsync());

        var clearedDay = await PutAsync<VehicleBindResultDto>(
            owner,
            $"/api/orders/{order.Id}/days/{days[1].Id}/vehicle",
            new VehicleBindDto { OnlyDay = true });
        Assert.Equal(new[] { days[1].Id }, clearedDay.DayIds);
        Assert.Null(clearedDay.VehicleId);

        var filledGap = await PutAsync<VehicleBindResultDto>(
            owner,
            $"/api/orders/{order.Id}/days/{days[1].Id}/vehicle",
            new VehicleBindDto { VehicleId = otherCar.Id });
        Assert.Equal(new[] { days[1].Id }, filledGap.DayIds);

        var stillFirst = await owner.GetFromJsonAsync<List<ItineraryDayReadDto>>($"/api/orders/{order.Id}/days", JsonOptions);
        Assert.Equal(created.Id, stillFirst!.Single(item => item.Id == days[0].Id).VehicleId);
        Assert.Equal(otherCar.Id, stillFirst.Single(item => item.Id == days[1].Id).VehicleId);

        var clearedOrder = await PutAsync<VehicleBindResultDto>(
            owner,
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto());
        Assert.Equal(2, clearedOrder.DayIds.Count);
        var afterUnbind = await owner.GetFromJsonAsync<List<ItineraryDayReadDto>>($"/api/orders/{order.Id}/days", JsonOptions);
        Assert.All(afterUnbind!, item => Assert.Null(item.VehicleId));

        var rebound = await PutAsync<VehicleBindResultDto>(
            owner,
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto { VehicleId = created.Id });
        Assert.Equal(2, rebound.DayIds.Count);

        var missing = await owner.PutAsJsonAsync(
            $"/api/orders/{order.Id}/days/{days[0].Id}/vehicle",
            new VehicleBindDto { VehicleId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        for (var index = 0; index < 3; index++)
        {
            var uploaded = await owner.PostAsync($"/api/vehicles/{created.Id}/photos", PngForm($"car{index}.png"));
            uploaded.EnsureSuccessStatusCode();
        }

        var fourth = await owner.PostAsync($"/api/vehicles/{created.Id}/photos", PngForm("car3.png"));
        Assert.Equal(HttpStatusCode.BadRequest, fourth.StatusCode);

        var retired = await PutAsync<VehicleReadDto>(owner, $"/api/vehicles/{created.Id}", new VehicleWriteDto
        {
            Plate = plate,
            SharedNotes = "共用",
            Info = "七座",
            Available = false
        });
        Assert.False(retired.Available);
        var stillListed = await owner.GetFromJsonAsync<List<VehicleReadDto>>("/api/vehicles", JsonOptions);
        Assert.Contains(stillListed!, item => item.Id == created.Id && !item.Available);

        var removed = await owner.DeleteAsync($"/api/vehicles/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        var afterDelete = await owner.GetFromJsonAsync<List<VehicleReadDto>>("/api/vehicles", JsonOptions);
        Assert.DoesNotContain(afterDelete!, item => item.Id == created.Id);
        var cleared = await owner.GetFromJsonAsync<List<ItineraryDayReadDto>>($"/api/orders/{order.Id}/days", JsonOptions);
        Assert.All(cleared!, item => Assert.Null(item.VehicleId));

        var deleteOrder = await owner.DeleteAsync($"/api/orders/{order.Id}");
        deleteOrder.EnsureSuccessStatusCode();
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

    private static MultipartFormDataContent PngForm(string fileName)
    {
        var content = new ByteArrayContent(PngBytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { content, "file", fileName } };
    }

    private static async Task<T> PostAsync<T>(HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(url, body);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonSerializer.Deserialize<T>(text, JsonOptions)!;
    }

    private static async Task<T> PutAsync<T>(HttpClient client, string url, object body)
    {
        var response = await client.PutAsJsonAsync(url, body);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonSerializer.Deserialize<T>(text, JsonOptions)!;
    }
}
