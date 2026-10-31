using System.Net.Http.Json;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Tests;

public class OrderRulesTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public OrderRulesTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void Business_today_is_new_zealand_date()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");
        var expected = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
        Assert.Equal(expected, BusinessDate.Today);
    }

    [Fact]
    public void Split_finished_historical_and_label_rules()
    {
        var today = new DateOnly(2030, 6, 10);
        var driverA = Guid.NewGuid();
        var driverB = Guid.NewGuid();
        var assigner = Guid.NewGuid();
        Order Make(params (DateOnly Date, Guid? Driver, Guid? AssignedBy)[] days) => new()
        {
            StartDate = days[0].Date,
            CreatedByUserId = assigner,
            Days = days.Select(day => new ItineraryDay
            {
                ServiceDate = day.Date,
                DriverId = day.Driver,
                AssignedByUserId = day.AssignedBy
            }).ToList()
        };
        var historical = OrderRules.Historical(today).Compile();

        var whole = Make((today.AddDays(-3), driverA, assigner), (today.AddDays(-2), driverA, null));
        Assert.False(OrderRules.IsSplit(whole));
        Assert.True(OrderRules.IsFinished(whole, today));
        Assert.True(historical(whole));

        var twoDrivers = Make((today, driverA, assigner), (today.AddDays(1), driverB, assigner));
        Assert.True(OrderRules.IsSplit(twoDrivers));
        Assert.True(OrderRules.IsInProgress(twoDrivers, today));
        Assert.False(OrderRules.IsFinished(twoDrivers, today));

        var twoAssigners = Make((today, driverA, assigner), (today.AddDays(1), driverA, Guid.NewGuid()));
        Assert.True(OrderRules.IsSplit(twoAssigners));

        var partial = Make((today.AddDays(-5), driverA, assigner), (today.AddDays(-4), null, null));
        Assert.True(OrderRules.IsSplit(partial));
        Assert.True(OrderRules.IsFinished(partial, today));
        Assert.False(historical(partial));

        var unassigned = Make((today, null, null));
        Assert.False(OrderRules.IsSplit(unassigned));
        Assert.False(historical(new Order()));

        Assert.Equal("P-1", OrderRules.Label(" P-1 \n第二行", "备注"));
        Assert.Equal("共用", OrderRules.Label("  ", "共用\n第二行"));
        Assert.Null(OrderRules.Label(null, " "));
    }

    [Fact]
    public async Task Order_list_returns_rule_results_and_overlaps()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = _factory.CreateClient();
        var company = await TestAuth.RegisterAsync(client, $"rule_{suffix}", "规则公司", "company", $"规则公司{suffix}");
        var date = new DateOnly(2036, 2, 3);

        var first = await CreateOrderAsync(client, $"R1-{suffix}", date, 2);
        var second = await CreateOrderAsync(client, null, date, 1, $"共用{suffix}\n第二行");

        (await client.PutAsJsonAsync($"/api/orders/{first.Id}/days/{first.Days[0].Id}", new ItineraryDayWriteDto
        {
            ServiceDate = first.Days[0].ServiceDate,
            DriverId = company.DriverId
        })).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"/api/orders/{second.Id}/driver", new AssignDriverDto
        {
            DriverId = company.DriverId
        })).EnsureSuccessStatusCode();

        var vehicle = await (await client.PostAsJsonAsync("/api/vehicles", new VehicleWriteDto { Plate = $"R{suffix[..5]}" }))
            .Content.ReadFromJsonAsync<VehicleReadDto>();
        foreach (var order in new[] { first, second })
        {
            (await client.PutAsJsonAsync($"/api/orders/{order.Id}/days/{order.Days[0].Id}/vehicle", new VehicleBindDto
            {
                VehicleId = vehicle!.Id,
                OnlyDay = true
            })).EnsureSuccessStatusCode();
        }

        var listed = (await client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders"))!;
        var firstRead = listed.Single(order => order.Id == first.Id);
        var secondRead = listed.Single(order => order.Id == second.Id);

        Assert.Equal($"R1-{suffix}", firstRead.Label);
        Assert.Equal($"共用{suffix}", secondRead.Label);
        Assert.True(firstRead.IsSplit);
        Assert.False(secondRead.IsSplit);
        Assert.False(firstRead.IsFinished);
        Assert.False(firstRead.IsHistorical);
        Assert.True(firstRead.HasDriverConflict);
        Assert.True(secondRead.HasDriverConflict);
        Assert.True(firstRead.Days.Single(day => day.ServiceDate == date).HasDriverConflict);
        Assert.False(firstRead.Days.Single(day => day.ServiceDate == date.AddDays(1)).HasDriverConflict);
        Assert.True(firstRead.Days.Single(day => day.ServiceDate == date).HasVehicleConflict);
        Assert.True(secondRead.Days.Single().HasVehicleConflict);
    }

    private static async Task<OrderReadDto> CreateOrderAsync(
        HttpClient client,
        string? platformOrderNo,
        DateOnly start,
        int days,
        string? sharedNotes = null)
    {
        var response = await client.PostAsJsonAsync("/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = platformOrderNo,
            SharedNotes = sharedNotes,
            StartDate = start,
            GuestCount = 2
        });
        response.EnsureSuccessStatusCode();
        var order = (await response.Content.ReadFromJsonAsync<OrderReadDto>())!;
        for (var index = 0; index < days; index++)
        {
            (await client.PostAsJsonAsync($"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
            {
                ServiceDate = start.AddDays(index)
            })).EnsureSuccessStatusCode();
        }

        return (await client.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}"))!;
    }
}
