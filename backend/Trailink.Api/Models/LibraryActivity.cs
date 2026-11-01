namespace Trailink.Api.Models;

/// <summary>活动库里的一项活动（住宿酒店也算）。所有公司账户共用，只有公司账户可以添加和编辑。</summary>
public class LibraryActivity
{
    public Guid Id { get; set; }
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }
    public string? SharedNotes { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<LibraryActivityDestination> Destinations { get; set; } = [];
    public ICollection<LibraryActivityPhoto> Photos { get; set; } = [];
    public ICollection<LibraryActivityRating> Ratings { get; set; } = [];
}

public class LibraryActivityDestination
{
    public Guid ActivityId { get; set; }
    public Guid DestinationId { get; set; }

    public LibraryActivity Activity { get; set; } = null!;
    public Destination Destination { get; set; } = null!;
}

public class LibraryActivityPhoto
{
    public Guid Id { get; set; }
    public Guid ActivityId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int SortOrder { get; set; }

    public LibraryActivity Activity { get; set; } = null!;
}

/// <summary>每人对每项活动一条评分（1–5）和可选评价，可以改。</summary>
public class LibraryActivityRating
{
    public Guid Id { get; set; }
    public Guid ActivityId { get; set; }
    public Guid UserId { get; set; }
    public int Score { get; set; }
    public string? Comment { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public LibraryActivity Activity { get; set; } = null!;
    public User User { get; set; } = null!;
}

/// <summary>某人在某个目的地的活动选择框里拖出来的顺序。Position 越小越靠前。</summary>
public class UserActivityOrder
{
    public Guid UserId { get; set; }
    public Guid DestinationId { get; set; }
    public Guid ActivityId { get; set; }
    public int Position { get; set; }
}
