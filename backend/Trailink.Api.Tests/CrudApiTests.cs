using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

public class CrudApiTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _client;

    public CrudApiTests(ApiFactory factory)
    {
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
            Phone = "0210000001",
            Notes = "测试司机"
        });
        Assert.Equal("张师傅", created.Name);

        var fetched = await _client.GetFromJsonAsync<DriverReadDto>($"/api/drivers/{created.Id}", JsonOptions);
        Assert.Equal(created.Id, fetched!.Id);

        var updated = await PutAsync<DriverReadDto>($"/api/drivers/{created.Id}", new DriverWriteDto
        {
            Name = "张师傅-改",
            Phone = "0210000002",
            Notes = "已更新"
        });
        Assert.Equal("张师傅-改", updated.Name);

        var list = await _client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers", JsonOptions);
        Assert.Contains(list!, item => item.Id == created.Id);

        var deleteResponse = await _client.DeleteAsync($"/api/drivers/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var missing = await _client.GetAsync($"/api/drivers/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Order_days_activities_and_assignment_work()
    {
        var zhang = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "张师傅-派单" });
        var li = await PostAsync<DriverReadDto>("/api/drivers", new DriverWriteDto { Name = "李师傅-派单" });

        var order = await PostAsync<OrderReadDto>("/api/orders", new OrderWriteDto
        {
            SourceCompany = "测试渠道",
            StartDate = new DateOnly(2026, 11, 12),
            GuestCount = 6
        });

        Assert.False(string.IsNullOrWhiteSpace(order.OrderNo));
        Assert.StartsWith("TL-", order.OrderNo);
        Assert.Null(order.PlatformOrderNo);
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
        Assert.Equal(zhang.Id, listedOrder.AssignedDriverId);
        Assert.Equal(3, listedOrder.AssignedDayCount);
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
        Assert.Contains(conflicted.Warnings, item => item.Contains("2031-08-12") && item.Contains(first.OrderNo));

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
        Assert.Contains(warned.Warnings, item => item.Contains("2032-03-11") && item.Contains(first.OrderNo));

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
    public async Task Negative_guest_count_is_rejected()
    {
        var response = await _client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2026, 11, 12),
            GuestCount = -1
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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
