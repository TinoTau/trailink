namespace Trailink.Api.DTOs;

public class LicensePhotoReadDto
{
    public Guid Id { get; set; }
    public int Side { get; set; }
    public string FileName { get; set; } = string.Empty;
}
