# CALEN Underwrite UI Test Guide

This guide covers how to test the Phase 1A organisation work in the browser:

- underwriting case creation from a `CALEN ID`
- obligation-aware underwriting assessment
- recommendation output and case triage
- pipeline cards and filters
- decision-engine rules feeding live Underwrite
- risk-analysis workspace alignment
- JSON decision export

Use this with the implementation backlog in [organization-product-backlog.md](/Users/jay/Desktop/calen/calen-be/docs/organization-product-backlog.md).

## Prerequisites

Run the backend and frontend locally.

Expected local URLs:

- Frontend: `http://localhost:8080`
- Backend API: whatever `VITE_API_URL` points to in `trusty-identity-builder/.env`

You need two account contexts:

- An organisation account that can access `/org/dashboard`
- An individual profile with a valid `CALEN ID`, for example `CALEN-ABCD-1234`

For the fullest test, the individual profile should have:

- completed onboarding profile data
- employment or financial profile income
- bank-derived score history available through `ScoresService.getLatestScore`
- optional trust contacts

If the individual has no score yet, the UI should still open a case, but the recommendation should fall back toward manual review and score-dependent fields may show as unavailable.

## Quick Smoke Test

1. Sign in as an organisation user at `http://localhost:8080/org/sign-in`.
2. Open `http://localhost:8080/org/dashboard/search`.
3. Enter a real `CALEN ID`.
4. Fill the case context fields:
   - select a product type
   - requested amount, which formats as currency while typing
   - requested term in months
   - monthly obligation, which formats as currency while typing
5. Start an underwriting case.
6. Confirm you land on `/org/dashboard/cases/:caseId`.
7. Confirm the case page shows:
   - recommendation outcome
   - affordability score
   - surplus cash estimate
   - income stability
   - resilience
   - confidence
   - strengths
   - risk factors
   - policy triggers where relevant
   - obligation context
8. Open `/org/dashboard/pipeline`.
9. Confirm the new case appears with affordability, confidence, recommendation, requested amount, and stage.

Pass condition: an org reviewer can understand the underwriting decision without reading raw score components first.

## Test Scenario 1: Basic Case Creation

Route: `/org/dashboard/search`

Steps:

1. Search for a valid `CALEN ID`.
2. Confirm the profile result appears.
3. Enter a modest requested amount and monthly obligation.
4. Click the action to create or open the underwriting case.

Expected result:

- A case is created or the existing open case is returned.
- The case page displays applicant summary and underwriting assessment.
- The top recommendation should be one of:
  - `approve`
  - `approve_with_conditions`
  - `review`
  - `decline`
- The raw behavioural score evidence is lower on the page, not the primary story.

Things to inspect:

- `Affordability Score`
- `Debt Pressure`
- `Volatility`
- `Top strengths`
- `Top risk factors`
- `Policy triggers`
- `Timeline`

## Test Scenario 2: Obligation Context Changes Outcome

Route: `/org/dashboard/search`

Create two cases for different applicants, or close/reject the old case before retesting the same applicant.

Low-obligation input:

- requested amount: `5000`
- term months: `24`
- monthly obligation: `250`

High-obligation input:

- requested amount: `50000`
- term months: `12`
- monthly obligation: `4500`

Expected result:

- The high-obligation case should show weaker affordability or stronger review/decline signals.
- `Surplus Cash Estimate` should change based on the monthly obligation.
- `Policy triggers` may include `affordability_watch`, `affordability_shortfall`, `high_debt_pressure`, or `max_exposure_*`.

Pass condition: the underwriting result changes because the obligation changed, not only because the applicant score changed.

## Test Scenario 3: Pipeline Triage

Route: `/org/dashboard/pipeline`

Steps:

1. Create several cases with different requested amounts and recommendations.
2. Open the pipeline.
3. Use the filters:
   - stage
   - risk
   - recommendation
   - confidence
4. Move a case through stages using the stage dropdown.

Expected result:

- Pipeline cards show:
  - recommendation badge
  - risk badge
  - confidence badge
  - affordability score
  - requested amount
  - manual-review warning when recommendation is `review`
- Summary counts update when filters change.
- Stage updates persist after refresh.

Pass condition: an underwriter can triage cases from the pipeline without opening every case.

## Test Scenario 4: Decision Engine Simulation

Route: `/org/dashboard/decisions`

Steps:

1. Enter a valid `CALEN ID`.
2. Click `Simulate`.
3. Confirm the simulation context loads.
4. Confirm available rule fields include:
   - `CALEN Score`
   - `Affordability Score`
   - `Income Stability`
   - `Resilience Score`
   - `Confidence Score`
   - `Surplus Cash`
5. Add a rule, for example:
   - `IF Affordability Score < 90 THEN Flag for Review`
6. Save rules.
7. Run simulation again.

Expected result:

- Simulation shows the applicant score, affordability, confidence, surplus cash, native recommendation, triggered rule, and decision result.
- The field list is underwriting-aligned, not old proxy fields like generic debt/trust percentages.

Pass condition: the side workspace previews rule behaviour using the same underwriting signals used by live cases.

## Test Scenario 5: Saved Rules Affect Live Underwrite

Routes:

- `/org/dashboard/decisions`
- `/org/dashboard/search`
- `/org/dashboard/cases/:caseId`

Steps:

1. In Decision Engine, save a rule that should definitely match the test profile.
2. Good deterministic examples:
   - `IF Affordability Score < 100 THEN Flag for Review`
   - `IF CALEN Score < 900 THEN Flag for Review`
   - `IF Surplus Cash < 999999 THEN Flag for Review`
3. Go to Profile Search.
4. Create a new underwriting case for a profile that does not already have an open case.
5. Open the case detail page.

Expected result:

- Recommendation escalates to `review` when the matching rule action is `Flag for Review`.
- The case may route directly to `Under Review`.
- The case page shows `Matched decision rules`.
- `Policy triggers` includes a trigger like `decision_rule_77_flag_for_review`.
- Timeline includes automatic triage when the stage changed on creation.

Important rule behaviour:

- `Reject` can escalate to `decline`.
- `Flag for Review` can escalate to `review`.
- `Approve` is recorded as a positive matched rule, but it does not override harder underwriting concerns.

Pass condition: rules saved in the Decision Engine are no longer only simulation state; they influence new live underwriting cases.

## Test Scenario 6: Auto Decision Mode

Route: `/org/dashboard/settings`

Steps:

1. Open Settings.
2. Set `Decision mode` to `Auto decision`.
3. Save settings.
4. Create a new underwriting case.

Expected result:

- Clean `approve` cases can route straight to `approved`.
- `decline` cases can route straight to `rejected`.
- `review` still routes to `review`.
- `approve_with_conditions` routes to `analysis`.

Safety expectation:

- Auto mode should not turn review or decline cases into approvals.
- Approval rules should not silently override red flags.

Pass condition: automatic routing is opt-in and conservative.

## Test Scenario 7: Risk Analysis Workspace

Route: `/org/dashboard/risk`

Steps:

1. Enter a valid `CALEN ID`.
2. Load the profile.
3. Review the signal map and underwriter view.

Expected result:

- The page shows:
  - recommendation preview
  - affordability
  - income stability
  - resilience
  - confidence
  - debt pressure
  - volatility
  - strengths
  - risk factors
  - anomaly flags
  - trust endorsements
- Notes can be saved and persist after reload.

Pass condition: Risk Analysis and Underwrite use the same product language and do not drift into old proxy metrics.

## Test Scenario 8: Decision Export

Route: `/org/dashboard/cases/:caseId`

Steps:

1. Open a case detail page.
2. Click `Export JSON`.
3. Open the downloaded JSON file.

Expected result:

The export should include:

- `caseId`
- `calenId`
- `stage`
- `riskLevel`
- `applicantSummary`
- `obligationContext`
- `scoreSnapshot`
- `underwritingAssessment`
- `policySnapshot`
- `recommendation`
- `reviewerNotes`
- `timeline`

Pass condition: the JSON is audit-ready and reflects the stored case snapshots, including matched decision rules when any fired.

## Recommended Regression Checklist

Run these after changing Underwrite, Decision Engine, Risk Analysis, or org settings:

- Create a normal case from Profile Search.
- Create a high-obligation case and confirm affordability changes.
- Add a decision rule and confirm it appears in live case detail.
- Confirm pipeline filters still work.
- Confirm Risk Analysis can load the same `CALEN ID`.
- Export a case JSON file.
- Refresh each page and confirm state persists.

## Known Testing Notes

- Searching a `CALEN ID` with an existing case now loads the latest saved case context on Profile Search.
- A duplicate open case for the same `CALEN ID` updates and returns the existing case instead of creating a new one.
- A duplicate approved or rejected case can be opened for audit, or used to prefill a fresh underwriting case.
- To retest the same profile from scratch without prefilled context, use another `CALEN ID`.
- If no score exists, expect conservative manual-review behaviour.
- If no org decision rules are saved, live Underwrite still uses base risk policy and obligation-aware assessment.
- The backend unit coverage for this path is in [underwriting.service.spec.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.spec.ts) and [org-dashboard.service.spec.ts](/Users/jay/Desktop/calen/calen-be/src/org-dashboard/org-dashboard.service.spec.ts).

## Verification Commands

Backend:

```bash
cd /Users/jay/Desktop/calen/calen-be
npm test -- underwriting.service.spec.ts org-dashboard.service.spec.ts
npm run build
```

Frontend:

```bash
cd /Users/jay/Desktop/calen/trusty-identity-builder
npm run build
```
