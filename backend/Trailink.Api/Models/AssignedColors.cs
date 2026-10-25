namespace Trailink.Api.Models;

public static class AssignedColors
{
    public const string Default = "#C6F0E0";

    public static readonly string[] Allowed =
    [
        "#C6F0E0",
        "#D6E4FF",
        "#1677ff",
        "#52c41a",
        "#fa8c16",
        "#eb2f96",
        "#8c8c8c",
        "#262626"
    ];

    public static string Resolve(string? color)
    {
        var match = Allowed.FirstOrDefault(item => string.Equals(item, color?.Trim(), StringComparison.OrdinalIgnoreCase));
        return match ?? Default;
    }

    public static bool IsAllowed(string? color)
    {
        return Allowed.Any(item => string.Equals(item, color?.Trim(), StringComparison.OrdinalIgnoreCase));
    }
}
