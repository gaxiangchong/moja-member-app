import { BadRequestException } from '@nestjs/common';
import { SegmentationService } from './segmentation.service';

describe('SegmentationService', () => {
  const createService = () => {
    const prisma = {
      campaignRun: {
        create: jest.fn(),
      },
    };
    const loyalty = {
      appendLedgerEntry: jest.fn(),
    };
    const service = new SegmentationService(
      prisma as any,
      { log: jest.fn() } as any,
      loyalty as any,
      {} as any,
    );
    return { loyalty, prisma, service };
  };

  it('rejects negative points_bonus campaigns before creating a run', async () => {
    const { loyalty, prisma, service } = createService();
    const countSegment = jest.spyOn(service, 'countSegment');

    await expect(
      service.runCampaign(
        {
          filters: { status: 'ACTIVE' },
          action: 'points_bonus',
          payload: { deltaPoints: -100, reason: 'correction' },
        },
        'marketing@example.com',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(countSegment).not.toHaveBeenCalled();
    expect(prisma.campaignRun.create).not.toHaveBeenCalled();
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });
});
