namespace Trailink.Api.Services.Recognition;

/// <summary>
/// AI 识图的设置，配置节 <c>Recognition</c>。
/// 密钥只放在环境变量 <c>Recognition__ApiKey</c> 里，不进 Git；没有密钥时调度台不显示「AI 建单」。
/// </summary>
public sealed class RecognitionOptions
{
    /// <summary>Anthropic API 密钥（sk-ant-…）。</summary>
    public string? ApiKey { get; set; }

    /// <summary>模型，默认 Claude Haiku 5.5；识别不准时可改成 <c>claude-sonnet-5-5</c>，不用改代码。</summary>
    public string Model { get; set; } = "claude-haiku-5-5";

    /// <summary>接口地址。留空用正式地址；测试时可指向假接口。</summary>
    public string? BaseUrl { get; set; }

    /// <summary>模型最多输出多少 token。12 天的行程结构化后约 3～5 千。</summary>
    public int MaxTokens { get; set; } = 12000;

    public int TimeoutSeconds { get; set; } = 150;

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey);

    public string Url => (string.IsNullOrWhiteSpace(BaseUrl) ? "https://api.anthropic.com" : BaseUrl).TrimEnd('/');
}
