using SkiaSharp;

namespace Trailink.Api.Services.Recognition;

/// <summary>
/// 把旅行社发来的长图切成几段，交给识图模型。
/// 整张长图直接发送会被模型缩小，小字就认不清了；切段后每段都按接近原尺寸识别。
/// </summary>
public static class ImageSlicer
{
    /// <summary>宽度超过这个值才缩小，保证正文小字仍有 11 像素以上。</summary>
    public const int MaxWidth = 1600;

    /// <summary>每段的视觉 token 上限，略低于模型的 4,784，避免被再次缩小。</summary>
    public const int TokenBudget = 4700;

    /// <summary>模型的长边上限。</summary>
    public const int MaxEdge = 2576;

    /// <summary>相邻两段重叠的高度，防止一行字恰好被切断。</summary>
    public const int Overlap = 120;

    /// <summary>超过这个像素数的图片不解码，保护 1GB 内存的服务器。</summary>
    public const long MaxPixels = 40_000_000;

    public const int JpegQuality = 85;

    private const int Patch = 28;

    public sealed record Slice(int Index, int Top, int Width, int Height, byte[] Jpeg)
    {
        public int Tokens => (int)(Math.Ceiling(Width / (double)Patch) * Math.Ceiling(Height / (double)Patch));
    }

    public sealed record Result(IReadOnlyList<Slice> Slices, int OriginalWidth, int OriginalHeight, string? Error)
    {
        public int Tokens => Slices.Sum(s => s.Tokens);
        public long Bytes => Slices.Sum(s => (long)s.Jpeg.Length);
    }

    public static Result Split(byte[] data)
    {
        using var codec = SKCodec.Create(new MemoryStream(data));
        if (codec is null)
        {
            return Fail("图片无法识别，请上传 jpg / png / webp。");
        }

        var info = codec.Info;
        if ((long)info.Width * info.Height > MaxPixels)
        {
            return Fail("图片太大，请上传 4000 万像素以内的图片。");
        }

        using var decoded = SKBitmap.Decode(codec);
        if (decoded is null || decoded.Width < 1 || decoded.Height < 1)
        {
            return Fail("图片无法识别，请上传 jpg / png / webp。");
        }

        using var page = Normalize(decoded);
        var sliceHeight = SliceHeight(page.Width);
        var slices = new List<Slice>();
        var step = sliceHeight - Overlap;
        for (var top = 0; ; top += step)
        {
            var height = Math.Min(sliceHeight, page.Height - top);
            slices.Add(new Slice(slices.Count, top, page.Width, height, Encode(page, top, height)));
            if (top + height >= page.Height)
            {
                break;
            }
        }

        return new Result(slices, info.Width, info.Height, null);
    }

    /// <summary>按宽度算出每段最高能切多高，保证每段都不会被模型再缩小。</summary>
    public static int SliceHeight(int width)
    {
        var columns = (int)Math.Ceiling(width / (double)Patch);
        var rows = TokenBudget / columns;
        return Math.Clamp(rows * Patch, Overlap * 4, MaxEdge);
    }

    /// <summary>铺白底（png 的透明处）并把过宽的图缩到 MaxWidth。</summary>
    private static SKBitmap Normalize(SKBitmap source)
    {
        var scale = source.Width > MaxWidth ? MaxWidth / (float)source.Width : 1f;
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));

        var target = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Opaque));
        using var canvas = new SKCanvas(target);
        canvas.Clear(SKColors.White);
        using var paint = new SKPaint { FilterQuality = SKFilterQuality.High, IsAntialias = true };
        canvas.DrawBitmap(source, new SKRect(0, 0, width, height), paint);
        return target;
    }

    private static byte[] Encode(SKBitmap page, int top, int height)
    {
        using var part = new SKBitmap();
        page.ExtractSubset(part, new SKRectI(0, top, page.Width, top + height));
        using var image = SKImage.FromBitmap(part);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, JpegQuality);
        return encoded.ToArray();
    }

    private static Result Fail(string error) => new([], 0, 0, error);
}
