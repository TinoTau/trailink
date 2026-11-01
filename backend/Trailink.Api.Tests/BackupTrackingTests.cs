using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.Data;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

/// <summary>增量备份依赖的数据库触发器：修改时刷新 updated_at，删除时记入 backup_deletions（含级联删除）。</summary>
public class BackupTrackingTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public BackupTrackingTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Changes_refresh_updated_at_and_deletions_are_recorded()
    {
        var client = _factory.CreateClient();
        await TestAuth.SignInCompanyAsync(client);
        var date = new DateOnly(2037, 5, 1);
        var order = await (await client.PostAsJsonAsync("/api/orders", new OrderWriteDto { StartDate = date, GuestCount = 1 }))
            .Content.ReadFromJsonAsync<OrderReadDto>();
        var day = await (await client.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = date,
            EndLocation = "特卡波"
        })).Content.ReadFromJsonAsync<ItineraryDayReadDto>();

        var created = await UpdatedAtAsync("orders", order.Id);
        await Task.Delay(50);
        (await client.PutAsJsonAsync($"/api/orders/{order.Id}", new OrderWriteDto
        {
            StartDate = date,
            GuestCount = 3
        })).EnsureSuccessStatusCode();
        Assert.True(await UpdatedAtAsync("orders", order.Id) > created);

        (await client.DeleteAsync($"/api/orders/{order.Id}")).EnsureSuccessStatusCode();
        var deleted = await DeletedTablesAsync(order.Id, day!.Id);
        Assert.Contains(("orders", order.Id), deleted);
        Assert.Contains(("itinerary_days", day.Id), deleted);
    }

    private async Task<DateTime> UpdatedAtAsync(string table, Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
        return await db.Database
            .SqlQueryRaw<DateTime>($"SELECT updated_at AS \"Value\" FROM {table} WHERE id = {{0}}", id)
            .SingleAsync();
    }

    private async Task<List<(string Table, Guid Id)>> DeletedTablesAsync(params Guid[] ids)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
        var rows = await db.Database
            .SqlQueryRaw<DeletionRow>("SELECT table_name AS \"Table\", row_id AS \"RowId\" FROM backup_deletions WHERE row_id = ANY({0})", ids)
            .ToListAsync();
        return rows.Select(row => (row.Table, row.RowId)).ToList();
    }

    private sealed record DeletionRow(string Table, Guid RowId);
}
