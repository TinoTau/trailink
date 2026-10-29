using System.Globalization;

namespace Trailink.Api.Services;

public static class TextValue
{
    public static string? NullIfBlank(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    public static string? FirstTextElement(string? value)
    {
        var text = NullIfBlank(value);
        if (text is null)
        {
            return null;
        }

        var enumerator = StringInfo.GetTextElementEnumerator(text);
        return enumerator.MoveNext() ? enumerator.GetTextElement() : null;
    }
}
