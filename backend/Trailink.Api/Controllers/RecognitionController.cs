using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Trailink.Api.DTOs;
using Trailink.Api.Models;
using Trailink.Api.Services;
using Trailink.Api.Services.Recognition;

namespace Trailink.Api.Controllers;

/// <summary>AI 建单：上传行程图和电子票 → 草稿 → 调度员核对 → 写成订单。只有调度员和公司账户能用。</summary>
[ApiController]
[Route("api/recognition")]
public class RecognitionController(
    AuthSession session,
    IDraftModel model,
    OrderDraftRecognizer recognizer,
    OrderImport import) : ControllerBase
{
    private const long RequestLimit = RecognitionSources.MaxTotalBytes + 2_000_000;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict
    };

    [HttpGet("status")]
    public async Task<ActionResult<RecognitionStatusDto>> Status(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        return Ok(new RecognitionStatusDto
        {
            Enabled = model.Enabled && CanUse(user),
            Model = model.ModelName
        });
    }

    /// <summary>识别，只返回草稿，不写数据库。文件字段名都叫 <c>files</c>，按选择的顺序；粘贴的行程文字放在 <c>text</c>。两样至少有一样。</summary>
    [HttpPost("order-draft")]
    [RequestSizeLimit(RequestLimit)]
    [RequestFormLimits(MultipartBodyLengthLimit = RequestLimit)]
    public async Task<ActionResult<OrderDraftDto>> Draft(
        [FromForm] List<IFormFile> files,
        [FromForm] string? text,
        CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (!CanUse(user))
        {
            return this.Forbidden("只有调度员和公司账户能用 AI 建单。");
        }

        if (RecognitionSources.CheckLimits(files.Select(file => (file.FileName, file.Length)).ToList(), text) is string limitError)
        {
            return this.Invalid(limitError);
        }

        var uploads = new List<RecognitionSources.Upload>();
        foreach (var file in files)
        {
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, cancellationToken);
            uploads.Add(new RecognitionSources.Upload(Path.GetFileName(file.FileName), buffer.ToArray()));
        }

        var (draft, error) = await recognizer.RecognizeAsync(uploads, text, cancellationToken);
        return draft is null
            ? Problem(title: "Recognition failed", detail: error, statusCode: StatusCodes.Status422UnprocessableEntity)
            : Ok(draft);
    }

    /// <summary>
    /// 把核对后的草稿写成订单。表单字段 <c>order</c> 是 <see cref="OrderImportDto"/> 的 JSON，
    /// 文件字段 <c>file-{序号}</c> 是识别时的第几个文件：被活动引用的存为电子票，其余图片存为订单截图。
    /// </summary>
    [HttpPost("import")]
    [RequestSizeLimit(RequestLimit)]
    [RequestFormLimits(MultipartBodyLengthLimit = RequestLimit)]
    public async Task<ActionResult<CreatedOrderDto>> Import(CancellationToken cancellationToken)
    {
        var user = await session.GetUserAsync(cancellationToken);
        if (user is null || !CanUse(user))
        {
            return this.Forbidden("只有调度员和公司账户能用 AI 建单。");
        }

        if (!Request.HasFormContentType)
        {
            return this.Invalid("请用表单提交。");
        }

        var form = await Request.ReadFormAsync(cancellationToken);
        OrderImportDto? request;
        try
        {
            request = JsonSerializer.Deserialize<OrderImportDto>(form["order"].ToString(), Json);
        }
        catch (JsonException error)
        {
            return this.Invalid($"订单内容格式不对：{error.Message}");
        }

        if (request is null)
        {
            return this.Invalid("缺少订单内容。");
        }

        var uploads = new Dictionary<int, IFormFile>();
        foreach (var file in form.Files)
        {
            if (file.Name.StartsWith("file-", StringComparison.Ordinal) &&
                int.TryParse(file.Name["file-".Length..], out var index) && index >= 0)
            {
                uploads[index] = file;
            }
        }

        var result = await import.ImportAsync(user, request, uploads, cancellationToken);
        return result.OrderId is Guid id
            ? Ok(new CreatedOrderDto { OrderId = id })
            : this.Invalid(result.Error!);
    }

    private static bool CanUse(User? user) => user?.Role is UserRoles.Dispatcher or UserRoles.Company;
}
