using Microsoft.AspNetCore.Mvc;
using Trailink.Api.Services;

namespace Trailink.Api.Controllers;

/// <summary>各控制器共用的错误响应和文件响应，格式只在这里定义。</summary>
public static class ControllerResults
{
    public static ObjectResult Invalid(this ControllerBase controller, string detail) =>
        controller.Problem(title: "Validation error", detail: detail, statusCode: StatusCodes.Status400BadRequest);

    public static ObjectResult Forbidden(this ControllerBase controller, string detail) =>
        controller.Problem(title: "Forbidden", detail: detail, statusCode: StatusCodes.Status403Forbidden);

    public static ObjectResult ScheduleConflict(this ControllerBase controller, IEnumerable<string> warnings) =>
        controller.Problem(title: "Schedule conflict", detail: string.Join("；", warnings), statusCode: StatusCodes.Status409Conflict);

    /// <summary>打开已存文件；文件不存在时 404。</summary>
    public static IActionResult StoredFile(
        this ControllerBase controller,
        AppFileStore files,
        string? relativePath,
        string? cacheControl = null)
    {
        var opened = files.Open(relativePath);
        if (opened is null)
        {
            return controller.NotFound();
        }

        if (cacheControl is not null)
        {
            controller.Response.Headers.CacheControl = cacheControl;
        }

        return controller.PhysicalFile(opened.Value.FullPath, opened.Value.ContentType);
    }
}
