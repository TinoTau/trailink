namespace Trailink.Api.Models;

public class Order
{
    public Guid Id { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string? PlatformOrderNo { get; set; }
    public DateOnly StartDate { get; set; }
    public int GuestCount { get; set; }

    /// <summary>车型，如「五座车」「7座阿尔法或威尔法」，自由填写。</summary>
    public string? VehicleType { get; set; }

    /// <summary>南/北岛，见 <see cref="OrderIslands"/>；没填为 null（界面按南岛显示）。</summary>
    public string? Island { get; set; }
    public string? DriverNotes { get; set; }
    public string? SharedNotes { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public Guid? AssignedDispatcherUserId { get; set; }

    /// <summary>抢单范围，见 <see cref="OrderShareLevels"/>。默认调度自留。</summary>
    public int ShareLevel { get; set; }

    public Company? Company { get; set; }
    public User? CreatedBy { get; set; }
    public User? AssignedDispatcher { get; set; }
    public ICollection<ItineraryDay> Days { get; set; } = [];
    public ICollection<OrderFile> Files { get; set; } = [];
    public ICollection<OrderNote> ViewerNotes { get; set; } = [];

    public static string NewOrderNo()
    {
        return $"TL-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
    }
}

/// <summary>订单在南岛、北岛还是两岛都跑。</summary>
public static class OrderIslands
{
    public const string South = "south";
    public const string North = "north";
    public const string Both = "both";

    public const int VehicleTypeMaxLength = 50;

    /// <summary>空白为 null；其他值必须是三者之一，否则返回 false。</summary>
    public static bool TryNormalize(string? value, out string? island)
    {
        island = string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
        return island is null or South or North or Both;
    }
}

/// <summary>订单在抢单里给谁看。只有订单的调度员能改；公司内部、面向所有人要求订单已绑公司。</summary>
public static class OrderShareLevels
{
    /// <summary>调度自留：只给这位调度员自己的司导（没被他隐藏的）。</summary>
    public const int Own = 0;

    /// <summary>公司内部：给订单所属公司的司导（没被这位调度员隐藏的）。</summary>
    public const int Company = 1;

    /// <summary>面向所有人：所有司导都能看到，隐藏的也能看到。</summary>
    public const int Public = 2;

    public static bool IsValid(int level) => level is Own or Company or Public;
}
