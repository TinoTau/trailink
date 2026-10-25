namespace Trailink.Api.Models;

public class OrderNote
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid UserId { get; set; }
    public string Notes { get; set; } = string.Empty;

    public Order? Order { get; set; }
    public User? User { get; set; }
}
