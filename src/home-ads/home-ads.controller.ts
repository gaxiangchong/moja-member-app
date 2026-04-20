import { Controller, Get } from '@nestjs/common';
import { HomeAdsService } from './home-ads.service';

@Controller('home-ads')
export class HomeAdsController {
  constructor(private readonly homeAds: HomeAdsService) {}

  @Get('slides')
  listSlides() {
    return this.homeAds.listPublicSlides();
  }
}
