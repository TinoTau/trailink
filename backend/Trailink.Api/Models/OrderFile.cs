namespace Trailink.Api.Models;

public class OrderFile
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;

    public Order Order { get; set; } = null!;
}
