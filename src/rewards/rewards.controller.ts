import { Controller, Get } from '@nestjs/common';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  /** Public catalog of active reward templates (voucher definitions). */
  @Get('voucher-definitions')
  listActiveDefinitions() {
    return this.rewards.listActiveDefinitions();
  }
}
