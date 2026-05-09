namespace ESSDesign.Server.Services
{
    public sealed class TransportRouteEstimateRefreshService : BackgroundService
    {
        private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan RefreshInterval = TimeSpan.FromMinutes(15);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<TransportRouteEstimateRefreshService> _logger;

        public TransportRouteEstimateRefreshService(
            IServiceScopeFactory scopeFactory,
            ILogger<TransportRouteEstimateRefreshService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                await Task.Delay(InitialDelay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            using var timer = new PeriodicTimer(RefreshInterval);
            while (!stoppingToken.IsCancellationRequested)
            {
                await RefreshOnceAsync(stoppingToken);

                try
                {
                    await timer.WaitForNextTickAsync(stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        private async Task RefreshOnceAsync(CancellationToken cancellationToken)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var routeEstimates = scope.ServiceProvider.GetRequiredService<TransportRouteEstimateService>();
                var refreshed = await routeEstimates.RefreshDueRoutesAsync(cancellationToken);
                if (refreshed > 0)
                {
                    _logger.LogInformation("Refreshed {Count} shared transport route estimates", refreshed);
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Shared transport route refresh cycle failed");
            }
        }
    }
}
