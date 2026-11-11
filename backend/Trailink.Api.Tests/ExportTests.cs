using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ClosedXML.Excel;
using Trailink.Api.DTOs;

namespace Trailink.Api.Tests;

/// <summary>订单记录导出 Excel：默认表格，以及把记录填进用户上传的表格（AI 认结构 / 按表头文字找）。</summary>
public class ExportTests : IClassFixture<RecognitionFactory>
{
    private readonly RecognitionFactory _factory;

    public ExportTests(RecognitionFactory factory)
    {
        _factory = factory;
    }

    private sealed record Setup(HttpClient Dispatcher, Guid CompanyId, string CompanyName);

    /// <summary>一家公司、一位调度员（自己也是司导）；调度员建三张单：两张 2026 年、一张 2027 年。</summary>
    private async Task<Setup> SetupAsync()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        await company.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"xfirm_{suffix}",
            Password = "Passw0rd!",
            Name = "导出公司",
            AccountType = "company",
            CompanyName = $"导出公司{suffix}"
        });
        var companyUser = await company.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        var dispatcher = _factory.CreateClient();
        await dispatcher.PostAsJsonAsync("/api/auth/register", new RegisterDto
        {
            Username = $"xdisp_{suffix}",
            Password = "Passw0rd!",
            Name = "唐姐",
            AccountType = "driver"
        });
        var me = await dispatcher.GetFromJsonAsync<SessionUserDto>("/api/auth/me");
        await dispatcher.PostAsJsonAsync("/api/companies/applications", new ApplyDispatcherDto { CompanyId = companyUser!.CompanyId!.Value });
        var home = await company.GetFromJsonAsync<CompanyHomeDto>("/api/company");
        await company.PostAsJsonAsync($"/api/company/applications/{home!.Desk!.Applications[0].Id}/approve", new { });

        async Task AddAsync(DateOnly start, int days, int guests, string route, string? island)
        {
            var created = await dispatcher.PostAsJsonAsync("/api/orders", new OrderWriteDto
            {
                StartDate = start,
                GuestCount = guests,
                VehicleType = "五座车",
                Island = island,
                SharedNotes = route,
                CompanyId = companyUser.CompanyId
            });
            created.EnsureSuccessStatusCode();
            var order = await created.Content.ReadFromJsonAsync<OrderReadDto>();
            for (var day = 0; day < days; day++)
            {
                (await dispatcher.PostAsJsonAsync($"/api/orders/{order!.Id}/days", new ItineraryDayWriteDto
                {
                    ServiceDate = start.AddDays(day),
                    DriverId = me!.DriverId
                })).EnsureSuccessStatusCode();
            }
        }

        await AddAsync(new DateOnly(2026, 11, 11), 5, 2, "基督城-特卡波-库克山-奥马鲁", "south");
        await AddAsync(new DateOnly(2026, 11, 24), 1, 4, "基督城酒店-特卡波\n基督城民宿", null);
        await AddAsync(new DateOnly(2027, 1, 3), 2, 1, "皇后镇-瓦纳卡", "both");
        return new Setup(dispatcher, companyUser.CompanyId.Value, $"导出公司{suffix}");
    }

    private static XLWorkbook Open(byte[] bytes) => new(new MemoryStream(bytes));

    [Fact]
    public async Task Default_export_has_header_year_rows_and_full_routes()
    {
        var setup = await SetupAsync();
        var response = await setup.Dispatcher.GetAsync($"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk");
        response.EnsureSuccessStatusCode();
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType!.MediaType);
        Assert.Matches(@"^订单记录-调度中-\d{8}-\d{6}\.xlsx$", response.Content.Headers.ContentDisposition!.FileNameStar);
        Assert.Equal("3", response.Headers.GetValues("X-Export-Added").Single());

        using var workbook = Open(await response.Content.ReadAsByteArrayAsync());
        var sheet = workbook.Worksheet(1);
        Assert.Equal(
            ["订单来源", "客人信息", "负责人", "车型", "车牌", "起止时间", "南/北岛", "行程路线"],
            Enumerable.Range(1, 8).Select(column => sheet.Cell(1, column).GetString()).ToArray());
        Assert.True(sheet.Cell(1, 1).Style.Font.Bold);
        // 年份行：整行合并、绿底。
        Assert.Equal("2026年", sheet.Cell(2, 1).GetString());
        Assert.True(sheet.Cell(2, 1).IsMerged());
        Assert.Equal(XLColor.FromHtml("#70AD47"), sheet.Cell(2, 1).Style.Fill.BackgroundColor);
        // 订单来源是调度员给公司的简称（默认公司名前两个字）。
        Assert.Equal("导出", sheet.Cell(3, 1).GetString());
        Assert.Equal("2人", sheet.Cell(3, 2).GetString());
        Assert.Equal("唐姐", sheet.Cell(3, 3).GetString());
        Assert.Equal("11.11-11.15", sheet.Cell(3, 6).GetString());
        Assert.Equal("南岛", sheet.Cell(3, 7).GetString());
        Assert.Equal(XLAlignmentHorizontalValues.Left, sheet.Cell(3, 8).Style.Alignment.Horizontal);
        // 一天的单只写一个日期；行程里的换行变成空格；没填南北岛按南岛。
        Assert.Equal("11.24", sheet.Cell(4, 6).GetString());
        Assert.Equal("基督城酒店-特卡波 基督城民宿", sheet.Cell(4, 8).GetString());
        Assert.Equal("南岛", sheet.Cell(4, 7).GetString());
        Assert.Equal("2027年", sheet.Cell(5, 1).GetString());
        Assert.Equal("1.3-1.4", sheet.Cell(6, 6).GetString());
        Assert.Equal("南北岛", sheet.Cell(6, 7).GetString());

        // 范围跟着角色：调度员不能导出公司全部。
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await setup.Dispatcher.GetAsync($"/api/company/orders/export?companyId={setup.CompanyId}&scope=all")).StatusCode);
    }

    /// <summary>一张已经有内容的表：第一行是标题，第二行表头（列的顺序和默认不同），有一条已有的单和一行年份。</summary>
    private static byte[] ExistingSheet()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("我的单");
        sheet.Cell(1, 1).Value = "2026 包车记录";
        string[] headers = ["日期", "线路", "人数", "司机", "备注"];
        for (var index = 0; index < headers.Length; index++)
        {
            sheet.Cell(2, index + 1).Value = headers[index];
        }

        sheet.Cell(3, 1).Value = "2026年";
        sheet.Range(3, 1, 3, 5).Merge();
        sheet.Range(3, 1, 3, 5).Style.Fill.BackgroundColor = XLColor.Yellow;
        sheet.Cell(4, 1).Value = "11月11日-11月15日";
        sheet.Cell(4, 2).Value = "基督城-特卡波-库克山-奥马鲁";
        sheet.Cell(4, 3).Value = 2;
        sheet.Cell(4, 4).Value = "唐姐";
        sheet.Cell(4, 5).Value = "老客人";
        sheet.Row(4).Style.Fill.BackgroundColor = XLColor.LightGray;
        sheet.Cell(6, 1).Value = "合计";
        using var output = new MemoryStream();
        workbook.SaveAs(output);
        return output.ToArray();
    }

    private static MultipartFormDataContent Upload(byte[] bytes, string name)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        form.Add(file, "file", name);
        return form;
    }

    private static void AssertFilled(byte[] bytes)
    {
        using var workbook = Open(bytes);
        var sheet = workbook.Worksheet("我的单");
        // 已有的单不重复；新单写在已有内容下面，「合计」往下挪。
        Assert.Equal("11月11日-11月15日", sheet.Cell(4, 1).GetString());
        Assert.Equal("老客人", sheet.Cell(4, 5).GetString());
        Assert.Equal("11月24日", sheet.Cell(5, 1).GetString());
        Assert.Equal("基督城酒店-特卡波 基督城民宿", sheet.Cell(5, 2).GetString());
        Assert.Equal(4, sheet.Cell(5, 3).GetValue<int>());
        Assert.Equal("唐姐", sheet.Cell(5, 4).GetString());
        Assert.Equal("", sheet.Cell(5, 5).GetString());
        // 新行照已有数据行的样式。
        Assert.Equal(XLColor.LightGray, sheet.Cell(5, 2).Style.Fill.BackgroundColor);
        // 跨年时照已有的年份行加一行（同样合并、同样底色）。
        Assert.Equal("2027年", sheet.Cell(6, 1).GetString());
        Assert.True(sheet.Cell(6, 1).IsMerged());
        Assert.Equal(XLColor.Yellow, sheet.Cell(6, 1).Style.Fill.BackgroundColor);
        Assert.Equal("1月3日-1月4日", sheet.Cell(7, 1).GetString());
        Assert.Equal("合计", sheet.Cell(9, 1).GetString());
    }

    [Fact]
    public async Task Uploaded_sheet_is_filled_with_the_ai_layout()
    {
        var setup = await SetupAsync();
        _factory.Model.Enabled = true;
        _factory.Model.Reply = """
            {
              "sheet": "我的单",
              "headerRow": 2,
              "columns": { "source": "", "guests": "C", "driver": "D", "vehicleType": "", "plate": "", "dates": "A", "island": "", "route": "B" },
              "lastDataRow": 4,
              "dataStyleRow": 4,
              "yearRows": true,
              "yearStyleRow": 3,
              "dateStyle": "chinese",
              "guestsAsNumber": true
            }
            """;
        var response = await setup.Dispatcher.PostAsync(
            $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
            Upload(ExistingSheet(), "我的表.xlsx"));
        response.EnsureSuccessStatusCode();
        Assert.Equal("ai", response.Headers.GetValues("X-Export-Mode").Single());
        Assert.Equal("2", response.Headers.GetValues("X-Export-Added").Single());
        Assert.Equal("1", response.Headers.GetValues("X-Export-Skipped").Single());
        Assert.Matches(@"^我的表-\d{8}-\d{6}\.xlsx$", response.Content.Headers.ContentDisposition!.FileNameStar);
        // 发给 AI 的是表格文字（表头和已有的几行）。
        var sent = Assert.IsType<Trailink.Api.Services.Recognition.DraftPart.Text>(_factory.Model.LastParts.Single()).Value;
        Assert.Contains("第2行：A=日期 | B=线路 | C=人数 | D=司机 | E=备注", sent);
        AssertFilled(await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public void Header_guess_prefers_a_sheet_with_a_header_over_an_empty_first_sheet()
    {
        using var workbook = new XLWorkbook();
        workbook.Worksheets.Add("空白");
        var data = workbook.Worksheets.Add("订单");
        data.Cell(1, 1).Value = "起止时间";
        data.Cell(1, 2).Value = "行程路线";
        var layout = Trailink.Api.Services.Export.OrderRecordSheetFiller.Guess(workbook.Worksheets.ToList());
        Assert.Equal("订单", layout!.Sheet);
        Assert.Equal(1, layout.HeaderRow);

        // 只有空表时写在第一张空表上。
        using var empty = new XLWorkbook();
        empty.Worksheets.Add("A");
        empty.Worksheets.Add("B");
        Assert.Equal("A", Trailink.Api.Services.Export.OrderRecordSheetFiller.Guess(empty.Worksheets.ToList())!.Sheet);
    }

    [Fact]
    public async Task A_wrong_ai_answer_falls_back_to_the_header_words()
    {
        var setup = await SetupAsync();
        _factory.Model.Enabled = true;
        _factory.Model.Reply = """{ "sheet": "不存在的表", "headerRow": 2, "columns": {}, "lastDataRow": 99 }""";
        var response = await setup.Dispatcher.PostAsync(
            $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
            Upload(ExistingSheet(), "我的表.xlsx"));
        response.EnsureSuccessStatusCode();
        Assert.Equal("auto", response.Headers.GetValues("X-Export-Mode").Single());
        AssertFilled(await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Without_ai_the_header_words_are_matched_and_bad_files_are_rejected()
    {
        var setup = await SetupAsync();
        _factory.Model.Enabled = false;
        try
        {
            var response = await setup.Dispatcher.PostAsync(
                $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
                Upload(ExistingSheet(), "我的表.xlsx"));
            response.EnsureSuccessStatusCode();
            Assert.Equal("auto", response.Headers.GetValues("X-Export-Mode").Single());
            AssertFilled(await response.Content.ReadAsByteArrayAsync());

            // 空表：写默认表头，照默认样式填。
            using var empty = new XLWorkbook();
            empty.Worksheets.Add("Sheet1");
            using var stream = new MemoryStream();
            empty.SaveAs(stream);
            var filled = await setup.Dispatcher.PostAsync(
                $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
                Upload(stream.ToArray(), "空表.xlsx"));
            filled.EnsureSuccessStatusCode();
            using (var workbook = Open(await filled.Content.ReadAsByteArrayAsync()))
            {
                var sheet = workbook.Worksheet(1);
                Assert.Equal("订单来源", sheet.Cell(1, 1).GetString());
                Assert.Equal("2026年", sheet.Cell(2, 1).GetString());
                Assert.Equal("11.11-11.15", sheet.Cell(3, 6).GetString());
            }

            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await setup.Dispatcher.PostAsync(
                    $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
                    Upload([1, 2, 3], "旧表.xls"))).StatusCode);
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await setup.Dispatcher.PostAsync(
                    $"/api/company/orders/export?companyId={setup.CompanyId}&scope=desk",
                    Upload([1, 2, 3], "坏的.xlsx"))).StatusCode);
        }
        finally
        {
            _factory.Model.Enabled = true;
        }
    }
}
