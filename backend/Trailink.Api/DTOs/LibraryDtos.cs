namespace Trailink.Api.DTOs;

public class DestinationDto
{
    public Guid Id { get; set; }
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }

    /// <summary>常用地点的浮雕字；手动新建的目的地为 null。</summary>
    public string? Mark { get; set; }

    /// <summary>显示用：有中文名用中文名，否则英文名。</summary>
    public string Name { get; set; } = string.Empty;
}

public class DestinationWriteDto
{
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }
}

public class LibraryActivityWriteDto
{
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }
    public string? SharedNotes { get; set; }
    public List<Guid> DestinationIds { get; set; } = [];
}

public class LibraryPhotoReadDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public class LibraryActivityReadDto
{
    public Guid Id { get; set; }
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? SharedNotes { get; set; }
    public List<DestinationDto> Destinations { get; set; } = [];
    public List<LibraryPhotoReadDto> Photos { get; set; } = [];

    /// <summary>平均评分（1–5，保留一位小数）；还没人评分为 null。</summary>
    public double? AverageScore { get; set; }
    public int RatingCount { get; set; }

    /// <summary>当前用户自己的评分和评价。</summary>
    public int? MyScore { get; set; }
    public string? MyComment { get; set; }
}

public class LibraryReviewDto
{
    public string UserName { get; set; } = string.Empty;
    public int Score { get; set; }
    public string? Comment { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public bool Mine { get; set; }
}

public class LibraryActivityDetailDto : LibraryActivityReadDto
{
    public List<LibraryReviewDto> Reviews { get; set; } = [];
}

/// <summary>当日详情「添加活动」弹框：这一天住宿地点对应的目的地，以及按个人顺序和评分排好的活动。</summary>
public class LibraryPickDto
{
    public DestinationDto? Destination { get; set; }
    public List<LibraryActivityReadDto> Activities { get; set; } = [];
}

public class LibraryRatingWriteDto
{
    public int Score { get; set; }
    public string? Comment { get; set; }
}

public class LibraryOrderWriteDto
{
    public Guid DestinationId { get; set; }
    public List<Guid> ActivityIds { get; set; } = [];
}

public class OrderActivitiesFromLibraryDto
{
    public List<Guid> LibraryActivityIds { get; set; } = [];
}
