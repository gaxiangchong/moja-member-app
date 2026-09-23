import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TimesheetCodeDto } from '../employees/dto/timesheet-code.dto';
import { EmployeesService } from '../employees/employees.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';
import { SetOrderStatusDto } from './dto/set-order-status.dto';
import { OpsQueueService } from './ops-queue.service';

@Controller('ops/queue')
@UseGuards(OpsApiKeyGuard)
export class OpsQueueController {
  constructor(
    private readonly ops: OpsQueueService,
    private readonly employees: EmployeesService,
  ) {}

  @Get('orders')
  list() {
    return this.ops.listOrders();
  }

  @Get('orders/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getOrder(id);
  }

  @Patch('orders/by-number/:orderNumber/complete')
  async completeByNumber(
    @Param('orderNumber', ParseIntPipe) orderNumber: number,
  ) {
    const o = await this.ops.completeOrderByNumber(orderNumber);
    return { id: o.id, orderNumber: o.orderNumber, status: o.status };
  }

  @Patch('orders/:id/complete')
  async complete(@Param('id', ParseUUIDPipe) id: string) {
    const o = await this.ops.completeOrder(id);
    return { id: o.id, orderNumber: o.orderNumber, status: o.status };
  }

  /** Kitchen lifecycle: start preparing / mark ready / collected / cancel. */
  @Patch('orders/:id/status')
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
  ) {
    const o = await this.ops.setOrderStatus(id, dto.status, {
      reason: dto.reason,
      staffCode: dto.staffCode,
    });
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      preparingAt: o.preparingAt?.toISOString() ?? null,
      readyAt: o.readyAt?.toISOString() ?? null,
      completedAt: o.completedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
    };
  }

  @Get('bento/lookup/:code')
  lookupBento(@Param('code') code: string) {
    return this.ops.lookupBentoPickup(code);
  }

  @Patch('bento/collect/:code')
  collectBento(@Param('code') code: string) {
    return this.ops.collectBentoPickup(code);
  }

  @Post('timesheet/clock-in')
  clockIn(@Body() body: TimesheetCodeDto) {
    return this.employees.clockIn(body.employeeCode);
  }

  @Post('timesheet/clock-out')
  clockOut(@Body() body: TimesheetCodeDto) {
    return this.employees.clockOut(body.employeeCode);
  }
}
