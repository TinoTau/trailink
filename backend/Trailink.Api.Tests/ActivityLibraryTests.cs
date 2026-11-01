using System.Net;
using System.Net.Http.Json;
using Trailink.Api.DTOs;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Tests;

public class ActivityLibraryTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ActivityLibraryTests(ApiFactory factory)
    {
        _factory = factory;
    }

    private static Guid Tekapo => Places.All.Single(place => place.Mark == "特").Id;

    private static async Task<LibraryActivityDetailDto> CreateActivityAsync(HttpClient client, string zh, string? en, params Guid[] destinations)
    {
        var response = await client.PostAsJsonAsync("/api/library/activities", new LibraryActivityWriteDto
        {
            NameZh = zh,
            NameEn = en,
            DestinationIds = [.. destinations]
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LibraryActivityDetailDto>())!;
    }

    [Fact]
    public async Task Company_builds_shared_library_and_others_can_only_read()
    {
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var company = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(company);

        var village = await (await company.PostAsJsonAsync("/api/library/destinations", new DestinationWriteDto
        {
            NameEn = $"Mount Cook Village {suffix}"
        })).Content.ReadFromJsonAsync<DestinationDto>();
        var again = await (await company.PostAsJsonAsync("/api/library/destinations", new DestinationWriteDto
        {
            NameZh = $"库克山村{suffix}",
            NameEn = $"mount cook village {suffix}"
        })).Content.ReadFromJsonAsync<DestinationDto>();
        Assert.Equal(village!.Id, again!.Id);
        var found = await company.GetFromJsonAsync<List<DestinationDto>>($"/api/library/destinations?q=cook village {suffix}");
        Assert.Contains(found!, item => item.Id == village.Id);
        var presets = await company.GetFromJsonAsync<List<DestinationDto>>("/api/library/destinations?q=Tekapo");
        Assert.Equal("特", presets!.First().Mark);

        var heli = await CreateActivityAsync(company, $"库克山直升机{suffix}", $"Mount Cook Heli {suffix}", Tekapo, village.Id);
        Assert.Equal(2, heli.Destinations.Count);
        Assert.Equal("特卡波", heli.Destinations[0].Name);

        var duplicate = await company.PostAsJsonAsync("/api/library/activities", new LibraryActivityWriteDto
        {
            NameEn = $"MOUNT COOK HELI {suffix}",
            DestinationIds = [Tekapo]
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        var noDestination = await company.PostAsJsonAsync("/api/library/activities", new LibraryActivityWriteDto { NameZh = $"无目的地{suffix}" });
        Assert.Equal(HttpStatusCode.BadRequest, noDestination.StatusCode);

        var fuzzy = await company.GetFromJsonAsync<List<LibraryActivityReadDto>>($"/api/library/activities?q=cook heli {suffix}");
        Assert.Single(fuzzy!, item => item.Id == heli.Id);
        var byDestination = await company.GetFromJsonAsync<List<LibraryActivityReadDto>>($"/api/library/activities?destinationId={village.Id}");
        Assert.Single(byDestination!);

        var driver = _factory.CreateClient();
        await TestAuth.RegisterAsync(driver, $"dr_{suffix}", "司导", "driver");
        var denied = await driver.PostAsJsonAsync("/api/library/activities", new LibraryActivityWriteDto
        {
            NameZh = $"司导加的{suffix}",
            DestinationIds = [Tekapo]
        });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        var shared = await driver.GetFromJsonAsync<LibraryActivityDetailDto>($"/api/library/activities/{heli.Id}");
        Assert.Equal(heli.Name, shared!.Name);

        var updated = await company.PutAsJsonAsync($"/api/library/activities/{heli.Id}", new LibraryActivityWriteDto
        {
            NameZh = $"库克山直升机{suffix}",
            NameEn = $"Mount Cook Heli {suffix}",
            SharedNotes = "提前一天确认天气",
            DestinationIds = [village.Id]
        });
        updated.EnsureSuccessStatusCode();
        var edited = await updated.Content.ReadFromJsonAsync<LibraryActivityDetailDto>();
        Assert.Equal("提前一天确认天气", edited!.SharedNotes);
        Assert.Single(edited.Destinations);
    }

    [Fact]
    public async Task Pick_sorts_by_rating_then_personal_order_and_adds_to_day_in_pick_order()
    {
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var company = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(company);
        var place = await (await company.PostAsJsonAsync("/api/library/destinations", new DestinationWriteDto
        {
            NameZh = $"测试镇{suffix}"
        })).Content.ReadFromJsonAsync<DestinationDto>();
        var a = await CreateActivityAsync(company, $"甲{suffix}", null, place!.Id);
        var b = await CreateActivityAsync(company, $"乙{suffix}", null, place.Id);
        var c = await CreateActivityAsync(company, null, $"Hotel C {suffix}", place.Id);

        var other = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(other);
        (await company.PutAsJsonAsync($"/api/library/activities/{b.Id}/rating", new LibraryRatingWriteDto { Score = 5, Comment = "很好" })).EnsureSuccessStatusCode();
        (await other.PutAsJsonAsync($"/api/library/activities/{b.Id}/rating", new LibraryRatingWriteDto { Score = 4 })).EnsureSuccessStatusCode();
        (await other.PutAsJsonAsync($"/api/library/activities/{c.Id}/rating", new LibraryRatingWriteDto { Score = 3 })).EnsureSuccessStatusCode();
        var bad = await other.PutAsJsonAsync($"/api/library/activities/{c.Id}/rating", new LibraryRatingWriteDto { Score = 6 });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var pick = await company.GetFromJsonAsync<LibraryPickDto>($"/api/library/pick?place={Uri.EscapeDataString(place.Name)}");
        Assert.Equal(place.Id, pick!.Destination!.Id);
        Assert.Equal([b.Id, c.Id, a.Id], pick.Activities.Select(item => item.Id));
        Assert.Equal(4.5, pick.Activities[0].AverageScore);
        Assert.Equal(2, pick.Activities[0].RatingCount);
        Assert.Equal(5, pick.Activities[0].MyScore);

        (await company.PutAsJsonAsync("/api/library/order", new LibraryOrderWriteDto
        {
            DestinationId = place.Id,
            ActivityIds = [a.Id, c.Id]
        })).EnsureSuccessStatusCode();
        var mine = await company.GetFromJsonAsync<LibraryPickDto>($"/api/library/pick?place={Uri.EscapeDataString(place.Name)}");
        Assert.Equal([a.Id, c.Id, b.Id], mine!.Activities.Select(item => item.Id));
        var theirs = await other.GetFromJsonAsync<LibraryPickDto>($"/api/library/pick?place={Uri.EscapeDataString(place.Name)}");
        Assert.Equal([b.Id, c.Id, a.Id], theirs!.Activities.Select(item => item.Id));

        var unknown = await company.GetFromJsonAsync<LibraryPickDto>($"/api/library/pick?place=没有这个地方{suffix}");
        Assert.Null(unknown!.Destination);
        var preset = await company.GetFromJsonAsync<LibraryPickDto>("/api/library/pick?place=特");
        Assert.Equal(Tekapo, preset!.Destination!.Id);

        var detail = await other.GetFromJsonAsync<LibraryActivityDetailDto>($"/api/library/activities/{b.Id}");
        Assert.Equal(2, detail!.Reviews.Count);
        Assert.Contains(detail.Reviews, review => review.Comment == "很好" && !review.Mine);

        var date = new DateOnly(2037, 6, 1);
        var order = await (await company.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = date, GuestCount = 2 }))
            .Content.ReadFromJsonAsync<OrderReadDto>();
        var day = await (await company.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = date,
            EndLocation = place.Name
        })).Content.ReadFromJsonAsync<ItineraryDayReadDto>();
        (await company.PostAsJsonAsync($"/api/orders/{order.Id}/days/{day!.Id}/activities", new OrderActivityWriteDto { Content = "手动填写" }))
            .EnsureSuccessStatusCode();
        var added = await (await company.PostAsJsonAsync($"/api/orders/{order.Id}/days/{day.Id}/activities/from-library", new OrderActivitiesFromLibraryDto
        {
            LibraryActivityIds = [c.Id, a.Id]
        })).Content.ReadFromJsonAsync<List<OrderActivityReadDto>>();
        Assert.Equal([$"Hotel C {suffix}", $"甲{suffix}"], added!.Select(item => item.Content));
        Assert.Equal([1, 2], added.Select(item => item.SortOrder));
        Assert.Equal(c.Id, added[0].LibraryActivityId);

        (await company.DeleteAsync($"/api/library/activities/{c.Id}")).EnsureSuccessStatusCode();
        var read = await company.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}");
        var kept = read!.Days.Single().Activities.Single(item => item.Content == $"Hotel C {suffix}");
        Assert.Null(kept.LibraryActivityId);
    }

    [Fact]
    public async Task Activity_photos_follow_vehicle_rules()
    {
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var company = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(company);
        var activity = await CreateActivityAsync(company, $"带图活动{suffix}", null, Tekapo);
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

        LibraryActivityDetailDto? saved = null;
        for (var index = 0; index < 3; index++)
        {
            using var form = PngForm(png, $"p{index}.png");
            var response = await company.PostAsync($"/api/library/activities/{activity.Id}/photos", form);
            response.EnsureSuccessStatusCode();
            saved = await response.Content.ReadFromJsonAsync<LibraryActivityDetailDto>();
        }

        Assert.Equal(3, saved!.Photos.Count);
        using (var fourth = PngForm(png, "p4.png"))
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await company.PostAsync($"/api/library/activities/{activity.Id}/photos", fourth)).StatusCode);
        }

        var driver = _factory.CreateClient();
        await TestAuth.RegisterAsync(driver, $"dp_{suffix}", "司导", "driver");
        var photo = saved.Photos[0];
        Assert.Equal(HttpStatusCode.OK, (await driver.GetAsync($"/api/library/activities/{activity.Id}/photos/{photo.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await driver.DeleteAsync($"/api/library/activities/{activity.Id}/photos/{photo.Id}")).StatusCode);
        var removed = await (await company.DeleteAsync($"/api/library/activities/{activity.Id}/photos/{photo.Id}"))
            .Content.ReadFromJsonAsync<LibraryActivityDetailDto>();
        Assert.Equal(2, removed!.Photos.Count);
    }

    private static MultipartFormDataContent PngForm(byte[] png, string fileName)
    {
        var content = new ByteArrayContent(png);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { content, "file", fileName } };
    }
}
