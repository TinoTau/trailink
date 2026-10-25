using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Tests;

public static class TestAuth
{
    public const string Password = "Passw0rd!";

    public static async Task SignInCompanyAsync(HttpClient client)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        await RegisterAsync(client, $"co_{suffix}", "测试管理人", "company", $"测试公司{suffix}");
    }

    public static async Task<SessionUserDto> RegisterAsync(
        HttpClient client,
        string username,
        string name,
        string accountType,
        string? companyName = null)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = username,
            Password = Password,
            Name = name,
            AccountType = accountType,
            CompanyName = companyName
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SessionUserDto>())!;
    }

    public static async Task PromoteDispatcherAsync(IServiceProvider services, Guid userId, Guid companyId)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
        db.CompanyMembers.Add(new CompanyMember
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            CompanyId = companyId,
            Role = UserRoles.Dispatcher
        });
        var user = await db.Users.FindAsync(userId);
        user!.Role = UserRoles.Dispatcher;
        await db.SaveChangesAsync();
    }
}
