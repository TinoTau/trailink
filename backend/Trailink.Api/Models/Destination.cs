namespace Trailink.Api.Models;

/// <summary>
/// 活动库的目的地。7 个常用住宿地点由 <see cref="Services.Weather.Places"/> 定义，迁移时写入，<see cref="Mark"/> 为浮雕字；
/// 其他目的地由公司账户在添加活动时新建，之后可以被搜索到。中文名、英文名至少填一个。
/// </summary>
public class Destination
{
    public Guid Id { get; set; }
    public string? NameZh { get; set; }
    public string? NameEn { get; set; }
    public string? Mark { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<LibraryActivityDestination> Activities { get; set; } = [];
}
