import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAudienceKind, EmailCampaignStatus } from '@prisma/client';
import { EmailService } from '../notifications/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';

function makeCampaign(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'camp-1',
    name: 'Birthday blast',
    templateKind: 'BIRTHDAY',
    subject: 'Hi {{name}}',
    preheader: null,
    bodyHtml: '<p>Hello</p>',
    audience: EmailAudienceKind.OPTED_IN,
    tierFilter: null,
    birthdayWindowDays: null,
    voucherDefinitionId: null,
    voucherValidDays: null,
    status: EmailCampaignStatus.SCHEDULED,
    scheduledAt: new Date(),
    startedAt: null,
    completedAt: null,
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
    lastError: null,
    createdBy: 'admin:test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MailerService.scheduleCampaign status guard', () => {
  let service: MailerService;
  let prisma: {
    emailCampaign: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      count?: jest.Mock;
    };
    customer: { count: jest.Mock };
    voucherDefinition: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      emailCampaign: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      customer: { count: jest.fn().mockResolvedValue(3) },
      voucherDefinition: { findUnique: jest.fn() },
    };
    const config = {
      get: jest.fn().mockReturnValue('https://api.example.com'),
    };
    const email = {
      isConfigured: jest.fn().mockReturnValue(true),
      getSubjectPrefix: jest.fn().mockReturnValue('Moja'),
      send: jest.fn(),
    };
    service = new MailerService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      email as unknown as EmailService,
    );
  });

  it('atomically claims DRAFT/SCHEDULED → SCHEDULED', async () => {
    const when = new Date(Date.now() + 60_000).toISOString();
    const campaign = makeCampaign({ status: EmailCampaignStatus.SCHEDULED });
    prisma.emailCampaign.findUnique
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce({
        ...campaign,
        status: EmailCampaignStatus.SCHEDULED,
      });
    prisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.scheduleCampaign('camp-1', when);
    expect(prisma.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'camp-1',
        status: {
          in: [EmailCampaignStatus.DRAFT, EmailCampaignStatus.SCHEDULED],
        },
      },
      data: {
        status: EmailCampaignStatus.SCHEDULED,
        scheduledAt: expect.any(Date),
      },
    });
    expect(res.campaign.status).toBe(EmailCampaignStatus.SCHEDULED);
  });

  it('does not overwrite SENDING/SENT when a concurrent schedule loses the claim', async () => {
    const when = new Date(Date.now() + 60_000).toISOString();
    prisma.emailCampaign.findUnique.mockResolvedValue(
      makeCampaign({ status: EmailCampaignStatus.SCHEDULED }),
    );
    prisma.emailCampaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.scheduleCampaign('camp-1', when),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailCampaign.updateMany).toHaveBeenCalled();
  });
});

describe('MailerService.cancelCampaign status guard', () => {
  let service: MailerService;
  let prisma: {
    emailCampaign: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      emailCampaign: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new MailerService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
      {
        isConfigured: jest.fn(),
        getSubjectPrefix: jest.fn().mockReturnValue('Moja'),
        send: jest.fn(),
      } as unknown as EmailService,
    );
  });

  it('cancels only while still SCHEDULED', async () => {
    const campaign = makeCampaign({ status: EmailCampaignStatus.SCHEDULED });
    prisma.emailCampaign.findUnique
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce({
        ...campaign,
        status: EmailCampaignStatus.CANCELLED,
        scheduledAt: null,
      });
    prisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.cancelCampaign('camp-1');
    expect(prisma.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', status: EmailCampaignStatus.SCHEDULED },
      data: {
        status: EmailCampaignStatus.CANCELLED,
        scheduledAt: null,
      },
    });
    expect(res.campaign.status).toBe(EmailCampaignStatus.CANCELLED);
  });

  it('refuses when the dispatcher already claimed SENDING', async () => {
    prisma.emailCampaign.findUnique.mockResolvedValue(
      makeCampaign({ status: EmailCampaignStatus.SCHEDULED }),
    );
    prisma.emailCampaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelCampaign('camp-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
