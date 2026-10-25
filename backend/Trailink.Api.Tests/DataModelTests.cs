using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Tests;

public class DataModelTests
{
    [Fact]
    public void DbContext_maps_core_tables()
    {
        using var db = CreateContext();
        var tables = db.Model.GetEntityTypes()
            .Select(type => type.GetTableName())
            .Where(name => name is not null)
            .Cast<string>()
            .OrderBy(name => name)
            .ToArray();

        Assert.Equal(
            ["companies", "company_members", "company_notes", "dispatcher_applications", "dispatcher_notes", "driver_applications", "driver_notes", "drivers", "itinerary_days", "order_activities", "order_files", "order_notes", "orders", "users"],
            tables);
    }

    [Fact]
    public void Itinerary_days_have_unique_order_and_date()
    {
        using var db = CreateContext();
        var entity = db.Model.FindEntityType(typeof(ItineraryDay));
        Assert.NotNull(entity);

        var uniqueIndex = entity.GetIndexes().Single(index =>
            index.IsUnique &&
            index.Properties.Select(property => property.Name)
                .SequenceEqual(["OrderId", "ServiceDate"]));

        Assert.True(uniqueIndex.IsUnique);
    }

    [Fact]
    public void Order_no_is_unique()
    {
        using var db = CreateContext();
        var entity = db.Model.FindEntityType(typeof(Order));
        Assert.NotNull(entity);
        Assert.Contains(entity.GetIndexes(), index =>
            index.IsUnique && index.Properties.Select(property => property.Name).SequenceEqual(["OrderNo"]));
    }

    private static TrailinkDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TrailinkDbContext>()
            .UseNpgsql("Host=localhost;Database=trailink;Username=trailink;Password=trailink")
            .Options;

        return new TrailinkDbContext(options);
    }
}
