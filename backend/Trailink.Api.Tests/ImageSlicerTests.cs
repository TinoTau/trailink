using SkiaSharp;
using Trailink.Api.Services.Recognition;

namespace Trailink.Api.Tests;

public class ImageSlicerTests
{
    [Fact]
    public void Long_image_is_cut_into_overlapping_slices_within_the_token_budget()
    {
        var result = ImageSlicer.Split(Png(1938, 4045, transparent: true));

        Assert.Null(result.Error);
        Assert.Equal(1938, result.OriginalWidth);
        Assert.True(result.Slices.Count >= 2);
        Assert.All(result.Slices, s =>
        {
            Assert.Equal(ImageSlicer.MaxWidth, s.Width);
            Assert.True(s.Height <= ImageSlicer.MaxEdge);
            Assert.True(s.Tokens <= ImageSlicer.TokenBudget);
            using var bitmap = SKBitmap.Decode(s.Jpeg);
            Assert.Equal(s.Width, bitmap.Width);
            Assert.Equal(s.Height, bitmap.Height);
            // 透明处铺成白底，不会变黑
            var corner = bitmap.GetPixel(bitmap.Width - 2, 1);
            Assert.True(corner.Red > 240 && corner.Green > 240 && corner.Blue > 240);
        });

        for (var i = 1; i < result.Slices.Count; i++)
        {
            var previous = result.Slices[i - 1];
            Assert.Equal(previous.Top + previous.Height - ImageSlicer.Overlap, result.Slices[i].Top);
        }

        var last = result.Slices[^1];
        var scaledHeight = (int)Math.Round(4045 * (ImageSlicer.MaxWidth / 1938f));
        Assert.Equal(scaledHeight, last.Top + last.Height);
    }

    [Fact]
    public void Small_image_stays_whole_and_unscaled()
    {
        var result = ImageSlicer.Split(Png(1200, 900, transparent: false));

        var slice = Assert.Single(result.Slices);
        Assert.Equal((0, 1200, 900), (slice.Top, slice.Width, slice.Height));
    }

    [Fact]
    public void Unreadable_or_oversized_images_are_rejected()
    {
        Assert.NotNull(ImageSlicer.Split("not an image"u8.ToArray()).Error);
        Assert.NotNull(ImageSlicer.Split(Png(5000, 9000, transparent: false)).Error);
    }

    private static byte[] Png(int width, int height, bool transparent)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(transparent ? SKColors.Transparent : SKColors.White);
            using var ink = new SKPaint { Color = SKColors.Black };
            for (var y = 20; y < height; y += 40)
            {
                canvas.DrawRect(20, y, width / 2f, 12, ink);
            }
        }

        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Png, 100).ToArray();
    }
}
