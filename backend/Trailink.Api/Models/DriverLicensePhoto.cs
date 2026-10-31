namespace Trailink.Api.Models;

public class DriverLicensePhoto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int Side { get; set; }

    public User User { get; set; } = null!;
}
