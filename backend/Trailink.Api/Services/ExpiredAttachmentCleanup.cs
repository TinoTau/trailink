namespace Trailink.Api.Services;

public sealed class ExpiredAttachmentCleanup(IServiceScopeFactory scopes, ILogger<ExpiredAttachmentCleanup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var scheduling = scope.ServiceProvider.GetRequiredService<OrderScheduling>();
                await scheduling.PurgeExpiredAttachmentsAsync(DateOnly.FromDateTime(DateTime.Today), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "清理过期电子票和订单截图失败");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
