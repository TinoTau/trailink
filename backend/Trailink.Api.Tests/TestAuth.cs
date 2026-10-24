using System.Net.Http.Json;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

public static class TestAuth
{
    public static async Task SignInCompanyAsync(HttpClient client)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"co_{suffix}",
            Password = "Passw0rd!",
            Name = "测试管理人",
            AccountType = "company",
            CompanyName = $"测试公司{suffix}"
        });
        response.EnsureSuccessStatusCode();
    }
}
