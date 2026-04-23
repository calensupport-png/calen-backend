import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { WaitlistAudience } from './waitlist-audience.enum';
import { WaitlistSubmission } from './schemas/waitlist-submission.schema';
import { WaitlistService } from './waitlist.service';

function createModelMock() {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
  };
}

describe('WaitlistService', () => {
  let service: WaitlistService;
  const waitlistSubmissionModel = createModelMock();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        WaitlistService,
        {
          provide: getModelToken(WaitlistSubmission.name),
          useValue: waitlistSubmissionModel,
        },
      ],
    }).compile();

    service = moduleRef.get(WaitlistService);
    waitlistSubmissionModel.findOne.mockResolvedValue(null);
    waitlistSubmissionModel.create.mockImplementation(async (payload) => ({
      ...payload,
      createdAt: new Date('2026-04-23T09:00:00.000Z'),
      updatedAt: new Date('2026-04-23T09:00:00.000Z'),
    }));
  });

  it('creates a new individual waitlist submission', async () => {
    const result = await service.submit(
      {
        audience: WaitlistAudience.INDIVIDUAL,
        individual: {
          fullName: 'Ada Lovelace',
          email: 'Ada@example.com',
          countryOfResidence: 'United Kingdom',
          consentUpdates: true,
          consentPrivacy: true,
        },
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result.status).toBe('created');
    expect(result.audience).toBe(WaitlistAudience.INDIVIDUAL);
    expect(result.submissionId).toMatch(/^WL-[A-F0-9]{8}$/);
    expect(waitlistSubmissionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: WaitlistAudience.INDIVIDUAL,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        normalizedEmail: 'ada@example.com',
        country: 'United Kingdom',
        submissionCount: 1,
      }),
    );
  });

  it('updates an existing organisation waitlist submission', async () => {
    const save = jest.fn().mockResolvedValue({});
    waitlistSubmissionModel.findOne.mockResolvedValue({
      submissionId: 'WL-ABC12345',
      audience: WaitlistAudience.ORGANISATION,
      submissionCount: 2,
      save,
    });

    const result = await service.submit(
      {
        audience: WaitlistAudience.ORGANISATION,
        referralCode: 'ref-123',
        organisation: {
          fullName: 'Jane Smith',
          workEmail: 'risk@company.com',
          jobTitle: 'Head of Risk',
          organisationName: 'Acme Finance',
          organisationType: 'Lender',
          countryMarket: 'United Kingdom',
          consentContact: true,
        },
      },
      {
        requestId: 'req-123',
      },
    );

    expect(result.status).toBe('updated');
    expect(result.submissionId).toBe('WL-ABC12345');
    expect(save).toHaveBeenCalled();
  });
});
