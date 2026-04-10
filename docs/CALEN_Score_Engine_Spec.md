# CALEN Score Engine Specification

**Version 0.1**  
**Date:** April 2026  
**Status:** Draft for implementation

## Purpose

This document translates the product principles in `docs/CALEN_Scoring_Architecture.md` into an implementable backend score engine for `calen-be`.

The goal of v1 is not to build a black-box risk model. The goal is to build a deterministic, explainable, auditable behavioural score engine that:

- uses open banking transaction data as the scoring foundation
- produces a `CALEN Score` on the `300-900` scale
- returns component breakdowns and plain-language explanations
- keeps contextual trust signals visible but separate from the score
- can evolve later to include credit bureau data without breaking the architecture

## Current Backend Starting Point

The current backend already has pieces we should build on:

- `BankConnection.dataSnapshot` stores provider data payloads for connected bank resources.
- `OnboardingState.scoreRequestedAt` already marks when a user asks for score generation.
- `ScoreSnapshot` currently stores a lightweight mock result used by the dashboard.
- `DashboardService.ensureScoreSnapshot()` currently generates a placeholder score from onboarding completion, bank connection count, and trust contacts.

Relevant files:

- `src/onboarding/schemas/bank-connection.schema.ts`
- `src/onboarding/schemas/onboarding-state.schema.ts`
- `src/dashboard/schemas/score-snapshot.schema.ts`
- `src/dashboard/dashboard.service.ts`

The engine described below should replace the mock logic in `DashboardService` with a proper scoring workflow.

## Non-Negotiable Product Rules

These rules come directly from the product architecture and should shape every implementation decision:

1. The score measures behavioural financial reliability, not wealth or social desirability.
2. v1 scoring uses `Layer 1` open banking data only.
3. Endorsements, narratives, and other trust signals must not directly change the numeric score.
4. The score must be explainable from stored evidence.
5. Scores must be auditable and traceable to a specific input window and engine version.
6. Anti-gaming controls must be part of the engine, not an afterthought.

## V1 Engine Outputs

Each score run should produce one durable scoring result with the following top-level outputs:

- `score`: final numeric score on the `300-900` scale
- `band`: user- and org-readable band derived from the score
- `composite`: weighted `0-100` composite before scaling
- `components`: six component scores with evidence summaries
- `confidence`: how reliable the score is given the observed data window
- `anomalies`: flags for suspicious or low-confidence behaviour
- `reasonCodes`: plain-language drivers of the score
- `inputWindow`: the transaction coverage used for the run
- `engineVersion`: immutable version string for replayability
- `status`: `ready`, `insufficient_data`, `flagged_for_review`, or `failed`

## Proposed Backend Flow

The v1 scoring pipeline should be:

1. User completes onboarding and connects at least one bank source.
2. User requests score generation.
3. Backend enqueues a scoring job.
4. Scoring job reads active bank connection snapshots.
5. Engine normalizes balances, transactions, direct debits, and standing orders into a canonical format.
6. Engine derives monthly behavioural features from the normalized data.
7. Engine computes six component scores.
8. Engine applies confidence and anti-gaming adjustments.
9. Engine maps the weighted composite to the `300-900` score.
10. Engine stores a durable score run plus a dashboard-friendly latest snapshot.
11. Dashboard and organisation views read the stored result, not live-calculated values.

## Recommended Modules

Add these modules rather than embedding scoring logic in dashboard services:

- `scores`
- `scores/engine`
- `scores/jobs`
- `scores/schemas`
- `scores/dto`

Suggested responsibilities:

- `ScoresService`: orchestration, persistence, reads, regeneration
- `ScoreEngineService`: pure scoring logic from normalized input to output
- `ScoreFeatureExtractor`: converts raw provider data into engine-ready features
- `ScoreExplanationService`: derives reason codes and explanation strings
- `ScoreJobProcessor`: async generation and refresh

## Canonical Input Model

The score engine should not read provider payloads directly inside scoring formulas. First normalize them into an internal shape.

### NormalizedAccount

```ts
type NormalizedAccount = {
  connectionId: string;
  provider: string;
  resourceType: 'account' | 'card';
  accountType: string | null;
  currency: string;
  firstSeenAt: string | null;
  lastSyncedAt: string | null;
  balances: NormalizedBalance[];
  transactions: NormalizedTransaction[];
  directDebits: NormalizedDirectDebit[];
  standingOrders: NormalizedStandingOrder[];
};
```

### NormalizedTransaction

```ts
type NormalizedTransaction = {
  id: string;
  bookedAt: string;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  description: string;
  merchantName: string | null;
  category: string | null;
  runningBalance: number | null;
  status: string | null;
  sourceType: 'transaction';
  isInternalTransferCandidate: boolean;
  isSalaryLike: boolean;
  isRecurringCandidate: boolean;
};
```

### NormalizedBalance

```ts
type NormalizedBalance = {
  capturedAt: string | null;
  current: number | null;
  available: number | null;
  overdraft: number | null;
  creditLimit: number | null;
  currency: string;
};
```

## Feature Window Rules

For v1, the score engine should use a rolling observation window with explicit thresholds:

- preferred window: `180 days`
- minimum usable window: `90 days`
- minimum transaction count: `50`
- minimum observed months: `3`
- minimum income-like inflow months for income scoring: `2`

If the data does not meet minimum thresholds:

- return `status = insufficient_data`
- do not invent a fully confident score
- return partial insights explaining what is missing

## Monthly Aggregation Model

After normalization, aggregate behaviour by calendar month in the user/account timezone when available, otherwise UTC.

### MonthlyFeatureRow

```ts
type MonthlyFeatureRow = {
  month: string; // YYYY-MM
  totalInflow: number;
  totalOutflow: number;
  netCashflow: number;
  endBalance: number | null;
  minRunningBalance: number | null;
  daysBelowLowBalance: number;
  incomeLikeCredits: number;
  incomeSourceCount: number;
  recurringObligationsDue: number;
  recurringObligationsPaid: number;
  failedPaymentEvents: number;
  reversalEvents: number;
  discretionarySpikeRatio: number | null;
  volatilityIndex: number | null;
};
```

This monthly layer is what the scoring formulas should use. That keeps the engine explainable and makes recalculation reproducible.

## Six Component Scores

Each component returns a score from `0-100`, a small metrics payload, and explanation evidence.

### 1. Income Reliability `25%`

Measures pattern, consistency, and durability of inflows.

Suggested metrics:

- `income_month_coverage`: percent of observed months with income-like inflows
- `income_amount_stability`: coefficient of variation of monthly income
- `income_source_concentration`: reliance on a single source vs diverse recurring sources
- `income_recurrence_strength`: how strongly credits resemble repeating income
- `income_duration_months`: number of months with observed income

Suggested formula:

```text
IncomeReliability =
  35% income_month_coverage +
  25% income_amount_stability +
  15% income_source_concentration +
  15% income_recurrence_strength +
  10% income_duration_months
```

Scoring intent:

- reward recurring inflows
- do not reward high amount by itself
- do not punish freelancers for irregular timing if patterns are still durable

### 2. Cash Flow Stability `20%`

Measures how coherently money comes in and goes out over time.

Suggested metrics:

- `months_cashflow_positive_or_neutral`
- `outflow_to_inflow_ratio_stability`
- `net_cashflow_variation`
- `post-income liquidity_retention`

Suggested formula:

```text
CashFlowStability =
  40% months_cashflow_positive_or_neutral +
  25% outflow_to_inflow_ratio_stability +
  20% net_cashflow_variation +
  15% post_income_liquidity_retention
```

Scoring intent:

- reward stable inflow/outflow relationships
- penalize repeated cash compression
- focus on pattern, not spending morality

### 3. Balance Resilience `20%`

Measures breathing room and ability to absorb normal financial shocks.

Suggested metrics:

- `avg_end_balance_to_income_ratio`
- `low_balance_event_rate`
- `days_below_resilience_threshold`
- `overdraft_or_near_zero_frequency`

Suggested formula:

```text
BalanceResilience =
  35% avg_end_balance_to_income_ratio +
  25% low_balance_event_rate +
  20% days_below_resilience_threshold +
  20% overdraft_or_near_zero_frequency
```

Scoring intent:

- reward maintained buffer
- penalize repeated balance collapse
- scale against behaviour, not absolute wealth

### 4. Obligation Consistency `15%`

Measures whether recurring commitments appear to be met reliably.

Suggested metrics:

- `recurring_obligations_paid_ratio`
- `failed_direct_debit_rate`
- `payment_reversal_rate`
- `commitment_pattern_stability`

Suggested formula:

```text
ObligationConsistency =
  50% recurring_obligations_paid_ratio +
  20% failed_direct_debit_rate +
  15% payment_reversal_rate +
  15% commitment_pattern_stability
```

Scoring intent:

- reward repeated evidence of met recurring obligations
- penalize failed debits and reversals
- use observed recurring payment patterns, not self-declared bills

### 5. Spending Discipline `10%`

Measures proportionality and stability of outflows relative to income and obligations.

Suggested metrics:

- `discretionary_spike_frequency`
- `essentials_vs_discretionary_balance`
- `unplanned_large_outflow_rate`
- `month_end_overextension_rate`

Suggested formula:

```text
SpendingDiscipline =
  35% discretionary_spike_frequency +
  25% essentials_vs_discretionary_balance +
  20% unplanned_large_outflow_rate +
  20% month_end_overextension_rate
```

Scoring intent:

- do not score merchant category as moral good or bad
- only score erratic or disorganised spending patterns
- treat spending categories as weak signals, not primary truth

### 6. Financial Volatility `10%`

Measures unpredictability and turbulence across the observation window.

Suggested metrics:

- `income_volatility`
- `balance_volatility`
- `net_cashflow_volatility`
- `severe_compression_events`

Suggested formula:

```text
FinancialVolatility =
  30% income_volatility +
  25% balance_volatility +
  25% net_cashflow_volatility +
  20% severe_compression_events
```

Implementation note:

This score should be inverted when used in the weighted composite, because more volatility should reduce the final score.

## Composite Score Formula

After component scoring:

```text
Composite =
  (IncomeReliability * 0.25) +
  (CashFlowStability * 0.20) +
  (BalanceResilience * 0.20) +
  (ObligationConsistency * 0.15) +
  (SpendingDiscipline * 0.10) +
  (FinancialVolatilityAdjusted * 0.10)
```

Where:

```text
FinancialVolatilityAdjusted = 100 - FinancialVolatility
```

Final score:

```text
CALENScore = 300 + (Composite * 6)
```

Round to nearest integer and clamp to `300-900`.

## Score Bands

Use the product architecture bands:

| Score | Organisation Label | User Label |
|---|---|---|
| 300-499 | High Risk | Needs Attention |
| 500-599 | Weak | Less Stable |
| 600-699 | Fair | Developing |
| 700-799 | Strong | Reliable |
| 800-900 | Excellent | Highly Reliable |

For API simplicity, the engine can store:

- `bandKey`: `high_risk`, `weak`, `fair`, `strong`, `excellent`
- `orgLabel`
- `userLabel`

## Confidence Model

Every score run should include a confidence score from `0-100`.

Confidence should be based on:

- observed days in window
- number of months covered
- number of transactions
- number of income-like events
- whether data comes from multiple active accounts
- presence of balance history and recurring obligation signals

Suggested confidence tiers:

- `0-39`: low confidence
- `40-69`: moderate confidence
- `70-100`: high confidence

Confidence affects presentation and review routing, not the base score formula directly.

Recommended behaviour:

- if confidence is low, set `status = flagged_for_review`
- if confidence is moderate or high, set `status = ready`

## Anti-Gaming Rules

The engine should explicitly detect and log suspicious patterns.

Initial v1 flags:

- large atypical inflow near score request date
- repeated circular transfer candidates
- many credits with near-identical values from unknown sources
- abrupt short-lived balance inflation
- too-short observation window
- transaction coverage gaps

Proposed result behaviour:

- anomalies do not silently rewrite history
- anomalies create `anomalyFlags`
- severe anomalies lower confidence
- high-severity anomalies can trigger `flagged_for_review`

## Reason Codes and Explanations

Every score run should return explainable drivers.

Example positive reason codes:

- `income_consistency_strong`
- `healthy_balance_buffer`
- `recurring_commitments_met`
- `cashflow_pattern_stable`

Example negative reason codes:

- `income_pattern_unstable`
- `frequent_low_balance_events`
- `missed_recurring_obligations`
- `high_cashflow_turbulence`

The API should store both machine-safe codes and user-friendly text.

## Proposed Persistence Model

The current `ScoreSnapshot` schema is too thin for the real engine. Keep it for dashboard compatibility if needed, but introduce richer score-run storage.

### Option A: Expand `ScoreSnapshot`

Add fields:

- `composite`
- `bandKey`
- `userLabel`
- `orgLabel`
- `confidenceScore`
- `confidenceLevel`
- `engineVersion`
- `reasonCodes`
- `anomalyFlags`
- `inputWindow`
- `components`
- `metrics`
- `reviewStatus`
- `sourceConnectionIds`

### Option B: Add `ScoreRun` and keep `ScoreSnapshot` as projection

Recommended.

#### `ScoreRun`

```ts
type ScoreRun = {
  userId: ObjectId;
  score: number | null;
  composite: number | null;
  status: 'ready' | 'insufficient_data' | 'flagged_for_review' | 'failed';
  bandKey: string | null;
  orgLabel: string | null;
  userLabel: string | null;
  confidenceScore: number;
  confidenceLevel: 'low' | 'moderate' | 'high';
  engineVersion: string;
  provider: 'calen-v1';
  reasonCodes: string[];
  explanationSummary: string[];
  anomalyFlags: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    detail?: string;
  }>;
  inputWindow: {
    startDate: Date | null;
    endDate: Date | null;
    observedDays: number;
    observedMonths: number;
    transactionCount: number;
    connectionCount: number;
  };
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    metrics: Record<string, number | null>;
    reasons: string[];
  }>;
  sourceConnectionIds: ObjectId[];
  generatedAt: Date;
};
```

#### `ScoreSnapshot`

Use as the latest lightweight dashboard projection:

- `userId`
- `score`
- `band`
- `status`
- `provider`
- `generatedAt`
- `factors`
- `confidenceLevel`

## Recommended API Contracts

### `POST /me/score/generate`

Behaviour:

- validates that the user has eligible bank data
- creates a score job or directly runs the engine in early versions
- returns accepted status and run id

Response:

```json
{
  "job": {
    "status": "queued",
    "scoreRunId": "..."
  }
}
```

### `GET /me/score`

Response:

```json
{
  "score": {
    "score": 724,
    "composite": 70.6,
    "bandKey": "strong",
    "userLabel": "Reliable",
    "orgLabel": "Strong",
    "status": "ready",
    "confidence": {
      "score": 81,
      "level": "high"
    },
    "provider": "calen-v1",
    "engineVersion": "v1.0.0",
    "generatedAt": "2026-04-01T10:30:00.000Z",
    "reasonCodes": [
      "income_consistency_strong",
      "recurring_commitments_met"
    ],
    "explanations": [
      "Income patterns have been consistent across the observed months.",
      "Recurring commitments appear to be met reliably."
    ],
    "anomalyFlags": [],
    "components": [
      {
        "key": "income_reliability",
        "label": "Income Reliability",
        "score": 78,
        "weight": 0.25,
        "metrics": {
          "income_month_coverage": 0.83,
          "income_amount_stability": 0.74
        },
        "reasons": [
          "Recurring income was observed across most months."
        ]
      }
    ],
    "inputWindow": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2026-03-31T23:59:59.999Z",
      "observedDays": 182,
      "observedMonths": 6,
      "transactionCount": 314,
      "connectionCount": 2
    }
  }
}
```

### `GET /me/score/history`

Return historical score runs with summary metadata:

- score
- band
- status
- confidence level
- generatedAt
- engineVersion

### `GET /me/score/:id`

Recommended for debugging and internal review. Returns full run details for one scoring event.

## Dashboard Integration Changes

The dashboard should stop generating scores on read.

Replace:

- mock score creation inside `DashboardService.ensureScoreSnapshot()`

With:

- read latest `ScoreRun` or `ScoreSnapshot`
- return unavailable only when no score has been generated

This is important because:

- scoring should be event-driven and reproducible
- score generation should have audit history
- dashboard reads should not create business-critical data as a side effect

## Implementation Phases

### Phase 1: Replace mock score generation

- create `scores` module
- add `ScoreRun` schema
- move score generation out of `DashboardService`
- add `POST /me/score/generate`
- persist deterministic placeholder engine output from real bank data

### Phase 2: Introduce canonical normalization and feature extraction

- normalize `BankConnection.dataSnapshot`
- build monthly feature rows
- store debug metadata for replayability

### Phase 3: Implement real component formulas

- add six component scorers
- add weighted composite
- add reason code generation
- add confidence model

### Phase 4: Add review and anomaly workflows

- add anomaly flags
- add review statuses
- add internal diagnostics endpoint

### Phase 5: Credit layer expansion

- add bureau/structured obligations as separate input adapters
- preserve the trust layer separation
- version formulas rather than mutating old scores

## Testing Strategy

The score engine must be tested at three levels:

### Unit tests

- normalization helpers
- monthly aggregation
- each component scorer
- band mapping
- confidence mapping
- anomaly detection

### Fixture tests

Create fixed provider-data fixtures for:

- steady salaried user
- freelancer with healthy but irregular income
- user with repeated low-balance events
- user with missed recurring obligations
- suspicious staged inflow case
- insufficient-data case

### Contract tests

- `POST /me/score/generate`
- `GET /me/score`
- `GET /me/score/history`

## Open Questions to Settle Before Coding Formulas

These are implementation decisions we should confirm as we build:

1. What exact heuristics define `income-like` credits in v1?
2. How should we identify recurring obligations when provider categorization is weak?
3. What low-balance threshold should be used by market or currency?
4. Should confidence only label the result, or should very low confidence suppress the numeric score entirely?
5. Do we want to persist normalized monthly feature rows for internal debugging?

## Recommendation

The cleanest path is:

1. create a dedicated `scores` domain
2. introduce a `ScoreRun` schema as the source of truth
3. keep `ScoreSnapshot` as a backward-compatible latest-summary projection
4. build a deterministic rules engine first
5. expose component metrics and reasons from day one

That keeps CALEN aligned with the product architecture: behavioural first, explainable by design, and ready to grow without corrupting the score.
