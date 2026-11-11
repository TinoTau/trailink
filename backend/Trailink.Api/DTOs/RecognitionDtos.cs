using System.Text.Json.Serialization;

namespace Trailink.Api.DTOs;

public class RecognitionStatusDto
{
    /// <summary>服务器配置了密钥，调度台才显示「AI 建单」。</summary>
    public bool Enabled { get; set; }
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

public class CreatedOrderDto
{
    public Guid OrderId { get; set; }
}
