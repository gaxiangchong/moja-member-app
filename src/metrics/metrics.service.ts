import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private shopHandoffRequested = 0;
  private shopHandoffIssued = 0;
  private shopHandoffIssueFailed = 0;
  private campaignDuplicatesSkipped = 0;
  private campaignRunsCompleted = 0;
  private campaignRunsFailed = 0;

  incShopHandoffRequested() {
    this.shopHandoffRequested++;
  }

  incShopHandoffIssued() {
    this.shopHandoffIssued++;
  }

  incShopHandoffIssueFailed() {
    this.shopHandoffIssueFailed++;
  }

  addCampaignDuplicatesSkipped(n: number) {
    this.campaignDuplicatesSkipped += n;
  }

  incCampaignRunCompleted() {
    this.campaignRunsCompleted++;
  }

  incCampaignRunFailed() {
    this.campaignRunsFailed++;
  }

  snapshot() {
    return {
      shopHandoffRequested: this.shopHandoffRequested,
      shopHandoffIssued: this.shopHandoffIssued,
      shopHandoffIssueFailed: this.shopHandoffIssueFailed,
      campaignDuplicatesSkipped: this.campaignDuplicatesSkipped,
      campaignRunsCompleted: this.campaignRunsCompleted,
      campaignRunsFailed: this.campaignRunsFailed,
    };
  }
}
