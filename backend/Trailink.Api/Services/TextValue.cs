namespace Trailink.Api.Services;

public static class TextValue
{
    public static string? NullIfBlank(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
