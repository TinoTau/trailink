using System.Text;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace Trailink.Api.Services.Recognition;

/// <summary>
/// 把调度员上传的行程图和电子票整理成交给模型的内容：
/// 图片切段；有文字层的 PDF 只取文字（便宜、数字不会认错）；扫描件 PDF 原样交给模型看。
/// 每个文件前面加一行「文件 #序号」，模型用这个序号说明哪张电子票属于哪项活动。
/// </summary>
public static class RecognitionSources
{
    public const int MaxFiles = 12;
    public const long MaxFileBytes = 10 * 1024 * 1024;
    public const long MaxTotalBytes = 40 * 1024 * 1024;

    /// <summary>PDF 只看前几页：后面通常是使用条款。</summary>
    public const int MaxPdfPages = 4;

    /// <summary>每份 PDF 最多交多少字。</summary>
    public const int MaxPdfChars = 8000;

    /// <summary>少于这么多字就当作扫描件，把 PDF 原样交给模型。</summary>
    public const int MinPdfChars = 40;

    public sealed record Upload(string FileName, byte[] Bytes);

    public sealed record Prepared(List<DraftPart> Parts, List<string> FileNames, string? Error);

    public static readonly HashSet<string> ImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    /// <summary>粘贴的文字最多这么多字（一张订单的行程绰绰有余）。</summary>
    public const int MaxPastedChars = 20000;

    /// <summary>粘贴的文字：去掉首尾空白，连续空行压成一行。</summary>
    public static string CleanPastedText(string? text) =>
        System.Text.RegularExpressions.Regex.Replace((text ?? "").Replace("\r\n", "\n").Trim(), @"\n{3,}", "\n\n");

    /// <summary>文件和粘贴的文字一起检查：至少有一样；文字不能太长。</summary>
    public static string? CheckLimits(IReadOnlyList<(string FileName, long Length)> files, string? pastedText)
    {
        var text = CleanPastedText(pastedText);
        if (text.Length > MaxPastedChars)
        {
            return $"粘贴的文字太长了（最多 {MaxPastedChars} 字），请只粘贴这张订单的行程。";
        }

        if (files.Count == 0)
        {
            return text.Length > 0 ? null : "请上传行程图、电子票，或粘贴行程文字。";
        }

        return CheckLimits(files);
    }

    public static string? CheckLimits(IReadOnlyList<(string FileName, long Length)> files)
    {
        if (files.Count == 0)
        {
            return "请上传行程图、电子票，或粘贴行程文字。";
        }

        if (files.Count > MaxFiles)
        {
            return $"一次最多上传 {MaxFiles} 个文件。";
        }

        foreach (var (name, length) in files)
        {
            var extension = Path.GetExtension(name).ToLowerInvariant();
            if (!ImageExtensions.Contains(extension) && extension != ".pdf")
            {
                return $"「{name}」不是 jpg / png / webp / pdf。";
            }

            if (length > MaxFileBytes)
            {
                return $"「{name}」超过 10MB。";
            }
        }

        return files.Sum(file => file.Length) > MaxTotalBytes ? "文件加起来超过 40MB，请分开识别。" : null;
    }

    public static Prepared Prepare(IReadOnlyList<Upload> uploads)
    {
        var parts = new List<DraftPart>();
        var names = new List<string>();
        for (var index = 0; index < uploads.Count; index++)
        {
            var upload = uploads[index];
            names.Add(upload.FileName);
            var extension = Path.GetExtension(upload.FileName).ToLowerInvariant();
            if (extension == ".pdf")
            {
                var text = PdfText(upload.Bytes);
                if (text.Length >= MinPdfChars)
                {
                    parts.Add(new DraftPart.Text($"【文件 #{index}】{upload.FileName}（PDF，以下是取出的文字）\n{text}"));
                }
                else
                {
                    parts.Add(new DraftPart.Text($"【文件 #{index}】{upload.FileName}（PDF 扫描件）"));
                    parts.Add(new DraftPart.Pdf(upload.Bytes));
                }

                continue;
            }

            var sliced = ImageSlicer.Split(upload.Bytes);
            if (sliced.Error is not null)
            {
                return new Prepared([], names, $"「{upload.FileName}」：{sliced.Error}");
            }

            parts.Add(new DraftPart.Text(sliced.Slices.Count == 1
                ? $"【文件 #{index}】{upload.FileName}（图片）"
                : $"【文件 #{index}】{upload.FileName}（长图，从上到下切成 {sliced.Slices.Count} 段，相邻两段有少量重叠，重叠处的内容只算一次）"));
            parts.AddRange(sliced.Slices.Select(slice => (DraftPart)new DraftPart.Jpeg(slice.Jpeg)));
        }

        return new Prepared(parts, names, null);
    }

    /// <summary>取 PDF 前几页的文字；打不开或没有文字层时返回空字符串。</summary>
    public static string PdfText(byte[] bytes)
    {
        try
        {
            using var document = PdfDocument.Open(bytes);
            var text = new StringBuilder();
            foreach (var page in document.GetPages().Take(MaxPdfPages))
            {
                var pageText = ContentOrderTextExtractor.GetText(page);
                if (!string.IsNullOrWhiteSpace(pageText))
                {
                    text.AppendLine($"--- 第 {page.Number} 页 ---");
                    text.AppendLine(pageText.Trim());
                }

                if (text.Length >= MaxPdfChars)
                {
                    break;
                }
            }

            var result = text.ToString().Trim();
            return result.Length > MaxPdfChars ? result[..MaxPdfChars] : result;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }
}
