using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

public class CalendarPreviewTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _client;

    public CalendarPreviewTests(ApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Preview_returns_only_server_chosen_driver_and_ignores_client_driver_id()
    {
        var preview = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "预览司机-甲" });
        var other = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "预览司机-乙" });

        var orderA = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2027, 6, 1),
            GuestCount = 2
        });
        var orderB = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2027, 6, 2),
            GuestCount = 2
        });

        ItineraryDayReadDto? dayA1 = null;
        for (var day = 1; day <= 10; day++)
        {
            var createdDay = await PostAsync<ItineraryDayReadDto>($"/api/orders/{orderA.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = new DateOnly(2027, 6, day),
                Description = day == 1 ? "甲-第一天" : $"甲-第{day}天",
                EndLocation = day == 1 ? "特卡波" : "皇后镇",
                DriverId = preview.Id
            });
            dayA1 ??= createdDay;
        }
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{orderB.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2027, 6, 1),
            Description = "乙的行程",
            DriverId = other.Id
        });

        await _client.PostAsJsonAsync(
            $"/api/orders/{orderA.Id}/days/{dayA1.Id}/activities",
            new OrderActivityWriteDto
            {
                Content = "好牧羊人教堂",
                Provider = "本地向导",
                BookingTime = new DateTime(2027, 6, 1, 10, 30, 0, DateTimeKind.Unspecified),
                TicketPath = "reserved/ticket"
            });

        var leaked = await _client.GetAsync(
            $"/api/driver-calendar/preview?startDate=2027-06-01&endDate=2027-06-30&driverId={other.Id}");
        leaked.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(await leaked.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("preview").GetBoolean());
        Assert.False(document.RootElement.GetProperty("identityIsolated").GetBoolean());
        Assert.Equal(preview.Id, document.RootElement.GetProperty("driverId").GetGuid());
        Assert.Equal(10, document.RootElement.GetProperty("days").GetArrayLength());

        var firstDay = document.RootElement.GetProperty("days")[0];
        Assert.Equal("2027-06-01", firstDay.GetProperty("date").GetString());
        Assert.Equal(1, firstDay.GetProperty("items").GetArrayLength());
        Assert.Equal(orderA.OrderNo, firstDay.GetProperty("items")[0].GetProperty("orderNo").GetString());
        Assert.False(firstDay.GetProperty("items")[0].GetProperty("activities")[0].GetProperty("ticketAccessible").GetBoolean());
        Assert.Equal(
            "2027-06-01T10:30:00",
            firstDay.GetProperty("items")[0].GetProperty("activities")[0].GetProperty("bookingTime").GetString());

        var officialFilter = await _client.GetAsync(
            $"/api/calendar?driverId={other.Id}&startDate=2027-06-01&endDate=2027-06-30");
        Assert.Equal(HttpStatusCode.NotFound, officialFilter.StatusCode);

        await _client.DeleteAsync($"/api/orders/{orderA.Id}");
        await _client.DeleteAsync($"/api/orders/{orderB.Id}");
        await _client.DeleteAsync($"/api/drivers/{preview.Id}");
        await _client.DeleteAsync($"/api/drivers/{other.Id}");
    }

    [Fact]
    public async Task Claim_assigns_existing_order_days_to_preview_driver()
    {
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "认领预览司机" });
        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-CLAIM-202803",
            StartDate = new DateOnly(2028, 3, 1),
            GuestCount = 4
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2028, 3, 1),
            EndLocation = "特卡波"
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2028, 3, 2),
            EndLocation = "皇后镇"
        });

        var claimed = await PostAsync<DriverCalendarMutationDto>("/api/driver-calendar/claim", new DriverCalendarClaimDto
        {
            OrderNo = "P-CLAIM-202803"
        });
        Assert.Equal(order.Id, claimed.OrderId);
        Assert.Equal(2, claimed.UpdatedDayCount);
        Assert.NotNull(claimed.DriverId);

        var detail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(detail!.Days, day => Assert.Equal(claimed.DriverId, day.DriverId));

        var missing = await _client.PostAsJsonAsync("/api/driver-calendar/claim", new DriverCalendarClaimDto
        {
            OrderNo = "NO-SUCH-ORDER"
        });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var cleared = await _client.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        cleared.EnsureSuccessStatusCode();
        var unbound = await cleared.Content.ReadFromJsonAsync<AssignmentResultDto>(JsonOptions);
        Assert.Equal(2, unbound!.UpdatedDayCount);
        Assert.Null(unbound.DriverId);

        var afterCancel = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(afterCancel!.Days, day => Assert.Null(day.DriverId));

        var previewAfterCancel = await _client.GetFromJsonAsync<DriverCalendarPreviewDto>(
            "/api/driver-calendar/preview?startDate=2028-03-01&endDate=2028-03-02", JsonOptions);
        Assert.NotNull(previewAfterCancel);
        Assert.DoesNotContain(previewAfterCancel.Days.SelectMany(day => day.Items), item => item.OrderId == order.Id);

        await _client.DeleteAsync($"/api/orders/{order.Id}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    [Fact]
    public async Task Range_creates_order_days_and_assigns_preview_driver()
    {
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "范围预览司机" });
        var created = await PostAsync<DriverCalendarMutationDto>("/api/driver-calendar/range", new DriverCalendarRangeDto
        {
            StartDate = new DateOnly(2028, 4, 10),
            EndDate = new DateOnly(2028, 4, 12)
        });

        Assert.Equal(3, created.UpdatedDayCount);
        Assert.False(string.IsNullOrWhiteSpace(created.OrderNo));

        var detail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.OrderId}", JsonOptions);
        Assert.Equal(new DateOnly(2028, 4, 10), detail!.StartDate);
        Assert.Equal(3, detail.Days.Count);
        Assert.All(detail.Days, day => Assert.Equal(created.DriverId, day.DriverId));

        var preview = await _client.GetAsync("/api/driver-calendar/preview?startDate=2028-04-10&endDate=2028-04-12");
        preview.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await preview.Content.ReadAsStringAsync());
        Assert.Equal(3, document.RootElement.GetProperty("days").GetArrayLength());

        await _client.DeleteAsync($"/api/orders/{created.OrderId}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    [Fact]
    public async Task Claim_overlap_returns_warning_but_still_assigns()
    {
        var driver = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "认领冲突预览司机" });
        var first = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-CLAIM-CONFLICT-A",
            StartDate = new DateOnly(2032, 3, 1),
            GuestCount = 2
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{first.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2032, 3, 1)
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{first.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2032, 3, 2)
        });

        var claimed = await PostAsync<DriverCalendarMutationDto>("/api/driver-calendar/claim", new DriverCalendarClaimDto
        {
            OrderNo = "P-CLAIM-CONFLICT-A"
        });
        Assert.Equal(2, claimed.UpdatedDayCount);
        Assert.NotNull(claimed.DriverId);

        var second = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = "P-CLAIM-CONFLICT-B",
            StartDate = new DateOnly(2032, 3, 1),
            GuestCount = 2
        });
        await PostAsync<ItineraryDayReadDto>($"/api/orders/{second.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2032, 3, 1)
        });

        var overlapped = await PostAsync<DriverCalendarMutationDto>("/api/driver-calendar/claim", new DriverCalendarClaimDto
        {
            OrderNo = "P-CLAIM-CONFLICT-B"
        });
        Assert.Equal(1, overlapped.UpdatedDayCount);
        Assert.Equal(claimed.DriverId, overlapped.DriverId);
        Assert.Contains(overlapped.Warnings, item => item.Contains("2032-03-01") && item.Contains(first.OrderNo));

        var detail = await _client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{second.Id}", JsonOptions);
        Assert.All(detail!.Days, day => Assert.Equal(claimed.DriverId, day.DriverId));

        await _client.DeleteAsync($"/api/orders/{first.Id}");
        await _client.DeleteAsync($"/api/orders/{second.Id}");
        await _client.DeleteAsync($"/api/drivers/{driver.Id}");
    }

    private async Task<T> PostAsync<T>(string url, object body)
    {
        var response = await _client.PostAsJsonAsync(url, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }
}
