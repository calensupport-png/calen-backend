import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderTransactionalEmailTemplate } from './templates/transactional-email.template';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  senderType: 'auth' | 'platform';
}

interface WelcomeEmailInput {
  to: string;
  firstName?: string;
  accountType: 'individual' | 'organisation';
}

interface ReferralInviteEmailInput {
  to: string;
  inviterName: string;
  referralCode: string;
}

interface EmailVerificationInput {
  to: string;
  firstName?: string;
  verificationUrl: string;
}

interface PasswordResetEmailInput {
  to: string;
  firstName?: string;
  resetUrl: string;
}

interface TrustRequestEmailInput {
  to: string;
  requesterName: string;
  contactName: string;
  relationship: string;
  reviewUrl: string;
}

interface TrustRequestOutcomeEmailInput {
  to: string;
  firstName?: string;
  contactName: string;
  status: 'endorsed' | 'declined';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
    const appBaseUrl = this.getAppBaseUrl();
    const destinationPath =
      input.accountType === 'organisation' ? '/org/dashboard' : '/app/dashboard';
    const firstName = input.firstName?.trim() || 'there';

    const html = renderTransactionalEmailTemplate({
      previewText: 'Welcome to CALEN. Your financial identity journey starts here.',
      greeting: `Hi ${firstName},`,
      title: 'Welcome to CALEN',
      intro:
        'Your account is ready. We are excited to help you build a richer financial identity that goes beyond traditional credit scoring.',
      body: [
        input.accountType === 'organisation'
          ? 'You can now access your organisation workspace, manage onboarding, and begin reviewing trust and underwriting data.'
          : 'The next step is to complete your onboarding profile so your score, insights, sharing tools, and trust network can unlock properly.',
      ],
      highlights:
        input.accountType === 'organisation'
          ? [
              'Access your organisation dashboard',
              'Set up your team and onboarding preferences',
              'Prepare to review applicant trust and score data',
            ]
          : [
              'Complete your personal onboarding',
              'Generate your CALEN score and insights',
              'Create secure share links for lenders and partners',
            ],
      cta: {
        label:
          input.accountType === 'organisation'
            ? 'Open Organisation Workspace'
            : 'Open Your Dashboard',
        href: `${appBaseUrl}${destinationPath}`,
      },
      finePrint:
        'If this account was not created by you, please reply to this email immediately so we can help secure it.',
    });

    await this.sendEmail({
      to: input.to,
      subject: 'Welcome to CALEN',
      html,
      senderType: 'platform',
    });
  }

  async sendReferralInviteEmail(
    input: ReferralInviteEmailInput,
  ): Promise<void> {
    const referralLink = `${this.getAppBaseUrl()}/signup?ref=${encodeURIComponent(
      input.referralCode,
    )}`;

    const html = renderTransactionalEmailTemplate({
      previewText: `${input.inviterName} invited you to join CALEN.`,
      greeting: 'Hello,',
      title: 'You were invited to join CALEN',
      intro: `${input.inviterName} shared a CALEN referral link with you so you can start building your own trusted financial identity profile.`,
      body: [
        'CALEN helps people present a stronger, more complete financial identity through onboarding, score generation, trust signals, and secure profile sharing.',
      ],
      highlights: [
        'Build your financial identity beyond traditional credit files',
        'Unlock shareable score and profile views',
        'Track trust, onboarding, and financial readiness in one place',
      ],
      cta: {
        label: 'Accept Invitation',
        href: referralLink,
      },
      finePrint: `Referral code: ${input.referralCode}`,
    });

    await this.sendEmail({
      to: input.to,
      subject: `${input.inviterName} invited you to CALEN`,
      html,
      senderType: 'platform',
    });
  }

  async sendEmailVerificationEmail(
    input: EmailVerificationInput,
  ): Promise<void> {
    const firstName = input.firstName?.trim() || 'there';
    const html = renderTransactionalEmailTemplate({
      previewText: 'Verify your email address to continue with CALEN.',
      greeting: `Hi ${firstName},`,
      title: 'Verify your email address',
      intro:
        'Confirm your email to secure your CALEN account and continue into onboarding.',
      body: [
        'For your security, we need to verify that this email belongs to you before you can continue using your account.',
      ],
      highlights: [
        'Unlock onboarding and dashboard access',
        'Keep your account secure',
        'Activate your CALEN identity journey',
      ],
      cta: {
        label: 'Verify Email Address',
        href: input.verificationUrl,
      },
      finePrint:
        'This verification link expires after 24 hours. If you did not create this account, you can safely ignore this email.',
    });

    await this.sendAuthEmail({
      to: input.to,
      subject: 'Verify your CALEN email address',
      html,
    });
  }

  async sendPasswordResetEmail(
    input: PasswordResetEmailInput,
  ): Promise<void> {
    const firstName = input.firstName?.trim() || 'there';
    const html = renderTransactionalEmailTemplate({
      previewText: 'Reset your CALEN password securely.',
      greeting: `Hi ${firstName},`,
      title: 'Reset your password',
      intro:
        'We received a request to reset your CALEN password. Use the secure link below to choose a new one.',
      body: [
        'If you requested this reset, continue below. If not, you can ignore this email and your password will remain unchanged.',
      ],
      cta: {
        label: 'Reset Password',
        href: input.resetUrl,
      },
      finePrint:
        'This password reset link expires after 1 hour for your security.',
    });

    await this.sendAuthEmail({
      to: input.to,
      subject: 'Reset your CALEN password',
      html,
    });
  }

  async sendTrustRequestEmail(input: TrustRequestEmailInput): Promise<void> {
    const html = renderTransactionalEmailTemplate({
      previewText: `${input.requesterName} requested a trust endorsement through CALEN.`,
      greeting: `Hi ${input.contactName},`,
      title: 'You have a new CALEN trust request',
      intro: `${input.requesterName} asked you to provide a trust endorsement for their CALEN financial identity profile.`,
      body: [
        `They listed you as a ${input.relationship.toLowerCase()} who can speak to their reliability and financial trustworthiness.`,
        'Open the secure review page below to endorse them or decline the request. Your response helps strengthen the accuracy of their profile.',
      ],
      highlights: [
        'Confirm whether you know this person',
        'Share how long and in what capacity you know them',
        'Submit an endorsement or decline securely',
      ],
      cta: {
        label: 'Review Trust Request',
        href: input.reviewUrl,
      },
      finePrint:
        'If you do not recognize this request, you can simply ignore this email.',
    });

    await this.sendEmail({
      to: input.to,
      subject: `${input.requesterName} requested your CALEN endorsement`,
      html,
      senderType: 'platform',
    });
  }

  async sendTrustRequestOutcomeEmail(
    input: TrustRequestOutcomeEmailInput,
  ): Promise<void> {
    const firstName = input.firstName?.trim() || 'there';
    const isEndorsed = input.status === 'endorsed';

    const html = renderTransactionalEmailTemplate({
      previewText: isEndorsed
        ? `${input.contactName} endorsed your CALEN profile.`
        : `${input.contactName} declined your CALEN trust request.`,
      greeting: `Hi ${firstName},`,
      title: isEndorsed
        ? 'A trust endorsement just came in'
        : 'A trust request was declined',
      intro: isEndorsed
        ? `${input.contactName} submitted a CALEN trust endorsement for your profile.`
        : `${input.contactName} declined your CALEN trust request.`,
      body: [
        isEndorsed
          ? 'Your trust network just got stronger. You can review the updated trust activity and continue building your profile from the dashboard.'
          : 'No stress. You can invite another trusted contact from your network and keep building your CALEN profile.',
      ],
      highlights: isEndorsed
        ? [
            'Your trust network signal has improved',
            'The endorsement is now reflected in your activity',
            'You can keep inviting more trusted contacts',
          ]
        : [
            'Your request was marked as declined',
            'You can invite another professional contact anytime',
            'Your onboarding progress remains available',
          ],
      cta: {
        label: 'Open CALEN Dashboard',
        href: `${this.getAppBaseUrl()}/app/dashboard/trust`,
      },
      finePrint: isEndorsed
        ? 'CALEN will continue reflecting new trust signals as your network responds.'
        : 'You can still complete onboarding and send additional trust requests at any time.',
    });

    await this.sendEmail({
      to: input.to,
      subject: isEndorsed
        ? `${input.contactName} endorsed your CALEN profile`
        : `${input.contactName} declined your CALEN trust request`,
      html,
      senderType: 'platform',
    });
  }

  private async sendEmail(input: SendEmailInput): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      this.logger.warn(
        `Skipping email "${input.subject}" because RESEND_API_KEY is not configured.`,
      );
      return;
    }

    const from =
      input.senderType === 'auth'
        ? this.configService.get<string>('AUTH_EMAIL_FROM_ADDRESS')?.trim()
        : this.configService.get<string>('PLATFORM_EMAIL_FROM_ADDRESS')?.trim();
    if (!from) {
      this.logger.warn(
        `Skipping email "${input.subject}" because the ${input.senderType} sender address is not configured.`,
      );
      return;
    }

    const replyTo = this.configService.get<string>('EMAIL_REPLY_TO')?.trim();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        `Resend email send failed for "${input.subject}" with status ${response.status}: ${body}`,
      );
    }
  }

  private getAppBaseUrl(): string {
    return (
      this.configService.get<string>('APP_BASE_URL')?.trim() ||
      'http://localhost:8080'
    );
  }

  // Reserved for verification, password reset, login alerts, and similar flows.
  protected async sendAuthEmail(input: Omit<SendEmailInput, 'senderType'>) {
    await this.sendEmail({
      ...input,
      senderType: 'auth',
    });
  }
}
