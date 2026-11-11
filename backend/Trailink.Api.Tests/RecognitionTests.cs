using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services.Recognition;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace Trailink.Api.Tests;

/// <summary>换掉真正的模型：记下收到的内容，回一份预设的草稿。</summary>
public sealed class FakeDraftModel : IDraftModel
{
    public bool Enabled { get; set; } = true;
    public string ModelName => "fake-model";
    public string Reply { get; set; } = "{}";
    public List<DraftPart> LastParts { get; } = [];
    public string LastSystem { get; private set; } = string.Empty;

    public Task<DraftModelReply> RunAsync(
        string system,
        IReadOnlyList<DraftPart> parts,
        string toolName,
        string toolDescription,
        JsonObject toolSchema,
        CancellationToken cancellationToken)
    {
        LastSystem = system;
        LastParts.Clear();
        LastParts.AddRange(parts);
        using var json = JsonDocument.Parse(Reply);
        return Task.FromResult(new DraftModelReply(json.RootElement.Clone(), "fake-model", 1234, 567));
    }
}

public class RecognitionFactory : ApiFactory
{
    public FakeDraftModel Model { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.Remove(services.Single(service => service.ServiceType == typeof(IDraftModel)));
            services.AddSingleton<IDraftModel>(Model);
        });
    }
}

public class RecognitionTests : IClassFixture<RecognitionFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly RecognitionFactory _factory;

    public RecognitionTests(RecognitionFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Draft_slices_images_reads_pdf_text_and_cleans_the_model_reply()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var dispatcher = _factory.CreateClient();
        await DispatcherAsync(dispatcher, $"ai_{suffix}");
        var cruise = await AddLibraryActivityAsync($"米尔福德峡湾游船{suffix}");

        _factory.Model.Reply = $$"""
            {
              "platformOrderNo": "YXJ-2026-018",
              "guestCount": 2,
              "vehicleType": "五座车",
              "island": "SOUTH",
              "notes": "南岛包车，每天10小时/400公里",
              "warnings": ["年份是按今天推断的"],
              "days": [
                { "serviceDate": "2037-11-25", "include": true, "description": "皇后镇→米尔福德峡湾→蒂阿瑙", "endLocation": "蒂阿瑙",
                  "activities": [
                    { "content": "Amber Court Motel", "kind": "hotel" },
                    { "content": "米尔福德峡湾游船", "kind": "activity", "libraryActivityId": "{{cruise}}", "provider": "RealNZ（预订号 RZ123）",
                      "checkinTime": "2037-11-25T12:25", "bookingTime": "12:45", "ticketIndex": 1 },
                    { "content": "编造的活动", "kind": "activity", "libraryActivityId": "{{Guid.NewGuid()}}", "ticketIndex": 9, "uncertain": ["content"] }
                  ] },
                { "serviceDate": "2037-11-20", "include": true, "description": "基督城接机 CZ617 17:20", "endLocation": "基督城", "activities": [] },
                { "serviceDate": "2037-11-20", "include": true, "description": "入住酒店", "activities": [] },
                { "serviceDate": "2037-11-30", "include": false, "note": "自由行，不用车", "activities": [] },
                { "serviceDate": "11月31日", "include": true, "activities": [] }
              ]
            }
            """;

        using var form = new MultipartFormDataContent();
        form.Add(File(LongPng(), "image/png"), "files", "itinerary.png");
        form.Add(File(TicketPdf(), "application/pdf"), "files", "ticket.pdf");
        var response = await dispatcher.PostAsync("/api/recognition/order-draft", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var draft = (await response.Content.ReadFromJsonAsync<OrderDraftDto>(JsonOptions))!;

        // 交给模型的内容：长图切成多段，PDF 只交文字，系统提示里有活动库。
        var parts = _factory.Model.LastParts;
        Assert.True(parts.OfType<DraftPart.Jpeg>().Count() >= 2);
        Assert.DoesNotContain(parts, part => part is DraftPart.Pdf);
        Assert.Contains(parts.OfType<DraftPart.Text>(), part => part.Value.Contains("文件 #1") && part.Value.Contains("Milford Sound"));
        Assert.Contains(cruise.ToString(), _factory.Model.LastSystem);

        Assert.Equal("YXJ-2026-018", draft.PlatformOrderNo);
        Assert.Equal(2, draft.GuestCount);
        Assert.Equal("五座车", draft.VehicleType);
        Assert.Equal("south", draft.Island);
        Assert.Equal(["itinerary.png", "ticket.pdf"], draft.Files);
        Assert.Equal(1234, draft.InputTokens);
        Assert.Contains(draft.Warnings, warning => warning.Contains("11月31日"));

        // 按日期排序，同一天合并，认不出的日期丢掉。
        Assert.Equal(
            [new DateOnly(2037, 11, 20), new DateOnly(2037, 11, 25), new DateOnly(2037, 11, 30)],
            draft.Days.Select(day => day.ServiceDate));
        Assert.Equal("基督城接机 CZ617 17:20\n入住酒店", draft.Days[0].Description);
        Assert.False(draft.Days[2].Include);
        Assert.Equal("自由行，不用车", draft.Days[2].Note);

        var activities = draft.Days[1].Activities;
        Assert.Equal([$"米尔福德峡湾游船{suffix}", "编造的活动", "Amber Court Motel"], activities.Select(item => item.Content));
        Assert.Equal(cruise, activities[0].LibraryActivityId);
        Assert.Equal(new DateTime(2037, 11, 25, 12, 25, 0), activities[0].CheckinTime);
        Assert.Equal(new DateTime(2037, 11, 25, 12, 45, 0), activities[0].BookingTime);
        Assert.Equal(1, activities[0].TicketIndex);
        Assert.Null(activities[1].LibraryActivityId);
        Assert.Null(activities[1].TicketIndex);
        Assert.Equal(["content"], activities[1].Uncertain);
        Assert.Equal("hotel", activities[2].Kind);
    }

    [Fact]
    public async Task Import_writes_order_days_activities_tickets_and_screenshot_in_one_go()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var dispatcher = _factory.CreateClient();
        var user = await DispatcherAsync(dispatcher, $"aii_{suffix}");
        var cruise = await AddLibraryActivityAsync($"峡湾游船{suffix}");

        var order = new OrderImportDto
        {
            PlatformOrderNo = $"YXJ-{suffix}",
            GuestCount = 2,
            VehicleType = "7座阿尔法或威尔法",
            Island = "both",
            Notes = "南岛包车，每天10小时/400公里",
            Days =
            [
                new OrderImportDayDto
                {
                    ServiceDate = new DateOnly(2037, 12, 2),
                    Description = "皇后镇→蒂阿瑙",
                    EndLocation = "蒂阿瑙",
                    Activities =
                    [
                        new OrderImportActivityDto
                        {
                            Content = "峡湾游船",
                            Provider = "RealNZ",
                            LibraryActivityId = cruise,
                            CheckinTime = new DateTime(2037, 12, 2, 12, 25, 0),
                            BookingTime = new DateTime(2037, 12, 2, 12, 45, 0),
                            TicketIndex = 1
                        },
                        new OrderImportActivityDto { Content = "Amber Court Motel" }
                    ]
                },
                new OrderImportDayDto { ServiceDate = new DateOnly(2037, 12, 1), Description = "基督城接机", EndLocation = "基督城" }
            ]
        };

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(JsonSerializer.Serialize(order, new JsonSerializerOptions(JsonSerializerDefaults.Web))), "order");
        form.Add(File(LongPng(), "image/png"), "file-0", "itinerary.png");
        form.Add(File(TicketPdf(), "application/pdf"), "file-1", "ticket.pdf");
        var response = await dispatcher.PostAsync("/api/recognition/import", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CreatedOrderDto>(JsonOptions))!;

        var saved = (await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.OrderId}", JsonOptions))!;
        Assert.Equal($"YXJ-{suffix}", saved.PlatformOrderNo);
        Assert.Equal(new DateOnly(2037, 12, 1), saved.StartDate);
        Assert.Equal(2, saved.GuestCount);
        Assert.Equal("7座阿尔法或威尔法", saved.VehicleType);
        Assert.Equal("both", saved.Island);

        // 行程图里看不出在哪个岛（不传）时按南岛。
        using var plain = new MultipartFormDataContent();
        plain.Add(new StringContent(JsonSerializer.Serialize(
            new OrderImportDto { GuestCount = 1, Days = [new OrderImportDayDto { ServiceDate = new DateOnly(2037, 12, 20) }] },
            new JsonSerializerOptions(JsonSerializerDefaults.Web))), "order");
        var plainResponse = await dispatcher.PostAsync("/api/recognition/import", plain);
        Assert.Equal(HttpStatusCode.OK, plainResponse.StatusCode);
        var plainId = (await plainResponse.Content.ReadFromJsonAsync<CreatedOrderDto>(JsonOptions))!.OrderId;
        Assert.Equal("south", (await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{plainId}", JsonOptions))!.Island);
        await dispatcher.DeleteAsync($"/api/orders/{plainId}");
        Assert.Equal(user.Id, saved.AssignedDispatcherUserId);
        Assert.Null(saved.CompanyId);
        Assert.Equal("南岛包车，每天10小时/400公里", saved.Notes);
        Assert.Equal([new DateOnly(2037, 12, 1), new DateOnly(2037, 12, 2)], saved.Days.Select(day => day.ServiceDate).OrderBy(date => date));

        var day = saved.Days.Single(item => item.ServiceDate == new DateOnly(2037, 12, 2));
        Assert.Equal("蒂阿瑙", day.EndLocation);
        var activities = (await dispatcher.GetFromJsonAsync<List<OrderActivityReadDto>>(
            $"/api/orders/{saved.Id}/days/{day.Id}/activities", JsonOptions))!;
        Assert.Equal(["峡湾游船", "Amber Court Motel"], activities.Select(item => item.Content));
        Assert.Equal(cruise, activities[0].LibraryActivityId);
        Assert.Equal(new DateTime(2037, 12, 2, 12, 25, 0), activities[0].CheckinTime);
        Assert.NotNull(activities[0].TicketPath);
        Assert.Null(activities[1].TicketPath);

        var ticket = await dispatcher.GetAsync($"/api/orders/{saved.Id}/days/{day.Id}/activities/{activities[0].Id}/ticket");
        Assert.Equal(HttpStatusCode.OK, ticket.StatusCode);
        var screenshots = (await dispatcher.GetFromJsonAsync<List<OrderFileReadDto>>($"/api/orders/{saved.Id}/files", JsonOptions))!;
        Assert.Equal("itinerary.png", Assert.Single(screenshots).FileName);

        await dispatcher.DeleteAsync($"/api/orders/{saved.Id}");
    }

    [Fact]
    public async Task Only_dispatchers_and_companies_can_use_it_and_bad_input_is_refused()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var driver = _factory.CreateClient();
        await TestAuth.RegisterAsync(driver, $"aid_{suffix}", "识图司导", "driver");
        var status = (await driver.GetFromJsonAsync<RecognitionStatusDto>("/api/recognition/status", JsonOptions))!;
        Assert.False(status.Enabled);

        using (var form = new MultipartFormDataContent())
        {
            form.Add(File(LongPng(), "image/png"), "files", "itinerary.png");
            Assert.Equal(HttpStatusCode.Forbidden, (await driver.PostAsync("/api/recognition/order-draft", form)).StatusCode);
        }

        var company = _factory.CreateClient();
        await TestAuth.RegisterAsync(company, $"aic_{suffix}", "识图公司", "company", $"识图公司{suffix}");
        Assert.True((await company.GetFromJsonAsync<RecognitionStatusDto>("/api/recognition/status", JsonOptions))!.Enabled);

        using (var form = new MultipartFormDataContent())
        {
            form.Add(new ByteArrayContent("hello"u8.ToArray()), "files", "notes.txt");
            Assert.Equal(HttpStatusCode.BadRequest, (await company.PostAsync("/api/recognition/order-draft", form)).StatusCode);
        }

        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent("""{"guestCount":2,"days":[]}"""), "order");
            Assert.Equal(HttpStatusCode.BadRequest, (await company.PostAsync("/api/recognition/import", form)).StatusCode);
        }

        // 模型没认出任何日期：返回 422 和原因。
        _factory.Model.Reply = """{ "warnings": [], "days": [] }""";
        using (var form = new MultipartFormDataContent())
        {
            form.Add(File(LongPng(), "image/png"), "files", "blank.png");
            var response = await company.PostAsync("/api/recognition/order-draft", form);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        }
    }

    [Fact]
    public async Task Draft_accepts_pasted_text_alone_or_with_files()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var dispatcher = _factory.CreateClient();
        await DispatcherAsync(dispatcher, $"ait_{suffix}");
        _factory.Model.Reply = """
            { "guestCount": 3, "warnings": [], "days": [
              { "serviceDate": "2037-11-11", "include": true, "description": "基督城接机", "endLocation": "特卡波", "activities": [] } ] }
            """;

        // 只有粘贴的文字：多余的空行压掉，单独标出来交给模型。
        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent("11月11日 基督城接机，住特卡波\r\n\r\n\r\n\r\n11月12日 库克山"), "text");
            var response = await dispatcher.PostAsync("/api/recognition/order-draft", form);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var draft = (await response.Content.ReadFromJsonAsync<OrderDraftDto>(JsonOptions))!;
            Assert.Equal(3, draft.GuestCount);
            Assert.Empty(draft.Files);
            var sent = _factory.Model.LastParts.OfType<DraftPart.Text>().Select(part => part.Value).ToList();
            Assert.Contains("【粘贴的文字】（调度员直接粘贴的行程资料，不是文件，没有序号）\n11月11日 基督城接机，住特卡波\n\n11月12日 库克山", sent);
            Assert.Contains(sent, text => text.StartsWith("以上是调度员粘贴的行程文字。"));
            Assert.Contains("直接粘贴一段行程文字", _factory.Model.LastSystem);
        }

        // 文件和文字一起：文件在前（序号只算文件），文字在后。
        using (var form = new MultipartFormDataContent())
        {
            form.Add(File(TicketPdf(), "application/pdf"), "files", "ticket.pdf");
            form.Add(new StringContent("客人 3 位，住 Peppers"), "text");
            Assert.Equal(HttpStatusCode.OK, (await dispatcher.PostAsync("/api/recognition/order-draft", form)).StatusCode);
            var sent = _factory.Model.LastParts.OfType<DraftPart.Text>().Select(part => part.Value).ToList();
            Assert.StartsWith("【文件 #0】ticket.pdf", sent[0]);
            Assert.Contains(sent, text => text.StartsWith("以上共 1 个文件和一段粘贴的文字。"));
        }

        // 什么都没有、只有空白、文字太长：400。
        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent("   \n  "), "text");
            Assert.Equal(HttpStatusCode.BadRequest, (await dispatcher.PostAsync("/api/recognition/order-draft", form)).StatusCode);
        }

        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent(new string('字', 20001)), "text");
            Assert.Equal(HttpStatusCode.BadRequest, (await dispatcher.PostAsync("/api/recognition/order-draft", form)).StatusCode);
        }

        // 文字里认不出日期：422，提示要写日期。
        _factory.Model.Reply = """{ "warnings": [], "days": [] }""";
        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent("你好，请帮忙安排一下车"), "text");
            var response = await dispatcher.PostAsync("/api/recognition/order-draft", form);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Contains("这段文字", await response.Content.ReadAsStringAsync());
        }
    }

    private async Task<SessionUserDto> DispatcherAsync(HttpClient client, string username)
    {
        var user = await TestAuth.RegisterAsync(client, username, "识图调度", "driver");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
        (await db.Users.FindAsync(user.Id))!.Role = UserRoles.Dispatcher;
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<Guid> AddLibraryActivityAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
        var activity = new LibraryActivity { Id = Guid.NewGuid(), NameZh = name, CreatedAt = DateTimeOffset.UtcNow };
        db.LibraryActivities.Add(activity);
        await db.SaveChangesAsync();
        return activity.Id;
    }

    private static ByteArrayContent File(byte[] bytes, string type)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(type);
        return content;
    }

    private static byte[] LongPng()
    {
        using var bitmap = new SKBitmap(1200, 4000);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.White);
            using var ink = new SKPaint { Color = SKColors.Black };
            for (var y = 30; y < 4000; y += 60)
            {
                canvas.DrawRect(40, y, 700, 14, ink);
            }
        }

        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Png, 100).ToArray();
    }

    private static byte[] TicketPdf()
    {
        var builder = new PdfDocumentBuilder();
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        var page = builder.AddPage(PageSize.A4);
        page.AddText("RealNZ - Milford Sound Scenic Cruise", 14, new UglyToad.PdfPig.Core.PdfPoint(50, 760), font);
        page.AddText("Date: 25 Nov 2037  Check-in 12:25  Departs 12:45  Booking RZ123", 11, new UglyToad.PdfPig.Core.PdfPoint(50, 730), font);
        return builder.Build();
    }
}

public class AnthropicDraftModelTests
{
    private sealed class Stub(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string RequestBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(status) { Content = new StringContent(body) };
        }
    }

    private static AnthropicDraftModel Model(Stub stub) => new(
        new HttpClient(stub),
        Microsoft.Extensions.Options.Options.Create(new RecognitionOptions { ApiKey = "sk-ant-test", BaseUrl = "https://example.test" }));

    [Fact]
    public async Task Sends_images_pdf_and_forced_tool_and_reads_the_tool_input()
    {
        var stub = new Stub(HttpStatusCode.OK, """
            {"model":"claude-haiku-5-5","content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"submit_order_draft","input":{"days":[],"warnings":["x"]}}],
             "usage":{"input_tokens":9000,"output_tokens":800}}
            """);
        var reply = await Model(stub).RunAsync(
            "system",
            [new DraftPart.Text("文件 #0"), new DraftPart.Jpeg([1, 2, 3]), new DraftPart.Pdf([4, 5])],
            "submit_order_draft",
            "desc",
            new JsonObject { ["type"] = "object" },
            CancellationToken.None);

        Assert.Equal("https://example.test/v1/messages", stub.Request!.RequestUri!.ToString());
        Assert.Equal("sk-ant-test", stub.Request.Headers.GetValues("x-api-key").Single());
        Assert.Equal("2023-06-01", stub.Request.Headers.GetValues("anthropic-version").Single());
        using var sent = JsonDocument.Parse(stub.RequestBody);
        Assert.Equal("claude-haiku-5-5", sent.RootElement.GetProperty("model").GetString());
        Assert.Equal("submit_order_draft", sent.RootElement.GetProperty("tool_choice").GetProperty("name").GetString());
        var content = sent.RootElement.GetProperty("messages")[0].GetProperty("content");
        Assert.Equal(["text", "image", "document"], content.EnumerateArray().Select(item => item.GetProperty("type").GetString()));
        Assert.Equal("image/jpeg", content[1].GetProperty("source").GetProperty("media_type").GetString());
        Assert.Equal("AQID", content[1].GetProperty("source").GetProperty("data").GetString());

        Assert.Equal("x", reply.Input.GetProperty("warnings")[0].GetString());
        Assert.Equal((9000, 800), (reply.InputTokens, reply.OutputTokens));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "密钥")]
    [InlineData(HttpStatusCode.TooManyRequests, "消费上限")]
    [InlineData((HttpStatusCode)529, "繁忙")]
    public async Task Errors_become_plain_chinese_messages(HttpStatusCode status, string expected)
    {
        var error = await Assert.ThrowsAsync<DraftModelException>(() => Model(new Stub(status, "{}")).RunAsync(
            "s", [], "t", "d", new JsonObject(), CancellationToken.None));
        Assert.Contains(expected, error.Message);
    }
}

public class LibraryMatcherTests
{
    private static readonly LibraryItem Cruise = new(Guid.NewGuid(), "米尔福德峡湾游船", "Milford Sound Cruise", ["蒂阿瑙"]);
    private static readonly LibraryItem Doubtful = new(Guid.NewGuid(), "神奇峡湾游船", "Doubtful Sound Cruise", ["蒂阿瑙"]);
    private static readonly LibraryItem Hotel = new(Guid.NewGuid(), "皇后镇千禧酒店", "Millennium Hotel Queenstown", ["皇后镇"]);
    private static readonly LibraryItem Whale = new(Guid.NewGuid(), "观鲸", "Whale Watch", ["凯库拉"]);
    private static readonly LibraryItem Earnslaw = new(Guid.NewGuid(), "TSS 蒸汽船农场游", null, ["皇后镇"]);
    private static readonly IReadOnlyList<LibraryItem> Library = [Cruise, Doubtful, Hotel, Whale, Earnslaw];

    [Theory]
    [InlineData("米尔福德峡湾游船", "蒂阿瑙")]
    [InlineData("Milford Sound Scenic Cruise 米尔福德峡湾游船", null)]
    [InlineData("milford-sound cruise", null)]
    public void Matches_chinese_english_and_spacing_variants(string content, string? place) =>
        Assert.Equal(Cruise.Id, LibraryMatcher.Match(content, [place], Library));

    [Fact]
    public void Hotels_match_by_english_name_and_places_allow_short_names()
    {
        Assert.Equal(Hotel.Id, LibraryMatcher.Match("千禧酒店 Millennium Hotel Queenstown", ["皇后镇"], Library));
        Assert.Equal(Earnslaw.Id, LibraryMatcher.Match("TSS蒸汽船农场游（含BBQ）", [null], Library));
        // 「观鲸」只有两个字：当天在凯库拉才算，否则不关联。
        Assert.Equal(Whale.Id, LibraryMatcher.Match("凯库拉观鲸", ["凯库拉"], Library));
        Assert.Null(LibraryMatcher.Match("观鲸", ["基督城"], Library));
    }

    [Fact]
    public void Generic_or_ambiguous_names_stay_unlinked()
    {
        Assert.Null(LibraryMatcher.Match("游船", ["蒂阿瑙"], Library));
        Assert.Null(LibraryMatcher.Match("峡湾游船", ["蒂阿瑙"], Library));
        Assert.Null(LibraryMatcher.Match("Amber Court Motel", ["蒂阿瑙"], Library));
        Assert.Null(LibraryMatcher.Match("", ["蒂阿瑙"], Library));
    }
}
