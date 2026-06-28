import { Module } from '@nestjs/common';
import { HomeAdsController } from './home-ads.controller';
import { HomeAdsService } from './home-ads.service';

@Module({
  controllers: [HomeAdsController],
  providers: [HomeAdsService],
  exports: [HomeAdsService],
})
export class HomeAdsModule {}
