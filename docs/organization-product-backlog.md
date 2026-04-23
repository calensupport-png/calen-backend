# CALEN Organisation Product Backlog

This backlog turns [organization-product-phase-map.md](/Users/jay/Desktop/calen/calen-be/docs/organization-product-phase-map.md) into concrete implementation slices.

For browser validation of the completed Underwrite slices, use [underwrite-ui-test-guide.md](/Users/jay/Desktop/calen/calen-be/docs/underwrite-ui-test-guide.md).

It is intentionally biased toward the current repo shape:

- `calen-be` owns schemas, orchestration, and org APIs
- `trusty-identity-builder` owns org portal UX and API wiring
- the current first product is `Underwrite`, so the first tickets harden that path before expanding the rest of the suite

## Delivery Rules

- Keep `CALEN Score` reusable and behaviourally pure
- Keep organisation policy evaluation separate from score generation
- Treat `Verify`, `Passport`, and `Monitor` as distinct product layers, not labels pasted onto one service
- Prefer additive snapshots over recomputing live decision outputs in read paths

## Phase 1A: Underwrite Hardening

### P1A-01 Underwriting Assessment Snapshot

Goal: add a doc-aligned underwriting payload on top of the existing score snapshot.

Scope:

- Add an `underwritingAssessment` object to [underwriting-case.schema.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/schemas/underwriting-case.schema.ts)
- Populate it in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- Expose it through [underwriting.ts](/Users/jay/Desktop/calen/trusty-identity-builder/src/api/underwriting.ts)

Fields:

- affordabilityScore
- incomeStabilityScore
- resilienceScore
- debtPressureIndicator
- surplusCashEstimate
- volatilitySignal
- strengths
- riskFactors
- generatedAt

Acceptance criteria:

- Every newly created underwriting case stores an immutable assessment snapshot
- Existing score snapshot remains intact and separate
- Org case detail API returns both score evidence and underwriting assessment

Dependencies:

- none

### P1A-02 Obligation Context on Case Creation

Goal: make underwriting outcomes depend on the obligation being assessed, not only the applicant profile.

Scope:

- Extend [create-underwriting-case.dto.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/dto/create-underwriting-case.dto.ts)
- Update case creation in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- Update start-case flow in [OrgProfileSearch.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgProfileSearch.tsx)

Recommended new inputs:

- requestedAmount
- requestedTermMonths
- monthlyObligationAmount
- productCategory
- decisionPurpose

Acceptance criteria:

- An org user can open a case with enough obligation context for affordability analysis
- Missing optional context falls back gracefully
- Underwriting recommendation reasons mention the obligation context when relevant

Dependencies:

- P1A-01

### P1A-03 Recommendation Engine v2

Goal: upgrade recommendation logic from simple thresholding to policy-aware underwriting.

Scope:

- Refactor `buildRecommendation` in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- Use underwriting assessment values plus org risk policy
- Align outputs with org-facing decisions:
  - approve
  - approve_with_conditions
  - review
  - decline

Rules to support first:

- minimum score
- max exposure
- affordability shortfall
- low confidence
- anomaly review
- high debt pressure
- volatile cash-flow review

Acceptance criteria:

- Recommendation output changes when obligation context or policy thresholds change
- Triggered rules are explicit and persisted
- Decision rationale is grouped into strengths, risks, and policy triggers

Dependencies:

- P1A-01
- P1A-02

### P1A-04 Underwrite API Contract Uplift

Goal: make the API shape match the organisation product story.

Scope:

- Update backend response serializers in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- Update frontend types in [underwriting.ts](/Users/jay/Desktop/calen/trusty-identity-builder/src/api/underwriting.ts)

Add or refine:

- underwriting assessment block
- richer recommendation block
- confidence summary
- decision rationale sections
- policy trigger summary

Acceptance criteria:

- The frontend no longer has to infer underwriting outputs from raw score components
- Case detail response supports direct rendering of product-level fields from the doc

Dependencies:

- P1A-01
- P1A-03

### P1A-05 Org Underwriting Case UI Refresh

Goal: present the case in product language instead of exposing only raw score internals.

Scope:

- Update [OrgUnderwritingCase.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgUnderwritingCase.tsx)

UX changes:

- add underwriting summary cards
- separate behavioural score evidence from underwriting outputs
- display strengths and risk factors explicitly
- show triggered policies and conditions
- display obligation context clearly

Acceptance criteria:

- A reviewer can understand the case without interpreting low-level score components first
- The top of the case answers:
  - can they afford this?
  - what is driving the recommendation?
  - what needs manual review?

Dependencies:

- P1A-04

### P1A-06 Pipeline and Workspace Alignment

Goal: make the pipeline reflect underwriting reality, not just generic case movement.

Scope:

- Update [OrgApplicantPipeline.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgApplicantPipeline.tsx)
- Update summary serializers in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)

Recommended additions:

- affordability badge
- confidence badge
- requested amount preview
- recommendation badge
- case filters by stage, risk, and recommendation

Acceptance criteria:

- Reviewers can triage the queue using underwriting-specific signals
- Pipeline cards expose enough data to prioritize without opening every case

Dependencies:

- P1A-04

### P1A-07 Decision Export and Audit Summary

Goal: create the first audit-ready decision package promised in the organisation doc.

Scope:

- Add export endpoint in the underwriting module
- Generate structured JSON first, PDF later
- Include:
  - applicant summary
  - score snapshot summary
  - underwriting assessment
  - recommendation
  - policy snapshot
  - reviewer notes
  - timeline

Potential files:

- [underwriting.controller.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.controller.ts)
- [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)

Acceptance criteria:

- An org can export a decision record suitable for audit storage
- Export reflects the stored case snapshot, not live recalculated data

Dependencies:

- P1A-04

### P1A-08 Risk Analysis and Decision Engine Alignment

Goal: stop the side-workspace views from drifting away from the real underwriting model.

Scope:

- Align [OrgRiskAnalysis.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgRiskAnalysis.tsx) with the same assessment fields used in underwriting cases
- Align [OrgDecisionEngine.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgDecisionEngine.tsx) rules with real org policy fields
- Reduce duplicate pseudo-modeling in [org-dashboard.types.ts](/Users/jay/Desktop/calen/calen-be/src/org-dashboard/org-dashboard.types.ts)

Acceptance criteria:

- Risk analysis uses the same conceptual fields as underwriting
- Decision engine simulations reference real supported fields, not placeholder-only metrics

Dependencies:

- P1A-01
- P1A-03

### P1A-09 Test Coverage for Underwrite v2

Goal: lock the product model down with backend tests before adding Verify.

Scope:

- Add or extend tests for:
  - case creation
  - obligation-aware recommendation outcomes
  - policy trigger handling
  - export payload generation

Potential files:

- [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- new `underwriting.service.spec.ts`

Acceptance criteria:

- Recommendation outcomes are deterministic for known fixtures
- Snapshot payload shape is test-covered

Dependencies:

- P1A-01 to P1A-08 as applicable

## Phase 2: Verify

### P2-01 Verification Snapshot Model

Goal: define `CALEN Verify` as its own product object.

Scope:

- New verification snapshot schema
- Service that derives verification outputs from:
  - bank connection data
  - identity verification state
  - onboarding completeness

Outputs:

- accountAuthenticityStatus
- ownershipConfidence
- activeAccountStatus
- incomePatternConfirmation
- cashflowConsistencyIndicator
- dataQuality
- verificationOutcome

Acceptance criteria:

- Verification can be generated without opening an underwriting case

### P2-02 Verify API and Org Entry Flow

Goal: give organisations a direct verification product path.

Scope:

- verification endpoints
- org profile search action for `Run Verify`
- standalone org verification summary view

Acceptance criteria:

- An org can verify a profile before underwriting it

### P2-03 Underwrite Consumes Verify Snapshot

Goal: make Verify a reusable evidence layer for Underwrite.

Scope:

- optional verification snapshot attachment on case creation
- recommendation logic can use verification confidence as a review trigger

Acceptance criteria:

- Underwrite can reference Verify without collapsing the two products into one schema

## Phase 3: Passport

### P3-01 Passport Grant Model

Goal: replace generic share links with organisation-grade access grants.

Scope:

- scoped share grants by organisation and purpose
- expiries and revocation
- share scopes:
  - score
  - verify
  - underwrite summary
  - full profile

Acceptance criteria:

- Access is purpose-bound and auditable

### P3-02 Passport Package API

Goal: expose a reusable profile package for org intake.

Scope:

- passport summary endpoint
- org retrieval endpoint
- access log expansion

Acceptance criteria:

- The same Passport can be reused across multiple orgs with controlled scopes

### P3-03 User Dashboard Passport Controls

Goal: give users explicit control over what they share.

Scope:

- upgrade sharing UX in the individual dashboard
- show active grants, scopes, and revocation options

Acceptance criteria:

- Users can see and manage live organisation access

## Phase 4: Monitor
clea
### P4-01 Monitoring Enrollment Model

Goal: let organisations enroll approved profiles into ongoing monitoring.

Scope:

- monitoring enrollment record
- monitored profile state
- consent linkage

Acceptance criteria:

- Only approved or explicitly consented profiles can enter monitoring

### P4-02 Refresh and Alert Engine

Goal: produce real monitoring events instead of static placeholders.

Scope:

- scheduled refresh jobs
- compare latest score and behavioural indicators against prior baseline
- create alerts for:
  - income decline
  - resilience decline
  - volatility rise
  - debt pressure increase
  - obligation stress

Acceptance criteria:

- Alerts are generated from stored comparisons, not hand-authored placeholders

### P4-03 Portfolio Metrics and Trends

Goal: replace empty portfolio charts with live data.

Scope:

- populate portfolio score history and behaviour trends in [org-dashboard.service.ts](/Users/jay/Desktop/calen/calen-be/src/org-dashboard/org-dashboard.service.ts)
- wire to [OrgPortfolioMonitoring.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgPortfolioMonitoring.tsx)

Acceptance criteria:

- Portfolio charts render real monitoring history

### P4-04 Alert Delivery and Webhooks

Goal: make Monitor operationally useful for integrated orgs.

Scope:

- org notifications for monitoring alerts
- webhook delivery for critical events
- delivery status logging

Acceptance criteria:

- A configured org can receive monitoring alerts in-app and via webhook

## Suggested Execution Order

If we want the fastest path to a stronger product, the next implementation order should be:

1. `P1A-01` Underwriting assessment snapshot
2. `P1A-02` Obligation context on case creation
3. `P1A-03` Recommendation engine v2
4. `P1A-04` API contract uplift
5. `P1A-05` Org underwriting case UI refresh
6. `P1A-06` Pipeline and workspace alignment
7. `P1A-07` Decision export and audit summary
8. `P1A-08` Risk analysis and decision engine alignment
9. `P1A-09` Test coverage
10. `P2-01` to `P2-03`
11. `P3-01` to `P3-03`
12. `P4-01` to `P4-04`

## Best Next Build Slice

The best immediate implementation slice is:

- `P1A-01`
- `P1A-02`
- `P1A-03`
- `P1A-04`
- first half of `P1A-05`

That slice gives us the first truly doc-aligned version of `CALEN Underwrite` without waiting on the later products.
