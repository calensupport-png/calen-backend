interface EmailCta {
  label: string;
  href: string;
}

interface TransactionalEmailTemplateInput {
  previewText?: string;
  title: string;
  greeting: string;
  intro: string;
  body?: string[];
  highlights?: string[];
  cta?: EmailCta;
  finePrint?: string;
}

function renderCalenWordmark(): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;">
      <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1.5" y="1.5" width="97" height="97" rx="26" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.4" />
        <path d="M 67 27 A 24 24 0 1 0 67 73" stroke="#1D4ED8" stroke-width="7" stroke-linecap="round" fill="none" />
        <line x1="63" y1="76" x2="78" y2="26" stroke="#2563EB" stroke-width="5.5" stroke-linecap="round" />
        <circle cx="78" cy="26" r="5.5" fill="#1D4ED8" />
      </svg>
      <span style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.03em;color:#0F172A;">CALEN</span>
    </div>
  `;
}

function renderSocialIcon(type: 'x' | 'facebook' | 'instagram'): string {
  if (type === 'x') {
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 4L19 20M19 4L5 20" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    `;
  }

  if (type === 'facebook') {
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#64748B" />
        <path d="M13.2 8.2H14.8V5.6C14.5 5.6 13.7 5.5 12.8 5.5C10.8 5.5 9.5 6.7 9.5 9.1V11H7.2V13.9H9.5V20H12.3V13.9H14.6L15 11H12.3V9.4C12.3 8.6 12.5 8.2 13.2 8.2Z" fill="#FFFFFF" />
      </svg>
    `;
  }

  return `
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4.5" stroke="#64748B" stroke-width="2" fill="none" />
      <circle cx="12" cy="12" r="3.4" stroke="#64748B" stroke-width="2" fill="none" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="#64748B" />
    </svg>
  `;
}

const CALEN_PRIMARY = '#1D4ED8';
const CALEN_PRIMARY_SOFT = '#EFF6FF';
const CALEN_PRIMARY_BORDER = '#CFE0FF';
const CALEN_TRUST = '#35906B';

export function renderTransactionalEmailTemplate(
  input: TransactionalEmailTemplateInput,
): string {
  const body = input.body ?? [];
  const highlights = input.highlights ?? [];

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${input.title}</title>
      </head>
      <body style="margin:0;padding:0;background:#F3F5F8;color:#0F172A;font-family:Inter,Segoe UI,Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
          ${input.previewText ?? input.title}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F8;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:28px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.08);">
                <tr>
                  <td style="padding:24px 28px 18px 28px;background:linear-gradient(135deg,#F8FAFC 0%,#EEF4FF 100%);border-bottom:1px solid #E2E8F0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          ${renderCalenWordmark()}
                        </td>
                        <td align="right" valign="middle">
                          <table role="presentation" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding-left:10px;">
                                <a href="https://x.com/joincalen" style="text-decoration:none;display:inline-block;">
                                  ${renderSocialIcon('x')}
                                </a>
                              </td>
                              <td style="padding-left:10px;">
                                <a href="https://facebook.com/joincalen" style="text-decoration:none;display:inline-block;">
                                  ${renderSocialIcon('facebook')}
                                </a>
                              </td>
                              <td style="padding-left:10px;">
                                <a href="https://instagram.com/joincalen" style="text-decoration:none;display:inline-block;">
                                  ${renderSocialIcon('instagram')}
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <p style="margin:0 0 10px 0;font-size:14px;line-height:1.55;color:#334155;">${input.greeting}</p>
                    <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.22;font-weight:700;letter-spacing:-0.025em;color:#0F172A;">${input.title}</h1>
                    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.65;color:#334155;">${input.intro}</p>
                    ${body
                      .map(
                        (paragraph) =>
                          `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;color:#475569;">${paragraph}</p>`,
                      )
                      .join('')}
                    ${
                      highlights.length > 0
                        ? `
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 20px 0;border:1px solid ${CALEN_PRIMARY_BORDER};border-radius:20px;background:${CALEN_PRIMARY_SOFT};">
                            <tr>
                              <td style="padding:18px 20px;">
                                ${highlights
                                  .map(
                                    (highlight) => `
                                      <div style="margin:0 0 11px 0;font-size:14px;line-height:1.55;color:#0F172A;">
                                        <span style="display:inline-block;width:20px;height:20px;border-radius:999px;background:${CALEN_TRUST};color:#FFFFFF;text-align:center;line-height:20px;font-size:12px;font-weight:700;margin-right:10px;">✓</span>
                                        ${highlight}
                                      </div>
                                    `,
                                  )
                                  .join('')}
                              </td>
                            </tr>
                          </table>
                        `
                        : ''
                    }
                    ${
                      input.cta
                        ? `
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 10px 0;">
                            <tr>
                              <td align="center" bgcolor="${CALEN_PRIMARY}" style="border-radius:14px;">
                                <a href="${input.cta.href}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;">
                                  ${input.cta.label}
                                </a>
                              </td>
                            </tr>
                          </table>
                        `
                        : ''
                    }
                    ${
                      input.finePrint
                        ? `<p style="margin:14px 0 0 0;font-size:11px;line-height:1.6;color:#64748B;">${input.finePrint}</p>`
                        : ''
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
                    <p style="margin:0 0 6px 0;font-size:12px;line-height:1.55;color:#475569;">
                      Questions? Reply to this email and the CALEN team will help.
                    </p>
                    <p style="margin:0;font-size:11px;line-height:1.55;color:#94A3B8;">
                      CALEN Financial Identity Platform
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
