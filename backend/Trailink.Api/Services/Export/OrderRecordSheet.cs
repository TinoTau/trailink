using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Services.Export;

/// <summary>订单记录表里的一列。默认表按这个顺序。</summary>
public enum RecordField
{
    Source,
    Guests,
    Driver,
    VehicleType,
    Plate,
    Dates,
    Island,
    Route
}

/// <summary>起止时间的写法。默认 <see cref="Dot"/>（11.11-11.15）。</summary>
public enum DateStyle
{
    Dot,
    Slash,
    Chinese,
    Iso
}

/// <summary>导出的一行订单。</summary>
public sealed record OrderRecordRow(
    DateOnly Start,
    DateOnly End,
    string Source,
    int GuestCount,
    string Drivers,
    string VehicleType,
    string Plates,
    string Island,
    string Route)
{
    public static OrderRecordRow From(CompanyOrderRecordDto record, string source) => new(
        record.StartDate,
        record.EndDate,
        source,
        record.GuestCount,
        string.Join("、", record.Drivers),
        record.VehicleType ?? "",
        string.Join("、", record.Plates),
        OrderRecordSheet.IslandLabel(record.Island),
        OrderRecordSheet.OneLine(record.Route));

    /// <summary>格子里写的文字。人数可以写成「2人」或纯数字。</summary>
    public object Value(RecordField field, DateStyle dates, bool guestsAsNumber) => field switch
    {
        RecordField.Source => Source,
        RecordField.Guests => GuestCount <= 0 ? "" : guestsAsNumber ? GuestCount : $"{GuestCount}人",
        RecordField.Driver => Drivers,
        RecordField.VehicleType => VehicleType,
        RecordField.Plate => Plates,
        RecordField.Dates => OrderRecordSheet.FormatDates(Start, End, dates),
        RecordField.Island => Island,
        RecordField.Route => Route,
        _ => ""
    };
}

/// <summary>
/// 订单记录 Excel：默认样式参考调度员手里的纸面表——浅蓝加粗表头、每年一行绿色年份（右对齐）、
/// 数据居中、行程路线左对齐；第一行冻结。
/// </summary>
public static class OrderRecordSheet
{
    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    /// <summary>上传表格最大 5MB：订单记录表一般只有几十 KB，太大的表读进内存会挤占小服务器。</summary>
    public const int MaxUploadBytes = 5 * 1024 * 1024;

    public static readonly IReadOnlyList<RecordField> DefaultFields =
    [
        RecordField.Source, RecordField.Guests, RecordField.Driver, RecordField.VehicleType,
        RecordField.Plate, RecordField.Dates, RecordField.Island, RecordField.Route
    ];

    public static string Header(RecordField field) => field switch
    {
        RecordField.Source => "订单来源",
        RecordField.Guests => "客人信息",
        RecordField.Driver => "负责人",
        RecordField.VehicleType => "车型",
        RecordField.Plate => "车牌",
        RecordField.Dates => "起止时间",
        RecordField.Island => "南/北岛",
        RecordField.Route => "行程路线",
        _ => ""
    };

    private static readonly XLColor HeaderFill = XLColor.FromHtml("#8DD0EE");
    private static readonly XLColor YearFill = XLColor.FromHtml("#70AD47");
    private static readonly XLColor GridColor = XLColor.FromHtml("#D9D9D9");
    private static readonly double[] DefaultWidths = [11, 11, 11, 22, 12, 15, 9, 80];

    public static bool IsXlsx(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() is ".xlsx" or ".xlsm";

    public static string IslandLabel(string? island) => island switch
    {
        OrderIslands.North => "北岛",
        OrderIslands.Both => "南北岛",
        _ => "南岛"
    };

    public static string OneLine(string? text) =>
        Regex.Replace(text ?? "", @"\s*[\r\n]+\s*", " ").Trim();

    public static string FormatDates(DateOnly start, DateOnly end, DateStyle style)
    {
        string One(DateOnly date) => style switch
        {
            DateStyle.Slash => $"{date.Month}/{date.Day}",
            DateStyle.Chinese => $"{date.Month}月{date.Day}日",
            DateStyle.Iso => date.ToString("yyyy-MM-dd"),
            _ => $"{date.Month}.{date.Day}"
        };
        if (start == end)
        {
            return One(start);
        }

        return style == DateStyle.Iso ? $"{One(start)}~{One(end)}" : $"{One(start)}-{One(end)}";
    }

    /// <summary>默认样式的新表格。</summary>
    public static byte[] BuildDefault(IReadOnlyList<OrderRecordRow> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("订单记录");
        WriteDefaultHeader(sheet, 1);
        var row = 2;
        int? year = null;
        foreach (var record in rows.OrderBy(item => item.Start).ThenBy(item => item.End))
        {
            if (record.Start.Year != year)
            {
                year = record.Start.Year;
                WriteDefaultYearRow(sheet, row, 1, DefaultFields.Count, $"{year}年");
                row++;
            }

            for (var index = 0; index < DefaultFields.Count; index++)
            {
                var cell = sheet.Cell(row, index + 1);
                SetValue(cell, record.Value(DefaultFields[index], DateStyle.Dot, false));
                StyleDefaultData(cell, DefaultFields[index]);
            }

            sheet.Row(row).Height = 22;
            row++;
        }

        sheet.SheetView.FreezeRows(1);
        // 打印时横向、整张表宽度缩到一页，每页都印表头。
        sheet.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        sheet.PageSetup.FitToPages(1, 0);
        sheet.PageSetup.SetRowsToRepeatAtTop(1, 1);
        using var output = new MemoryStream();
        workbook.SaveAs(output);
        return output.ToArray();
    }

    /// <summary>默认表头（第 <paramref name="row"/> 行，A 列起），并设好列宽。</summary>
    public static void WriteDefaultHeader(IXLWorksheet sheet, int row)
    {
        for (var index = 0; index < DefaultFields.Count; index++)
        {
            var cell = sheet.Cell(row, index + 1);
            cell.Value = Header(DefaultFields[index]);
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontSize = 12;
            cell.Style.Font.FontName = "微软雅黑";
            cell.Style.Fill.BackgroundColor = HeaderFill;
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            Grid(cell.Style);
            sheet.Column(index + 1).Width = DefaultWidths[index];
        }

        sheet.Row(row).Height = 28;
    }

    /// <summary>默认的年份行：从 <paramref name="firstColumn"/> 到 <paramref name="lastColumn"/> 合并，绿底，年份加粗靠右。</summary>
    public static void WriteDefaultYearRow(IXLWorksheet sheet, int row, int firstColumn, int lastColumn, string text)
    {
        var range = sheet.Range(row, firstColumn, row, lastColumn);
        range.Merge();
        range.Style.Fill.BackgroundColor = YearFill;
        range.Style.Font.Bold = true;
        range.Style.Font.FontSize = 12;
        range.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        range.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        sheet.Cell(row, firstColumn).Value = text;
        sheet.Row(row).Height = 24;
    }

    public static void StyleDefaultData(IXLCell cell, RecordField field)
    {
        cell.Style.Font.FontName = "宋体";
        cell.Style.Font.FontSize = 11;
        cell.Style.Alignment.Horizontal = field == RecordField.Route
            ? XLAlignmentHorizontalValues.Left
            : XLAlignmentHorizontalValues.Center;
        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        Grid(cell.Style);
    }

    public static void SetValue(IXLCell cell, object value)
    {
        switch (value)
        {
            case int number:
                cell.Value = number;
                break;
            default:
                cell.Value = value.ToString() ?? "";
                break;
        }
    }

    private static void Grid(IXLStyle style)
    {
        style.Border.BottomBorder = XLBorderStyleValues.Thin;
        style.Border.BottomBorderColor = GridColor;
        style.Border.RightBorder = XLBorderStyleValues.Thin;
        style.Border.RightBorderColor = GridColor;
    }
}
