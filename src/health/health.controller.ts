import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { DataPersistenceService } from './data-persistence.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly dataPersistence: DataPersistenceService,
  ) {}

  @Get()
  ok() {
    return { status: 'ok' };
  }

  @Get('metrics')
  metricsSnapshot() {
    return {
      status: 'ok',
      counters: this.metrics.snapshot(),
      dataPersistence: this.dataPersistence.getSnapshot(),
    };
  }
}
