# CALEN Backend Phases

This plan is derived from the current frontend in `trusty-identity-builder` and is meant to guide how `calen-be` should grow from a Nest starter into the main application server.

## What the frontend already expects

The frontend is not just a marketing site. It already models four backend-heavy product areas:

1. Public capture flows
   - Contact forms
   - Waitlist / early access form
   - Footer contact form

2. Individual user product
   - Sign up / sign in / forgot password / verify email
   - Multi-step onboarding
   - Financial identity dashboard
   - Score, trust network, bank connections, sharing, notifications, security, settings, referrals

3. Organisation product
   - Organisation sign up / sign in
   - Organisation onboarding
   - Applicant pipeline, profile search, risk analysis, decision engine, lending offers, compliance, team management, API keys

4. Mobile app
   - A lighter UX on top of the same auth, onboarding, profile, bank connection, and sharing services

The most important takeaway: the mobile app does not need its own backend. It should consume the same APIs as the main individual user product.

## Recommended domain modules for `calen-be`

These are the backend modules the frontend naturally points to:

- `auth`
- `accounts`
- `profiles`
- `onboarding`
- `identity-verification`
- `bank-connections`
- `trust-network`
- `scores`
- `insights`
- `sharing`
- `lending`
- `notifications`
- `security`
- `organisations`
- `org-onboarding`
- `underwriting`
- `api-integrations`
- `compliance`
- `public-intake`

## Phase 0: Platform Foundation

Goal: turn the Nest starter into a real app foundation before feature work.

Deliverables:

- Environment config and validation
- Global API prefix like `/api`
- CORS configured for the frontend app
- Database setup and migrations
- Request validation, error format, logging
- Auth skeleton with roles: `individual`, `organisation`, `admin`
- File upload abstraction for ID documents
- Email abstraction for verification, password reset, invitations
- Background job mechanism for async work like scoring and verification
- Audit log foundation

Suggested outputs:

- Health endpoint
- Versioned API structure
- Base database schema for users, orgs, profiles, sessions, audit logs

Why this comes first:

- Every later phase depends on auth, persistence, uploads, and jobs.

## Phase 1: Auth and Account System

Goal: replace the frontend's current localStorage auth with real server-backed auth.

Frontend areas covered:

- `UserSignUp`, `UserSignIn`
- `OrgSignUp`, `OrgSignIn`
- `ForgotPassword`
- `VerifyEmail`
- `RouteGuard`

Deliverables:

- Individual account registration
- Organisation account registration
- Email/password sign in
- Email verification flow
- Forgot password / reset password flow
- Session or JWT auth
- Current user endpoint
- Logout and session revocation
- Basic profile bootstrap after registration

Core endpoints:

- `POST /auth/register`
- `POST /auth/register-org`
- `POST /auth/login`
- `POST /auth/login-org`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/logout`
- `GET /auth/me`

Exit criteria:

- Frontend auth pages can be wired to real APIs
- Route guards can rely on server-backed auth state

## Phase 2: Individual Onboarding Core

Goal: support the full individual onboarding journey end to end.

Frontend areas covered:

- `Onboarding`
- `StepPersonalProfile`
- `StepIdentityVerification`
- `StepEmployment`
- `StepFinancialProfile`
- `StepConnectBanks`
- `StepTrustNetwork`
- `StepGenerateScore`
- `MobileOnboarding`

Deliverables:

- Personal profile save/update
- Identity verification submission
- Document upload records
- Selfie / liveness placeholder workflow
- Employment and income profile
- Financial profile and goals
- Bank connection records
- Trust contact creation and endorsement requests
- Onboarding progress tracking per user
- Score generation job trigger

Core entities:

- personal profile
- identity verification case
- uploaded documents
- employment profile
- financial profile
- bank connection
- trust contact
- endorsement request
- onboarding state

Core endpoints:

- `GET /me/onboarding`
- `PATCH /me/onboarding/personal-profile`
- `POST /me/onboarding/identity-verification`
- `POST /me/onboarding/identity-documents`
- `PATCH /me/onboarding/employment`
- `PATCH /me/onboarding/financial-profile`
- `GET /banks`
- `POST /me/bank-connections`
- `GET /me/bank-connections`
- `POST /me/trust-contacts`
- `GET /me/trust-contacts`
- `POST /me/trust-contacts/:id/send-request`
- `POST /me/score/generate`

Important scope note:

- Use a provider abstraction for KYC and Open Banking.
- In early implementation, bank connections and KYC can be mocked behind provider interfaces while the product wiring is built.

Exit criteria:

- A user can register, complete onboarding, and reach dashboard-ready data.

## Phase 3: Individual Dashboard Services

Goal: serve real user dashboard data after onboarding.

Frontend areas covered:

- `DashboardHome`
- `DashboardIdentity`
- `DashboardScore`
- `DashboardTrust`
- `DashboardInsights`
- `DashboardLending`
- `DashboardShare`
- `DashboardConnections`
- `DashboardNotifications`
- `DashboardSecurity`
- `DashboardSettings`
- `DashboardReferrals`
- `PlanComparison`

Deliverables:

- Dashboard summary endpoint
- Financial identity profile endpoint
- Score details and score history
- Trust network list and activity
- Connected account status and sync state
- Notification center
- Security events and login history
- User settings and privacy preferences
- Share links and access logs
- Referral links and referral events
- Basic matched lending offers

Core endpoints:

- `GET /me/dashboard`
- `GET /me/profile`
- `GET /me/score`
- `GET /me/score/history`
- `GET /me/trust-contacts`
- `GET /me/trust-activity`
- `GET /me/insights`
- `GET /me/lending-offers`
- `GET /me/notifications`
- `PATCH /me/notifications/read`
- `GET /me/security/logins`
- `GET /me/settings`
- `PATCH /me/settings`
- `POST /me/share-links`
- `GET /me/share-links`
- `PATCH /me/share-links/:id/revoke`
- `GET /me/share-access-log`
- `GET /me/referrals`

Exit criteria:

- Individual dashboard routes can all load from the backend, even if some analytics are initially basic.

## Phase 4: Organisation Accounts and Onboarding

Goal: get the organisation side production-ready enough to enter the portal with real org data.

Frontend areas covered:

- `OrgSignUp`
- `OrgSignIn`
- `OrgOnboarding`

Deliverables:

- Organisation record and admin user relationship
- Organisation verification case
- Integration setup preferences
- Team invite workflow
- Role assignment
- Risk configuration storage
- Organisation settings seed data

Core entities:

- organisation
- organisation member
- invitation
- organisation verification
- integration preference
- risk policy

Core endpoints:

- `GET /org/me`
- `PATCH /org/me/profile`
- `POST /org/me/verification`
- `PATCH /org/me/integration-preferences`
- `POST /org/me/invitations`
- `GET /org/me/team`
- `PATCH /org/me/risk-policy`
- `GET /org/me/onboarding`

Exit criteria:

- An organisation can sign up, complete onboarding, invite team members, and store baseline underwriting configuration.

## Phase 5: Organisation Review and Underwriting Workspace

Goal: power the parts of the org portal that directly consume applicant financial identity data.

Frontend areas covered:

- `OrgDashboardHome`
- `OrgApplicantPipeline`
- `OrgProfileSearch`
- `OrgRiskAnalysis`
- `OrgDecisionEngine`
- `OrgTrustSignals`
- `OrgReputationGraph`
- `OrgLendingOffers`

Deliverables:

- Applicant pipeline records
- Search over shared or consented profiles
- Organisation-side profile view permissions
- Risk analysis snapshots
- Decision rules and rule evaluation
- Offer creation and offer matching
- Trust signal summaries for org review
- Reputation graph read model

Core endpoints:

- `GET /org/dashboard`
- `GET /org/applicants`
- `PATCH /org/applicants/:id/stage`
- `POST /org/profiles/search`
- `GET /org/profiles/:id`
- `GET /org/profiles/:id/risk-analysis`
- `GET /org/decision-rules`
- `POST /org/decision-rules`
- `PATCH /org/decision-rules/:id`
- `DELETE /org/decision-rules/:id`
- `POST /org/decisions/evaluate`
- `GET /org/lending-offers`
- `POST /org/lending-offers`
- `PATCH /org/lending-offers/:id`

Exit criteria:

- Org users can review applicants, search profiles, run decisions, and manage offers using real backend data.

## Phase 6: Compliance, Integrations, and Operations

Goal: support regulated usage and third-party integration.

Frontend areas covered:

- `OrgPortfolioMonitoring`
- `OrgAnalytics`
- `OrgApiIntegrations`
- `OrgTeamManagement`
- `OrgCompliance`
- `OrgNotifications`
- `OrgSettings`
- `OrgSupport`

Deliverables:

- Consent records
- Audit trail and access logging
- API key management
- Request logs and usage metrics
- Webhook support
- Team management actions
- Portfolio monitoring snapshots
- Compliance report records
- Organisation notifications

Core endpoints:

- `GET /org/portfolio`
- `GET /org/analytics`
- `GET /org/api-keys`
- `POST /org/api-keys`
- `DELETE /org/api-keys/:id`
- `GET /org/api-usage`
- `GET /org/request-logs`
- `POST /org/webhooks`
- `GET /org/team`
- `PATCH /org/team/:id`
- `GET /org/compliance/audit-log`
- `GET /org/compliance/consents`
- `GET /org/compliance/reports`
- `GET /org/notifications`
- `PATCH /org/settings`

Exit criteria:

- The org portal is no longer just an internal UI shell; it has auditable, integratable backend services.

## Phase 7: Public Intake and Growth Flows

Goal: close the remaining frontend loops that are not core auth/onboarding, but still need backend support.

Frontend areas covered:

- `Contact`
- `Waitlist`
- footer contact forms
- referral sharing

Deliverables:

- Contact submission endpoint
- Waitlist / early access submissions
- Referral tracking
- Lightweight CRM-style tagging for submissions

Core endpoints:

- `POST /public/contact`
- `POST /public/waitlist`
- `GET /public/referrals/:code`

Why this is later:

- These flows are useful, but they do not block the main app-to-backend integration as much as auth, onboarding, and dashboards do.

## Suggested build order in practice

If we want the fastest path to a working product, we should not build all phases evenly.

Recommended execution order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 7
6. Phase 4
7. Phase 5
8. Phase 6

Why this order works:

- It gets the individual product working first.
- The mobile app can reuse the same individual APIs.
- Organisation features are much broader and should land on a stable identity, profile, scoring, and sharing foundation.

## What to deliberately defer at first

These should not block the first backend milestones:

- Real social auth providers
- Full biometric / liveness verification
- Live Open Banking provider integration
- PDF report export
- Premium billing and subscriptions
- Advanced analytics visualisations
- Full recommendation engine
- Complex portfolio monitoring jobs

Use provider interfaces and placeholders first, then replace them with real integrations later.

## Best first implementation target

The strongest first backend slice is:

1. auth
2. individual onboarding
3. individual dashboard summary
4. share profile basics
5. notifications basics

That slice unlocks:

- web sign up and sign in
- mobile sign up and onboarding reuse
- first real dashboard data
- first org-facing future capability, because shared profiles depend on this foundation
