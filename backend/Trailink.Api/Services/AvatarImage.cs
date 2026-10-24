using SkiaSharp;

namespace Trailink.Api.Services;

public static class AvatarImage
{
    public const int MaxEdge = 256;
    public const int JpegQuality = 72;

    public static async Task<(byte[]? Bytes, string Extension, string? Error)> CompressAsync(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        using var original = SKBitmap.Decode(buffer);
        if (original is null || original.Width < 1 || original.Height < 1)
        {
            return (null, "", "头像请上传 8MB 以内的 jpg / png / webp。");
        }

        using var fitted = Fit(original);
        using var image = SKImage.FromBitmap(fitted);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, JpegQuality);
        if (encoded is null)
        {
            return (null, "", "头像请上传 8MB 以内的 jpg / png / webp。");
        }

        return (encoded.ToArray(), ".jpg", null);
    }

    public static SKBitmap Fit(SKBitmap source)
    {
        var longest = Math.Max(source.Width, source.Height);
        if (longest <= MaxEdge)
        {
            return source.Copy();
        }

        var scale = MaxEdge / (float)longest;
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        return source.Resize(new SKImageInfo(width, height), SKFilterQuality.High) ?? source.Copy();
    }
}
