namespace Trailink.Api.Services;

public enum StoredFileKind
{
    Qr,
    Avatar,
    Ticket,
    Order
}

public sealed class AppFileStore(IWebHostEnvironment env)
{
    public const long ImageLimit = 1_000_000;
    public const long DocumentLimit = 8_000_000;
    public const long AvatarUploadLimit = 8_000_000;

    public static readonly HashSet<string> ImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    public static readonly HashSet<string> DocumentExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

    private readonly string _appData = Path.Combine(env.ContentRootPath, "App_Data");

    public async Task<(string? RelativePath, string? Error)> SaveAsync(
        StoredFileKind kind,
        Guid id,
        IFormFile? file,
        string? previousPath,
        IReadOnlySet<string> extensions,
        long maxBytes,
        string invalidMessage,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length < 1)
        {
            return (null, "请选择文件。");
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!extensions.Contains(ext) || file.Length > maxBytes)
        {
            return (null, invalidMessage);
        }

        var folder = kind switch
        {
            StoredFileKind.Qr => "qr",
            StoredFileKind.Avatar => "avatars",
            StoredFileKind.Ticket => "tickets",
            StoredFileKind.Order => "orders",
            _ => "other"
        };

        byte[]? compressed = null;
        if (kind == StoredFileKind.Avatar)
        {
            var result = await AvatarImage.CompressAsync(file, cancellationToken);
            if (result.Error is not null)
            {
                return (null, result.Error);
            }

            compressed = result.Bytes;
            ext = result.Extension;
        }

        var relative = $"files/{folder}/{id:D}{ext}";
        var full = Resolve(relative);
        if (full is null)
        {
            return (null, "无法保存文件。");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        if (compressed is not null)
        {
            await File.WriteAllBytesAsync(full, compressed, cancellationToken);
        }
        else
        {
            await using var stream = File.Create(full);
            await file.CopyToAsync(stream, cancellationToken);
        }

        RemoveReplaced(folder, id, relative, previousPath);
        return (relative, null);
    }

    public (string FullPath, string ContentType)? Open(string? relativePath)
    {
        var full = Resolve(relativePath);
        if (full is null || !File.Exists(full))
        {
            return null;
        }

        return (full, ContentType(Path.GetExtension(full)));
    }

    public void Delete(string? relativePath)
    {
        var full = Resolve(relativePath);
        if (full is not null && File.Exists(full))
        {
            File.Delete(full);
        }
    }

    private void RemoveReplaced(string folder, Guid id, string keepRelative, string? previousPath)
    {
        if (!string.Equals(previousPath, keepRelative, StringComparison.OrdinalIgnoreCase))
        {
            Delete(previousPath);
        }

        var dir = Resolve($"files/{folder}");
        if (dir is null || !Directory.Exists(dir))
        {
            return;
        }

        var keep = Resolve(keepRelative);
        var prefix = id.ToString("D");
        foreach (var path in Directory.EnumerateFiles(dir, prefix + ".*"))
        {
            if (keep is not null && path.Equals(keep, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            File.Delete(path);
        }
    }

    private string? Resolve(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        var combined = Path.GetFullPath(Path.Combine(_appData, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var root = Path.GetFullPath(_appData).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return combined.StartsWith(root, StringComparison.OrdinalIgnoreCase) ? combined : null;
    }

    public static string ContentType(string extension) => extension.ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".pdf" => "application/pdf",
        _ => "image/jpeg"
    };
}
