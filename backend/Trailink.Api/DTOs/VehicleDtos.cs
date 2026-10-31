namespace Trailink.Api.DTOs;

public class VehicleWriteDto
{
    public string Plate { get; set; } = string.Empty;
    public string? SharedNotes { get; set; }
    public string? Info { get; set; }
    public bool Available { get; set; } = true;
}

public class VehiclePhotoReadDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public class VehicleReadDto
{
    public Guid Id { get; set; }
    public string Plate { get; set; } = string.Empty;
    public string? SharedNotes { get; set; }
    public string? Info { get; set; }
    public bool Available { get; set; }
    public List<VehiclePhotoReadDto> Photos { get; set; } = [];
}

public class VehicleBindDto
{
    public Guid? VehicleId { get; set; }
    public bool OnlyDay { get; set; }
}

public class VehicleBindResultDto
{
    public Guid OrderId { get; set; }
    public Guid? VehicleId { get; set; }
    public List<Guid> DayIds { get; set; } = [];
}
