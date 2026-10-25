namespace Trailink.Api.DTOs;

public class DriverWriteDto
{
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
}

public class DriverNoteWriteDto
{
    public string? Notes { get; set; }
}

public class DriverReadDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Contact { get; set; }
    public string? Notes { get; set; }
}
