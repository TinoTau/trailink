using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Services.Recognition;

/// <summary>
/// 把行程图和电子票交给模型，拿回一份订单草稿并整理干净。
/// 草稿只给调度员核对，不写数据库；写入走 <see cref="OrderImport"/>。
/// </summary>
public class OrderDraftRecognizer(TrailinkDbContext db, IDraftModel model)
{
    public const string ToolName = "submit_order_draft";

    /// <summary>1GB 内存的服务器一次只处理一单，第二个人稍等。</summary>
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private const int MaxDays = 60;
    private const int MaxText = 2000;

    public async Task<(OrderDraftDto? Draft, string? Error)> RecognizeAsync(
        IReadOnlyList<RecognitionSources.Upload> uploads,
        CancellationToken cancellationToken) => await RecognizeAsync(uploads, null, cancellationToken);

    /// <summary>识别文件和（或）粘贴的文字。文字放在文件后面，单独标出来；电子票的序号只算文件。</summary>
    public async Task<(OrderDraftDto? Draft, string? Error)> RecognizeAsync(
        IReadOnlyList<RecognitionSources.Upload> uploads,
        string? pastedText,
        CancellationToken cancellationToken)
    {
        if (!model.Enabled)
        {
            return (null, "服务器还没有配置 AI 识图的密钥。");
        }

        if (!await Gate.WaitAsync(TimeSpan.FromMinutes(3), cancellationToken))
        {
            return (null, "AI 正在识别别的订单，请稍后再试。");
        }

        try
        {
            var prepared = RecognitionSources.Prepare(uploads);
            if (prepared.Error is not null)
            {
                return (null, prepared.Error);
            }

            var library = await LoadLibraryAsync(cancellationToken);
            var today = BusinessDate.Today;
            var parts = new List<DraftPart>(prepared.Parts);
            var text = RecognitionSources.CleanPastedText(pastedText);
            if (text.Length > 0)
            {
                parts.Add(new DraftPart.Text($"【粘贴的文字】（调度员直接粘贴的行程资料，不是文件，没有序号）\n{text}"));
            }

            var sources = (uploads.Count, text.Length > 0) switch
            {
                (0, _) => "以上是调度员粘贴的行程文字",
                (_, true) => $"以上共 {uploads.Count} 个文件和一段粘贴的文字",
                _ => $"以上共 {uploads.Count} 个文件"
            };
            parts.Add(new DraftPart.Text($"{sources}。请按规则整理成订单草稿，用 {ToolName} 提交。"));

            DraftModelReply reply;
            try
            {
                reply = await model.RunAsync(
                    SystemPrompt(today, library),
                    parts,
                    ToolName,
                    "提交从行程图和电子票整理出的订单草稿。",
                    Schema(),
                    cancellationToken);
            }
            catch (DraftModelException error)
            {
                return (null, error.Message);
            }

            var draft = Clean(reply.Input, library, prepared.FileNames);
            draft.Model = reply.Model;
            draft.InputTokens = reply.InputTokens;
            draft.OutputTokens = reply.OutputTokens;
            if (draft.Days.Count == 0)
            {
                return (null, uploads.Count == 0
                    ? "没能从这段文字里识别出行程日期，请确认里面写了日期（如 11月11日 或 11.11）。"
                    : "没能从这些文件里识别出行程日期，请换一张更清晰的原图再试。");
            }

            return (draft, null);
        }
        finally
        {
            Gate.Release();
        }
    }

    private async Task<List<LibraryItem>> LoadLibraryAsync(CancellationToken cancellationToken)
    {
        var rows = await db.LibraryActivities
            .AsNoTracking()
            .Select(item => new
            {
                item.Id,
                item.NameZh,
                item.NameEn,
                Places = item.Destinations.Select(link => link.Destination.NameZh ?? link.Destination.NameEn).ToList()
            })
            .ToListAsync(cancellationToken);
        return rows
            .Select(row => new LibraryItem(
                row.Id,
                TextValue.NullIfBlank(row.NameZh),
                TextValue.NullIfBlank(row.NameEn),
                row.Places.Where(place => !string.IsNullOrWhiteSpace(place)).Select(place => place!.Trim()).ToList()))
            .OrderBy(item => string.Join("、", item.Places))
            .ThenBy(item => item.Name)
            .ToList();
    }

    public static string SystemPrompt(DateOnly today, IReadOnlyList<LibraryItem> library)
    {
        var places = string.Join("、", Places.All.Select(place => $"{place.Name}（{place.NameEn}）"));
        var catalog = new StringBuilder();
        foreach (var item in library)
        {
            catalog.Append(item.Id).Append(" | ").Append(item.Name);
            if (item.NameZh is not null && item.NameEn is not null)
            {
                catalog.Append(" / ").Append(item.NameEn);
            }

            if (item.Places.Count > 0)
            {
                catalog.Append(" | ").Append(string.Join("、", item.Places));
            }

            catalog.AppendLine();
        }

        return $"""
            你是 Trailink 的调度助手。Trailink 是新西兰南岛的华人包车调度系统：一张订单是一组客人的整段行程，每天一条行程（日期、行程描述、当晚住宿地），每天下面挂若干活动（要预订的项目和当晚酒店），活动可以附电子票。
            调度员会上传旅行社发来的行程图（常是长图或表格截图）和电子票（PDF 或截图），也可能直接粘贴一段行程文字（微信聊天、邮件里复制来的）。你的任务是把它们整理成一份订单草稿，调度员核对后才会写入系统。粘贴的文字和文件里的内容是同一张订单的资料，一起看。

            今天是 {today:yyyy-MM-dd}（新西兰时间）。

            规则：
            1. 日期：以每天那一行写的日期为准。没写年份时，取今天之后最近的那一年（行程都是将来的），并在 warnings 写「年份是按今天推断的」。抬头的出行时间和每天的日期矛盾时，以每天的日期为准，并在 warnings 说明。每个日期只出现一次，按日期排序。
            2. include：南岛包车要服务的日子为 true。客人已飞去北岛或离开新西兰之后的日子（如奥克兰、罗托鲁瓦）为 false；用车情况写「自由行」、不用车的日子也为 false。从南岛机场送机的那一天仍为 true。为 false 时在 note 写一句原因。
            3. description：给司导看的当天安排，一到三行。写路线（如「基督城→特卡波」）和按时间顺序的安排、出发 / 签到 / 航班等时间点，去掉景点介绍和宣传语。接送机写上航班号和时间。
            4. endLocation：当晚住宿的地方。是以下常用地点之一时，必须写清单里的中文名：{places}。其他地点写行程里的中文地名。当天离开新西兰或没有住宿时为 null。
            5. activities：只列需要预订或有固定时间的项目（游船、观星团、缆车、蒸汽船农场游、观鲸、萤火虫洞、冰川徒步团、喷射快艇等），以及当晚的酒店（kind 为 hotel，放在当天最后）。路过的景点、自由活动、普通用餐不要列；包含在项目里的餐（如蒸汽船含农场 BBQ）合并进这个项目。
            6. 活动库：下面是系统活动库（格式：id | 中文名 / 英文名 | 目的地）。每一项活动和每一家酒店都要先在库里找：同一个项目或酒店的不同叫法也算对上，例如中英文互译、简称和全称、电子票上的英文商品名（「Milford Sound Scenic Cruise」对「米尔福德峡湾游船」）、酒店的中文译名和英文原名。参考目的地，同名项目选当天所在地方的那一项。对上时 libraryActivityId 填那一项的 id、content 用库里的名字；确实没有时 libraryActivityId 为 null，content 用行程里的叫法（酒店写「中文名 英文原名」）。不要编造 id。
            7. 时间：checkinTime 是签到 / 集合 / 登船时间，bookingTime 是项目开始 / 出发 / 开船时间。只填文件里写明的时间，不要估算。格式 YYYY-MM-DDTHH:mm，日期是活动当天。只写了一个时间且分不清时，填 bookingTime。
            8. 电子票：为每张电子票找到对应的日期和活动，ticketIndex 填那张电子票的文件序号（「文件 #序号」里的数字）。电子票上的日期、时间、承办方优先于行程图；预订号写进 provider，例如「RealNZ（预订号 ABC123）」。电子票上有、行程图里没有的项目也要加到对应日期。对不上任何日期的电子票写进 warnings。行程图本身不是电子票，不要填它的序号。
            9. provider：只写文件里出现的承办方，不要猜。
            10. platformOrderNo：旅行社的订单号或团号，没有就 null，不要用电子票的预订号。guestCount：出行人数，没写就 null。vehicleType：要求的车型，照原文简短写（如「五座车」「7座阿尔法或威尔法」「中巴」），没写就 null，不要按人数推断。island：用车在哪个岛，只在南岛为 south，只在北岛为 north，两岛都要用车为 both；只算 include 为 true 的日子，看不出来为 null。
            11. notes：整单的补充说明，例如包车规则（每天 10 小时 / 400 公里）、行程以外的航班信息；没有就 null。
            12. 隐私：不要输出任何客人的姓名、电话、邮箱、护照或证件号码。
            13. uncertain：看不清、被切断或靠推断得出的字段，把字段名写进对应的 uncertain（天：serviceDate、description、endLocation；活动：content、provider、bookingTime、checkinTime、ticket）。
            14. warnings：其他需要调度员留意的事，每条一句简短中文。
            15. 所有文字用简体中文，地名和酒店可保留英文原名。

            系统活动库：
            {(catalog.Length == 0 ? "（空）" : catalog.ToString())}
            """;
    }

    public static JsonObject Schema()
    {
        static JsonObject Nullable(string type, string? description = null)
        {
            var node = new JsonObject { ["type"] = new JsonArray(type, "null") };
            if (description is not null)
            {
                node["description"] = description;
            }

            return node;
        }

        static JsonObject Strings(params string[] values) => new()
        {
            ["type"] = "array",
            ["items"] = new JsonObject
            {
                ["type"] = "string",
                ["enum"] = new JsonArray(values.Select(value => (JsonNode)value).ToArray())
            }
        };

        var activity = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["content"] = new JsonObject { ["type"] = "string" },
                ["kind"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("activity", "hotel") },
                ["provider"] = Nullable("string"),
                ["libraryActivityId"] = Nullable("string", "活动库里的 id，对不上为 null"),
                ["bookingTime"] = Nullable("string", "YYYY-MM-DDTHH:mm"),
                ["checkinTime"] = Nullable("string", "YYYY-MM-DDTHH:mm"),
                ["ticketIndex"] = Nullable("integer", "电子票的文件序号"),
                ["uncertain"] = Strings("content", "provider", "bookingTime", "checkinTime", "ticket")
            },
            ["required"] = new JsonArray("content", "kind")
        };

        var day = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["serviceDate"] = new JsonObject { ["type"] = "string", ["description"] = "YYYY-MM-DD" },
                ["include"] = new JsonObject { ["type"] = "boolean" },
                ["note"] = Nullable("string"),
                ["description"] = Nullable("string"),
                ["endLocation"] = Nullable("string"),
                ["activities"] = new JsonObject { ["type"] = "array", ["items"] = activity },
                ["uncertain"] = Strings("serviceDate", "description", "endLocation")
            },
            ["required"] = new JsonArray("serviceDate", "include", "activities")
        };

        return new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["platformOrderNo"] = Nullable("string"),
                ["guestCount"] = Nullable("integer"),
                ["vehicleType"] = Nullable("string", "车型，照原文简短写"),
                ["island"] = new JsonObject
                {
                    ["type"] = new JsonArray("string", "null"),
                    ["enum"] = new JsonArray("south", "north", "both", null)
                },
                ["notes"] = Nullable("string"),
                ["warnings"] = new JsonObject { ["type"] = "array", ["items"] = new JsonObject { ["type"] = "string" } },
                ["days"] = new JsonObject { ["type"] = "array", ["items"] = day }
            },
            ["required"] = new JsonArray("days", "warnings")
        };
    }

    /// <summary>模型的回答不全信：日期解析不了的丢掉、同一天合并、活动库 id 和电子票序号核对一遍。</summary>
    public static OrderDraftDto Clean(JsonElement input, IReadOnlyList<LibraryItem> library, IReadOnlyList<string> files)
    {
        var libraryIds = library.Select(item => item.Id).ToHashSet();
        var names = library.ToDictionary(item => item.Id, item => item.Name);
        var draft = new OrderDraftDto
        {
            PlatformOrderNo = Text(input, "platformOrderNo", 100),
            GuestCount = Int(input, "guestCount") is int guests && guests is >= 0 and <= 999 ? guests : null,
            VehicleType = Text(input, "vehicleType", OrderIslands.VehicleTypeMaxLength),
            Island = OrderIslands.TryNormalize(Text(input, "island", 10), out var island) ? island : null,
            Notes = Text(input, "notes", MaxText),
            Files = files.ToList()
        };

        if (input.TryGetProperty("warnings", out var warnings) && warnings.ValueKind == JsonValueKind.Array)
        {
            draft.Warnings.AddRange(warnings.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => Truncate(item.GetString()!.Trim(), 300))
                .Where(item => item.Length > 0));
        }

        var byDate = new SortedDictionary<DateOnly, OrderDraftDayDto>();
        if (input.TryGetProperty("days", out var days) && days.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in days.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.Object))
            {
                var dateText = Text(item, "serviceDate", 20);
                if (!DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                {
                    draft.Warnings.Add($"有一天的日期「{dateText}」认不出来，已略过。");
                    continue;
                }

                var day = new OrderDraftDayDto
                {
                    ServiceDate = date,
                    Include = !item.TryGetProperty("include", out var include) || include.ValueKind != JsonValueKind.False,
                    Description = Text(item, "description", MaxText),
                    EndLocation = Text(item, "endLocation", 100),
                    Note = Text(item, "note", 200),
                    Uncertain = Names(item, "uncertain")
                };

                if (item.TryGetProperty("activities", out var activities) && activities.ValueKind == JsonValueKind.Array)
                {
                    foreach (var raw in activities.EnumerateArray().Where(raw => raw.ValueKind == JsonValueKind.Object))
                    {
                        if (Activity(raw, date, libraryIds, files.Count) is { } activity)
                        {
                            day.Activities.Add(activity);
                        }
                    }
                }

                if (byDate.TryGetValue(date, out var existing))
                {
                    existing.Activities.AddRange(day.Activities);
                    existing.Description = string.Join("\n", new[] { existing.Description, day.Description }.Where(text => !string.IsNullOrWhiteSpace(text)));
                    existing.EndLocation ??= day.EndLocation;
                    existing.Include |= day.Include;
                }
                else
                {
                    byDate[date] = day;
                }
            }
        }

        draft.Days = byDate.Values.Take(MaxDays).ToList();
        string? yesterday = null;
        foreach (var day in draft.Days)
        {
            // 模型没关联上的再按名字找一遍；活动可能在当天出发地（前一晚住宿地）或当晚住宿地。
            foreach (var activity in day.Activities.Where(activity => activity.LibraryActivityId is null))
            {
                var places = activity.Kind == "hotel" ? new[] { day.EndLocation } : new[] { day.EndLocation, yesterday };
                activity.LibraryActivityId = LibraryMatcher.Match(activity.Content, places, library);
            }

            // 关联了活动库的用库里的名字，和从活动库添加的活动一致。
            foreach (var activity in day.Activities)
            {
                if (activity.LibraryActivityId is Guid id && names.TryGetValue(id, out var name) && name.Length > 0)
                {
                    activity.Content = name;
                }
            }

            // 酒店放在当天最后。
            day.Activities = day.Activities.OrderBy(activity => activity.Kind == "hotel" ? 1 : 0).ToList();
            yesterday = day.EndLocation ?? yesterday;
        }

        return draft;
    }

    private static OrderDraftActivityDto? Activity(JsonElement raw, DateOnly date, IReadOnlySet<Guid> libraryIds, int fileCount)
    {
        var content = Text(raw, "content", 200);
        if (content is null)
        {
            return null;
        }

        var uncertain = Names(raw, "uncertain");
        var ticket = Int(raw, "ticketIndex");
        Guid? libraryId = Guid.TryParse(Text(raw, "libraryActivityId", 64), out var parsed) && libraryIds.Contains(parsed)
            ? parsed
            : null;
        return new OrderDraftActivityDto
        {
            Content = content,
            Kind = Text(raw, "kind", 20) == "hotel" ? "hotel" : "activity",
            Provider = Text(raw, "provider", 200),
            LibraryActivityId = libraryId,
            BookingTime = Time(raw, "bookingTime", date),
            CheckinTime = Time(raw, "checkinTime", date),
            TicketIndex = ticket is int index && index >= 0 && index < fileCount ? index : null,
            Uncertain = uncertain
        };
    }

    /// <summary>接受 YYYY-MM-DDTHH:mm(:ss) 或只写 HH:mm（算作当天）。</summary>
    private static DateTime? Time(JsonElement item, string name, DateOnly date)
    {
        var text = Text(item, name, 40);
        if (text is null)
        {
            return null;
        }

        string[] full = ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd HH:mm:ss"];
        if (DateTime.TryParseExact(text, full, CultureInfo.InvariantCulture, DateTimeStyles.None, out var value))
        {
            return DateTime.SpecifyKind(value, DateTimeKind.Unspecified);
        }

        return TimeOnly.TryParseExact(text, ["HH:mm", "H:mm"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified)
            : null;
    }

    private static string? Text(JsonElement item, string name, int max) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? TextValue.NullIfBlank(value.GetString()) is string text ? Truncate(text, max) : null
            : null;

    private static int? Int(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
            ? number
            : null;

    private static List<string> Names(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray()
                .Where(entry => entry.ValueKind == JsonValueKind.String)
                .Select(entry => entry.GetString()!)
                .Distinct()
                .ToList()
            : [];

    private static string Truncate(string text, int max) => text.Length > max ? text[..max] : text;
}
