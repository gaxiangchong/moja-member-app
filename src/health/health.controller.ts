import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';

@Controller('health')
export class HealthController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  ok() {
    return { status: 'ok' };
  }

  @Get('metrics')
  metricsSnapshot() {
    return { status: 'ok', counters: this.metrics.snapshot() };
  }
}
