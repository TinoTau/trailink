using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Trailink.Api.Services.Recognition;

/// <summary>交给模型的一段内容：图片（已切段的 JPEG）、PDF 原件，或从 PDF 取出的文字。</summary>
public abstract record DraftPart
{
    public sealed record Text(string Value) : DraftPart;

    public sealed record Jpeg(byte[] Bytes) : DraftPart;

    public sealed record Pdf(byte[] Bytes) : DraftPart;
}

public sealed record DraftModelReply(JsonElement Input, string Model, int InputTokens, int OutputTokens);

/// <summary>识图模型。正式环境是 <see cref="AnthropicDraftModel"/>，测试里换成假的。</summary>
public interface IDraftModel
{
    bool Enabled { get; }

    string ModelName { get; }

    /// <summary>发一次请求，强制模型用 <paramref name="toolName"/> 这个工具回填结构化结果。</summary>
    Task<DraftModelReply> RunAsync(
        string system,
        IReadOnlyList<DraftPart> parts,
        string toolName,
        string toolDescription,
        JsonObject toolSchema,
        CancellationToken cancellationToken);
}

public sealed class DraftModelException(string message) : Exception(message);

/// <summary>调用 Anthropic Messages API。</summary>
public sealed class AnthropicDraftModel(HttpClient http, IOptions<RecognitionOptions> options) : IDraftModel
{
    private readonly RecognitionOptions _options = options.Value;

    public bool Enabled => _options.Enabled;

    public string ModelName => _options.Model;

    public async Task<DraftModelReply> RunAsync(
        string system,
        IReadOnlyList<DraftPart> parts,
        string toolName,
        string toolDescription,
        JsonObject toolSchema,
        CancellationToken cancellationToken)
    {
        if (!Enabled)
        {
            throw new DraftModelException("还没有配置 AI 识图的密钥。");
        }

        var content = new JsonArray();
        foreach (var part in parts)
        {
            content.Add(part switch
            {
                DraftPart.Text text => new JsonObject { ["type"] = "text", ["text"] = text.Value },
                DraftPart.Jpeg jpeg => Source("image", "image/jpeg", jpeg.Bytes),
                DraftPart.Pdf pdf => Source("document", "application/pdf", pdf.Bytes),
                _ => throw new InvalidOperationException()
            });
        }

        var body = new JsonObject
        {
            ["model"] = _options.Model,
            ["max_tokens"] = _options.MaxTokens,
            ["system"] = system,
            ["messages"] = new JsonArray(new JsonObject { ["role"] = "user", ["content"] = content }),
            ["tools"] = new JsonArray(new JsonObject
            {
                ["name"] = toolName,
                ["description"] = toolDescription,
                ["input_schema"] = toolSchema
            }),
            ["tool_choice"] = new JsonObject { ["type"] = "tool", ["name"] = toolName }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.Url}/v1/messages")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-api-key", _options.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new DraftModelException("AI 识别超时，请稍后再试，或少传几张图。");
        }
        catch (HttpRequestException)
        {
            throw new DraftModelException("连不上 AI 服务，请稍后再试。");
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new DraftModelException(response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "AI 密钥无效或已停用，请检查服务器配置。",
                    HttpStatusCode.TooManyRequests => "AI 服务调用太频繁或已到消费上限，请稍后再试。",
                    HttpStatusCode.BadRequest when text.Contains("credit", StringComparison.OrdinalIgnoreCase) =>
                        "AI 账户余额不足，请到 Anthropic 控制台充值。",
                    (HttpStatusCode)529 or HttpStatusCode.ServiceUnavailable => "AI 服务繁忙，请稍后再试。",
                    _ => $"AI 识别失败（{(int)response.StatusCode}），请稍后再试。"
                });
            }

            using var json = JsonDocument.Parse(text);
            var root = json.RootElement;
            var input = root.GetProperty("content").EnumerateArray()
                .FirstOrDefault(item => item.GetProperty("type").GetString() == "tool_use");
            if (input.ValueKind != JsonValueKind.Object)
            {
                throw new DraftModelException("AI 没有返回识别结果，请重试。");
            }

            var usage = root.TryGetProperty("usage", out var u) ? u : default;
            return new DraftModelReply(
                input.GetProperty("input").Clone(),
                root.TryGetProperty("model", out var model) ? model.GetString() ?? _options.Model : _options.Model,
                usage.ValueKind == JsonValueKind.Object && usage.TryGetProperty("input_tokens", out var inTokens) ? inTokens.GetInt32() : 0,
                usage.ValueKind == JsonValueKind.Object && usage.TryGetProperty("output_tokens", out var outTokens) ? outTokens.GetInt32() : 0);
        }
    }

    private static JsonObject Source(string type, string mediaType, byte[] bytes) => new()
    {
        ["type"] = type,
        ["source"] = new JsonObject
        {
            ["type"] = "base64",
            ["media_type"] = mediaType,
            ["data"] = Convert.ToBase64String(bytes)
        }
    };
}
