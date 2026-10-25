using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;

namespace Trailink.Api.Services;

public static class AccountText
{
    public static string? UsernameError(string username) =>
        username.Length is < 3 or > 50 ? "用户名需要 3 到 50 个字符。" : null;

    public static string? NameError(string name) =>
        name.Length is < 1 or > 100 ? "请填写姓名。" : null;

    public static string? PasswordError(string? password) =>
        string.IsNullOrWhiteSpace(password) || password.Length < 8 ? "密码至少 8 位。" : null;

    public static string? ReplacementPasswordError(string? password) =>
        string.IsNullOrEmpty(password) || password.Length < 8 ? "密码至少 8 位。" : null;

    public static async Task<bool> UsernameTakenAsync(
        TrailinkDbContext db,
        string username,
        Guid? exceptUserId,
        CancellationToken cancellationToken) =>
        await db.Users.AnyAsync(
            user => (exceptUserId == null || user.Id != exceptUserId) && user.Username.ToLower() == username.ToLower(),
            cancellationToken);

    public static async Task<string?> CompanyNameErrorAsync(
        TrailinkDbContext db,
        string name,
        Guid? exceptCompanyId,
        CancellationToken cancellationToken)
    {
        if (name.Length is < 1 or > 200)
        {
            return "请填写公司名称。";
        }

        var taken = await db.Companies.AnyAsync(
            company => (exceptCompanyId == null || company.Id != exceptCompanyId) && company.Name.ToLower() == name.ToLower(),
            cancellationToken);
        return taken ? "公司名称已被使用。" : null;
    }
}
