using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

/// <summary>粗单填入行程明细：以细单为准，司导、车辆按第几天跟着走，冲突照样保留（标红），细单没填的保留粗单的。</summary>
public class ItineraryFillTests : IClassFixture<RecognitionFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly RecognitionFactory _factory;

    public ItineraryFillTests(RecognitionFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Fill_follows_the_detail_and_moves_drivers_by_day_number()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var companyUser = await TestAuth.RegisterAsync(_factory.CreateClient(), $"fic_{suffix}", "填单公司", "company", $"填单公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"fi_{suffix}", "填单调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var driver = await TestAuth.RegisterAsync(_factory.CreateClient(), $"fid_{suffix}", "填单司导", "driver");

        // 粗单：7 月 1–3 日，三天都派给司导，第 2 天写了一句，第 1 天有一项活动。
        var rough = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2038, 7, 1),
            GuestCount = 2,
            VehicleType = "五座车"
        });
        var roughDays = new List<ItineraryDayReadDto>();
        for (var i = 0; i < 3; i++)
        {
            roughDays.Add(await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{rough.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = new DateOnly(2038, 7, 1 + i),
                Description = i == 1 ? "粗单第2天" : null,
                DriverId = driver.DriverId
            }));
        }

        await PostAsync<OrderActivityReadDto>(dispatcher, $"/api/orders/{rough.Id}/days/{roughDays[1].Id}/activities", new OrderActivityWriteDto
        {
            Content = "粗单活动",
            BookingTime = new DateTime(2038, 7, 2, 9, 0, 0)
        });

        // 司导 7 月 12 日另有一单：细单第 2 天落在这天，冲突。
        var busy = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto { StartDate = new DateOnly(2038, 7, 12), GuestCount = 1 });
        await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{busy.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2038, 7, 12),
            DriverId = driver.DriverId
        });

        // 细单：7 月 11–14 日四天；第 2 天没写行程和活动（保留粗单的）；没写人数、车型（保留粗单的）。
        var detail = new OrderFillDto
        {
            PlatformOrderNo = "YX-FILL-1",
            Island = "north",
            Notes = "细单备注",
            Days =
            [
                new OrderImportDayDto
                {
                    ServiceDate = new DateOnly(2038, 7, 11),
                    Description = "基督城接机",
                    EndLocation = "基督城",
                    Activities = [new OrderImportActivityDto { Content = "接机", BookingTime = new DateTime(2038, 7, 11, 17, 20, 0) }]
                },
                new OrderImportDayDto { ServiceDate = new DateOnly(2038, 7, 12) },
                new OrderImportDayDto { ServiceDate = new DateOnly(2038, 7, 13), Description = "库克山", EndLocation = "特卡波" },
                new OrderImportDayDto
                {
                    ServiceDate = new DateOnly(2038, 7, 14),
                    Description = "皇后镇",
                    EndLocation = "皇后镇",
                    Activities = [new OrderImportActivityDto { Content = "跳伞" }]
                }
            ]
        };

        var preview = await PostAsync<OrderFillPreviewDto>(dispatcher, $"/api/orders/{rough.Id}/itinerary-fill/preview", detail);
        Assert.Equal(4, preview.Days.Count);
        Assert.Equal(new DateOnly(2038, 7, 1), preview.Days[0].FromDate);
        Assert.Equal("填单司导", preview.Days[0].DriverName);
        Assert.False(preview.Days[0].DriverConflict);
        Assert.True(preview.Days[1].DriverConflict);
        Assert.Null(preview.Days[3].FromDate);
        Assert.Null(preview.Days[3].DriverName);
        Assert.Empty(preview.Removed);
        Assert.Contains(preview.Warnings, warning => warning.Contains("07-12") && warning.Contains("标红"));

        var filled = await FillAsync(dispatcher, rough.Id, detail);
        Assert.Single(filled.Warnings);
        var order = filled.Order;
        Assert.Equal(rough.OrderNo, order.OrderNo);
        Assert.Equal(new DateOnly(2038, 7, 11), order.StartDate);
        Assert.Equal("YX-FILL-1", order.PlatformOrderNo);
        Assert.Equal(2, order.GuestCount);
        Assert.Equal("五座车", order.VehicleType);
        Assert.Equal("north", order.Island);
        Assert.Equal("细单备注", order.Notes);
        var days = order.Days.OrderBy(day => day.ServiceDate).ToList();
        Assert.Equal(Enumerable.Range(11, 4).Select(day => new DateOnly(2038, 7, day)), days.Select(day => day.ServiceDate));
        // 前三天还是粗单的那三条（同一个 ID），司导跟着走；冲突的那天照样保留，标成冲突。
        Assert.Equal(roughDays.Select(day => day.Id), days.Take(3).Select(day => day.Id));
        Assert.All(days.Take(3), day => Assert.Equal(driver.DriverId, day.DriverId));
        Assert.True(days[1].HasDriverConflict);
        Assert.True(order.HasDriverConflict);
        Assert.Null(days[3].DriverId);
        Assert.Equal("跳伞", Assert.Single(days[3].Activities).Content);
        Assert.Equal("基督城接机", days[0].Description);
        Assert.Equal("基督城", days[0].EndLocation);
        Assert.Equal("接机", Assert.Single(days[0].Activities).Content);
        // 细单第 2 天空着：保留粗单的说明和活动，活动时间跟着挪到新日期。
        Assert.Equal("粗单第2天", days[1].Description);
        Assert.Equal(new DateTime(2038, 7, 12, 9, 0, 0), Assert.Single(days[1].Activities).BookingTime);
        Assert.Equal("特卡波", days[2].EndLocation);

        // 细单变短：只剩两天，末尾两天删掉；7 月 13 日派过司导，提醒一句（14 日是新加的，没派）。
        var shorter = await FillAsync(dispatcher, rough.Id, new OrderFillDto
        {
            Notes = "细单备注",
            Days =
            [
                new OrderImportDayDto { ServiceDate = new DateOnly(2038, 7, 20), Description = "第一天" },
                new OrderImportDayDto { ServiceDate = new DateOnly(2038, 7, 21) }
            ]
        });
        Assert.Equal(2, shorter.Order.Days.Count);
        Assert.Single(shorter.Warnings, warning => warning.Contains("07-13") && warning.Contains("原来派给填单司导"));
        Assert.Equal(new DateOnly(2038, 7, 20), shorter.Order.StartDate);
        Assert.Equal(new DateTime(2038, 7, 21, 9, 0, 0), Assert.Single(shorter.Order.Days.Single(day => day.ServiceDate == new DateOnly(2038, 7, 21)).Activities).BookingTime);
        // 同样的补充说明不重复接到备注后面。
        Assert.Equal("细单备注", shorter.Order.Notes);

        // 别的调度员不能填。
        var stranger = _factory.CreateClient();
        var strangerUser = await TestAuth.RegisterAsync(stranger, $"fis_{suffix}", "别的调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, strangerUser.Id, companyUser.CompanyId!.Value);
        var forbidden = await stranger.PostAsJsonAsync($"/api/orders/{rough.Id}/itinerary-fill/preview", detail);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Driver_can_recognize_and_fill_own_date_only_order()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driverClient = _factory.CreateClient();
        var driver = await TestAuth.RegisterAsync(driverClient, $"fdo_{suffix}", "自己司导", "driver");
        var placeholder = await PostAsync<OrderReadDto>(driverClient, "/api/orders", new OrderWriteDto { StartDate = new DateOnly(2038, 8, 1) });
        for (var i = 0; i < 2; i++)
        {
            await PostAsync<ItineraryDayReadDto>(driverClient, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = new DateOnly(2038, 8, 1 + i),
                DriverId = driver.DriverId
            });
        }

        var status = await driverClient.GetFromJsonAsync<RecognitionStatusDto>("/api/recognition/status", JsonOptions);
        Assert.False(status!.Enabled);
        Assert.True(status.FillEnabled);

        _factory.Model.Reply = """
            { "guestCount": 3, "days": [
              { "serviceDate": "2038-08-02", "include": true, "description": "特卡波观星", "endLocation": "特卡波", "activities": [] },
              { "serviceDate": "2038-08-03", "include": true, "description": "库克山", "endLocation": "库克山", "activities": [] } ] }
            """;

        // 司导不能用 AI 建单，但能在自己的单上识别行程明细。
        Assert.Equal(HttpStatusCode.Forbidden, (await DraftAsync(driverClient, null)).StatusCode);
        var response = await DraftAsync(driverClient, placeholder.Id);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var draft = (await response.Content.ReadFromJsonAsync<OrderDraftDto>(JsonOptions))!;
        Assert.Equal(2, draft.Days.Count);

        var filled = await FillAsync(driverClient, placeholder.Id, new OrderFillDto
        {
            GuestCount = draft.GuestCount,
            Notes = "司导没有调度备注，不写",
            Days = draft.Days.Select(day => new OrderImportDayDto
            {
                ServiceDate = day.ServiceDate,
                Description = day.Description,
                EndLocation = day.EndLocation
            }).ToList()
        });
        var days = filled.Order.Days.OrderBy(day => day.ServiceDate).ToList();
        Assert.Equal([new DateOnly(2038, 8, 2), new DateOnly(2038, 8, 3)], days.Select(day => day.ServiceDate));
        Assert.All(days, day => Assert.Equal(driver.DriverId, day.DriverId));
        Assert.Equal("特卡波观星", days[0].Description);
        Assert.Equal(3, filled.Order.GuestCount);
        Assert.Null(filled.Order.Notes);

        // 别的司导不能识别、不能填这张单。
        var other = _factory.CreateClient();
        await TestAuth.RegisterAsync(other, $"fdx_{suffix}", "别的司导", "driver");
        Assert.Equal(HttpStatusCode.Forbidden, (await DraftAsync(other, placeholder.Id)).StatusCode);
    }

    private static async Task<HttpResponseMessage> DraftAsync(HttpClient client, Guid? orderId)
    {
        using var form = new MultipartFormDataContent { { new StringContent("8月2日 特卡波；8月3日 库克山"), "text" } };
        if (orderId is Guid id)
        {
            form.Add(new StringContent(id.ToString()), "orderId");
        }

        return await client.PostAsync("/api/recognition/order-draft", form);
    }

    private static async Task<OrderFillResultDto> FillAsync(HttpClient client, Guid orderId, OrderFillDto request)
    {
        using var form = new MultipartFormDataContent { { JsonContent.Create(request), "order" } };
        var response = await client.PostAsync($"/api/orders/{orderId}/itinerary-fill", form);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<OrderFillResultDto>(JsonOptions))!;
    }

    private static async Task<T> PostAsync<T>(HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(url, body);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }
}
