using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public sealed class LocalDateTimeJsonConverter : JsonConverter<DateTime?>
{
    private const string Format = "yyyy-MM-dd'T'HH:mm:ss";

    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException("活动时间必须是不带时区的当地日期时间字符串。");
        }

        var text = reader.GetString();
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (HasTimeZone(text))
        {
            throw new JsonException("活动时间必须是当地日期时间，不能包含 Z 或时区偏移。");
        }

        if (!DateTime.TryParseExact(
                text,
                Format,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var value))
        {
            throw new JsonException("活动时间格式必须为 YYYY-MM-DDTHH:mm:ss。");
        }

        return DateTime.SpecifyKind(value, DateTimeKind.Unspecified);
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(value.Value.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture));
    }

    private static bool HasTimeZone(string text)
    {
        if (text.EndsWith("Z", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var timeSeparator = text.IndexOf('T');
        if (timeSeparator < 0)
        {
            return false;
        }

        return text.AsSpan(timeSeparator).IndexOf('+') >= 0 ||
               text.AsSpan(timeSeparator).LastIndexOf('-') >= 0;
    }
}
