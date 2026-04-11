import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';
import { OpsQueueService } from './ops-queue.service';

@Controller('ops/queue')
@UseGuards(OpsApiKeyGuard)
export class OpsQueueController {
  constructor(private readonly ops: OpsQueueService) {}

  @Get('orders')
  list() {
    return this.ops.listOrders();
  }

  @Get('orders/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getOrder(id);
  }

  @Patch('orders/:id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.completeOrder(id);
  }
}
