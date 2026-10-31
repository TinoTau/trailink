namespace Trailink.Api.Models;

public class VehiclePhoto
{
    public Guid Id { get; set; }
    public Guid VehicleId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int SortOrder { get; set; }

    public Vehicle Vehicle { get; set; } = null!;
}
