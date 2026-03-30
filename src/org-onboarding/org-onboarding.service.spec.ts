import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AccountsService } from '../accounts/accounts.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { AccountType } from '../common/enums/account-type.enum';
import { EmailService } from '../email/email.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrgOnboardingService } from './org-onboarding.service';
import { OrganizationInvitation } from './schemas/organization-invitation.schema';
import { OrganizationVerification } from './schemas/organization-verification.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  };
}

describe('OrgOnboardingService', () => {
  let service: OrgOnboardingService;
  const invitationModel = createModelMock();
  const verificationModel = createModelMock();
  const organizationsService = {
    findByIdOrThrow: jest.fn(),
    updateOrganizationProfile: jest.fn(),
    updateOnboardingData: jest.fn(),
  };
  const emailService = {
    sendWelcomeEmail: jest.fn(),
    sendOrganizationTeamInviteEmail: jest.fn(),
  };
  const authService = {
    createAuthenticatedSession: jest.fn(),
  };
  const passwordService = {
    hash: jest.fn(),
  };
  const accountsService = {
    listUsersByOrganization: jest.fn(),
    findUserByIdOrThrow: jest.fn(),
    findUserByEmail: jest.fn(),
    createUser: jest.fn(),
  };

  const orgUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'ops@calen.example',
    accountType: AccountType.ORGANISATION,
    roles: [],
    sessionId: 'session-id',
    organizationId: '507f1f77bcf86cd799439099',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      _id: orgUser.id,
      email: orgUser.email,
      firstName: 'Phoebe',
      emailVerifiedAt: new Date('2026-03-26T00:00:00.000Z'),
    });
    accountsService.listUsersByOrganization.mockResolvedValue([
      { _id: orgUser.id, email: orgUser.email },
    ]);
    accountsService.findUserByEmail.mockResolvedValue(null);
    passwordService.hash.mockResolvedValue('hashed-password');
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrgOnboardingService,
        {
          provide: OrganizationsService,
          useValue: organizationsService,
        },
        {
          provide: AccountsService,
          useValue: accountsService,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: PasswordService,
          useValue: passwordService,
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        {
          provide: getModelToken(OrganizationInvitation.name),
          useValue: invitationModel,
        },
        {
          provide: getModelToken(OrganizationVerification.name),
          useValue: verificationModel,
        },
      ],
    }).compile();

    service = moduleRef.get(OrgOnboardingService);
  });

  it('updates organization profile for organization users', async () => {
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Inc',
      slug: 'calen-inc',
      industry: 'Fintech',
      companySize: '11-50',
      country: 'GB',
      onboardingData: {},
      status: 'pending_verification',
    });
    organizationsService.updateOrganizationProfile.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Labs',
      slug: 'calen-inc',
      industry: 'Fintech',
      companySize: '11-50',
      country: 'GB',
      onboardingData: {},
      status: 'pending_verification',
    });
    verificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    invitationModel.countDocuments.mockResolvedValue(0);

    const result = await service.updateOrganizationProfile(orgUser, {
      name: 'Calen Labs',
    });

    expect(organizationsService.updateOrganizationProfile).toHaveBeenCalled();
    expect(result.organization.name).toBe('Calen Labs');
  });

  it('creates an organization invitation', async () => {
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Inc',
      slug: 'calen-inc',
      industry: 'Fintech',
      companySize: '11-50',
      country: 'GB',
      onboardingData: {
        integrationPreferences: { syncMode: 'manual' },
        riskPolicy: { maxExposure: 5000 },
      },
      status: 'pending_verification',
    });
    invitationModel.create.mockResolvedValue({
      _id: 'invite-1',
      email: 'analyst@calen.example',
      role: 'risk_analyst',
      token: 'orginv_token',
      status: 'pending',
      expiresAt: new Date('2026-04-02T00:00:00.000Z'),
    });
    verificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ status: 'pending_review' }),
    });
    invitationModel.countDocuments.mockResolvedValue(0);

    const result = await service.createInvitation(orgUser, {
      email: 'analyst@calen.example',
      role: 'risk_analyst',
    });

    expect(invitationModel.create).toHaveBeenCalled();
    expect(result.invitation.email).toBe('analyst@calen.example');
    expect(emailService.sendOrganizationTeamInviteEmail).toHaveBeenCalledWith({
      to: 'analyst@calen.example',
      inviterName: 'Phoebe',
      organizationName: 'Calen Inc',
      role: 'risk_analyst',
      acceptInvitationUrl:
        'http://localhost:8080/org/invite/orginv_token?email=analyst%40calen.example',
    });
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith({
      to: orgUser.email,
      firstName: 'Phoebe',
      accountType: 'organisation',
    });
    expect(organizationsService.updateOnboardingData).toHaveBeenCalledWith(
      orgUser.organizationId,
      expect.objectContaining({
        onboardingStatus: 'completed',
      }),
    );
  });

  it('accepts an organization invitation and creates a staff account', async () => {
    invitationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'invite-2',
        organizationId: orgUser.organizationId,
        email: 'staff@calen.example',
        role: 'risk_analyst',
        token: 'orginv_accept',
        status: 'pending',
        expiresAt: new Date('2026-04-02T00:00:00.000Z'),
      }),
    });
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Inc',
      slug: 'calen-inc',
      status: 'pending_verification',
    });
    accountsService.createUser.mockResolvedValue({
      _id: 'staff-user-id',
      email: 'staff@calen.example',
      displayName: 'Staff User',
      accountType: AccountType.ORGANISATION,
      roles: ['organisation'],
      organizationId: {
        _id: orgUser.organizationId,
        name: 'Calen Inc',
      },
    });
    authService.createAuthenticatedSession.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: '1h',
      user: {
        id: 'staff-user-id',
        email: 'staff@calen.example',
      },
    });

    const result = await service.acceptInvitation(
      'orginv_accept',
      {
        fullName: 'Staff User',
        password: 'CorrectHorseBatteryStaple',
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(passwordService.hash).toHaveBeenCalledWith(
      'CorrectHorseBatteryStaple',
    );
    expect(accountsService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'staff@calen.example',
        displayName: 'Staff User',
        accountType: AccountType.ORGANISATION,
      }),
    );
    expect(invitationModel.updateOne).toHaveBeenCalledWith(
      { _id: 'invite-2' },
      expect.objectContaining({
        status: 'accepted',
      }),
    );
    expect(result.accessToken).toBe('token');
  });

  it('deletes a pending organization invitation', async () => {
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Inc',
      slug: 'calen-inc',
      industry: 'Fintech',
      companySize: '11-50',
      country: 'GB',
      onboardingData: {},
      status: 'pending_verification',
    });
    invitationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'invite-delete-1',
        organizationId: orgUser.organizationId,
        status: 'pending',
      }),
    });

    const result = await service.deleteInvitation(orgUser, '507f1f77bcf86cd799439012');

    expect(invitationModel.deleteOne).toHaveBeenCalledWith({
      _id: 'invite-delete-1',
    });
    expect(result.message).toBe('Organization invitation removed.');
  });

  it('rejects non-organization users', async () => {
    await expect(
      service.getOrganization({
        ...orgUser,
        accountType: AccountType.INDIVIDUAL,
        organizationId: undefined,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unverified organization users', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValueOnce({
      _id: orgUser.id,
      email: orgUser.email,
      emailVerifiedAt: null,
    });

    await expect(service.getOrganization(orgUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('marks org onboarding as completed in the summary once all milestones exist', async () => {
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Inc',
      slug: 'calen-inc',
      industry: 'Fintech',
      companySize: '11-50',
      country: 'GB',
      onboardingData: {
        integrationPreferences: { syncMode: 'manual' },
        riskPolicy: { maxExposure: 5000 },
        onboardingCompletedAt: new Date('2026-03-26T00:00:00.000Z'),
      },
      status: 'pending_verification',
    });
    verificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ status: 'pending_review' }),
    });
    invitationModel.countDocuments.mockResolvedValue(1);
    accountsService.listUsersByOrganization.mockResolvedValue([
      { _id: orgUser.id, email: orgUser.email },
    ]);

    const result = await service.getOnboarding(orgUser);

    expect(result.onboarding.status).toBe('completed');
    expect(result.onboarding.progress.isCompleted).toBe(true);
    expect(result.onboarding.progress.hasTeamSetup).toBe(true);
  });
});
