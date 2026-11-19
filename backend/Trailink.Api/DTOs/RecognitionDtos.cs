using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public class RecognitionStatusDto
{
    /// <summary>服务器配置了密钥，调度台才显示「AI 建单」。</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// 能在订单上「填入行程明细」：服务器配置了密钥就行（司导也能用，在自己能改日期的单上）。
    /// 具体某张单能不能填，看订单的 <c>canReschedule</c>。
    /// </summary>
    public bool FillEnabled { get; set; }
    public string Model { get; set; } = string.Empty;
}

/// <summary>AI 识别出的订单草稿。只给调度员核对，不写数据库。</summary>
public class OrderDraftDto
{
    public string? PlatformOrderNo { get; set; }
    public int? GuestCount { get; set; }
    /// <summary>车型，如「五座车」「7座阿尔法或威尔法」；没写为 null。</summary>
    public string? VehicleType { get; set; }
    /// <summary>south / north / both；看不出来为 null。</summary>
    public string? Island { get; set; }
    /// <summary>整单的补充说明（包车规则、接送机航班等），写进调度员自己的备注。</summary>
    public string? Notes { get; set; }
    public List<OrderDraftDayDto> Days { get; set; } = [];
    /// <summary>需要调度员留意的问题：年份是推断的、抬头和正文日期矛盾、看不清的字等。</summary>
    public List<string> Warnings { get; set; } = [];
    /// <summary>上传的文件名，按上传顺序；活动的 <see cref="OrderDraftActivityDto.TicketIndex"/> 指向这里。</summary>
    public List<string> Files { get; set; } = [];
    public string Model { get; set; } = string.Empty;
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
}

public class OrderDraftDayDto
{
    public DateOnly ServiceDate { get; set; }
    /// <summary>默认导入；不在南岛包车范围（如飞去北岛之后的日子）默认不勾。</summary>
    public bool Include { get; set; } = true;
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public List<OrderDraftActivityDto> Activities { get; set; } = [];
    /// <summary>这一天拿不准的字段名：serviceDate / description / endLocation。</summary>
    public List<string> Uncertain { get; set; } = [];
    /// <summary>给调度员看的一句提醒，例如「这天已飞往奥克兰」。</summary>
    public string? Note { get; set; }
}

public class OrderDraftActivityDto
{
    public string Content { get; set; } = string.Empty;
    /// <summary>activity 是要预订的项目，hotel 是当晚住宿。</summary>
    public string Kind { get; set; } = "activity";
    public string? Provider { get; set; }
    public Guid? LibraryActivityId { get; set; }
    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }
    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }
    /// <summary>这项活动的电子票是第几个上传的文件。</summary>
    public int? TicketIndex { get; set; }
    /// <summary>拿不准的字段名：content / provider / bookingTime / checkinTime / ticket。</summary>
    public List<string> Uncertain { get; set; } = [];
}

/// <summary>调度员核对、修改后提交的订单。电子票文件随表单以 <c>ticket-{序号}</c> 上传。</summary>
public class OrderImportDto
{
    public string? PlatformOrderNo { get; set; }
    public int GuestCount { get; set; }
    public string? VehicleType { get; set; }
    public string? Island { get; set; }
    public string? Notes { get; set; }

    /// <summary>公司账户在调度台上建单传 true，放在自己的调度台上；在派给调度建单不传，留在公司订单池。</summary>
    public bool? OnMyDesk { get; set; }

    public List<OrderImportDayDto> Days { get; set; } = [];
}

public class OrderImportDayDto
{
    public DateOnly ServiceDate { get; set; }
    public string? Description { get; set; }
    public string? EndLocation { get; set; }
    public List<OrderImportActivityDto> Activities { get; set; } = [];
}

public class OrderImportActivityDto
{
    public string Content { get; set; } = string.Empty;
    public string? Provider { get; set; }
    public Guid? LibraryActivityId { get; set; }
    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? BookingTime { get; set; }
    [JsonConverter(typeof(LocalDateTimeJsonConverter))]
    public DateTime? CheckinTime { get; set; }
    public int? TicketIndex { get; set; }
}

/// <summary>
/// 粗单填入行程明细：核对后的细单。以细单为准；细单没填的（人数、车型、南/北岛、订单号，某天的行程说明、住宿、活动）保留粗单原来的。
/// 电子票和行程图随表单以 <c>file-{序号}</c> 上传，和 AI 建单一样。
/// </summary>
public class OrderFillDto
{
    public string? PlatformOrderNo { get; set; }
    /// <summary>没写为 null，保留粗单的人数。</summary>
    public int? GuestCount { get; set; }
    public string? VehicleType { get; set; }
    /// <summary>south / north / both；没写为 null，保留粗单的。</summary>
    public string? Island { get; set; }
    /// <summary>整单补充说明，接在自己备注的后面（司导没有调度备注，不写）。</summary>
    public string? Notes { get; set; }
    public List<OrderImportDayDto> Days { get; set; } = [];
}

/// <summary>填入行程明细前的对照：细单每一天对应粗单的第几天，司导、车辆跟着第几天走。</summary>
public class OrderFillPreviewDto
{
    public List<OrderFillDayPreviewDto> Days { get; set; } = [];
    /// <summary>细单比粗单短，粗单末尾多出来、会删掉的天。</summary>
    public List<OrderFillRemovedDayDto> Removed { get; set; } = [];
    /// <summary>给人看的提醒：冲突、删掉的天上派过的司导。</summary>
    public List<string> Warnings { get; set; } = [];
}

public class OrderFillDayPreviewDto
{
    public DateOnly ServiceDate { get; set; }
    /// <summary>粗单上对应的那天；null 是新加的一天（没派司导）。</summary>
    public DateOnly? FromDate { get; set; }
    public string? DriverName { get; set; }
    public string? Plate { get; set; }
    /// <summary>司导那天已经有别的行程：照样保留，日历上标红，由调度员调整。</summary>
    public bool DriverConflict { get; set; }
    public bool VehicleConflict { get; set; }
}

public class OrderFillRemovedDayDto
{
    public DateOnly ServiceDate { get; set; }
    public string? DriverName { get; set; }
    public string? Plate { get; set; }
    /// <summary>这天原来写了行程或活动。</summary>
    public bool HasContent { get; set; }
}

public class OrderFillResultDto
{
    public OrderReadDto Order { get; set; } = null!;
    public List<string> Warnings { get; set; } = [];
}

public class CreatedOrderDto
{
    public Guid OrderId { get; set; }
}
