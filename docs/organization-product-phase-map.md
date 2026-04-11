# CALEN Organisation Product Phase Map

This document translates [CALEN_for_Organisations.md](/Users/jay/Desktop/calen/CALEN_for_Organisations.md) into an engineering roadmap for the current codebase.

For ticket-level implementation slices, use [organization-product-backlog.md](/Users/jay/Desktop/calen/calen-be/docs/organization-product-backlog.md).

It is meant to answer three practical questions:

1. What is already real in the repo for the organisations product?
2. How should we refine the current underwriting service so it matches the product story more closely?
3. How should Verify, Passport, and Monitor phase in after Underwrite without blurring product boundaries?

## Product Source of Truth

The organisation overview defines the intended commercial build order:

1. `Phase 1: CALEN Underwrite`
2. `Phase 2: CALEN Verify`
3. `Phase 3: CALEN Passport`
4. `Phase 4: CALEN Monitor`

That sequencing is still correct for the codebase. The main adjustment we need is to split `Phase 1` into a current hardening phase and a fuller decisioning phase, because Underwrite exists already but does not yet expose the full product shape described in the doc.

## Current State in the Codebase

### Foundations already in place

The repo already has the shared primitives the org product depends on:

- Individual onboarding, bank connections, trust contacts, and score generation in [onboarding.service.ts](/Users/jay/Desktop/calen/calen-be/src/onboarding/onboarding.service.ts) and [scores.service.ts](/Users/jay/Desktop/calen/calen-be/src/scores/scores.service.ts)
- Public sharing and CALEN ID style profile lookup in [dashboard.service.ts](/Users/jay/Desktop/calen/calen-be/src/dashboard/dashboard.service.ts)
- Organisation account setup, onboarding, policy storage, and org settings in [org-dashboard.service.ts](/Users/jay/Desktop/calen/calen-be/src/org-dashboard/org-dashboard.service.ts)

### What Underwrite already does well

The current underwriting service is a real Phase 1 base, not a placeholder:

- Pipeline and case APIs exist in [underwriting.controller.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.controller.ts)
- Org users can create a case from a `CALEN ID` in [underwriting.service.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/underwriting.service.ts)
- Cases store applicant summary, score snapshot, policy snapshot, recommendation, notes, and timeline in [underwriting-case.schema.ts](/Users/jay/Desktop/calen/calen-be/src/underwriting/schemas/underwriting-case.schema.ts)
- The org UI already supports pipeline movement and case review in [OrgApplicantPipeline.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgApplicantPipeline.tsx) and [OrgUnderwritingCase.tsx](/Users/jay/Desktop/calen/trusty-identity-builder/src/components/org/OrgUnderwritingCase.tsx)
- The score engine already provides confidence, anomaly flags, components, reason codes, and explainable summaries in [scores.service.ts](/Users/jay/Desktop/calen/calen-be/src/scores/scores.service.ts)

### Where Underwrite does not yet match the product doc

The product overview describes CALEN Underwrite as a fuller behavioural decisioning product than the current implementation exposes. The biggest gaps are:

- No explicit underwriting-only outputs yet for:
  - affordability score
  - income stability score
  - financial resilience score
  - debt pressure indicator
  - surplus cash estimate
  - volatility signal
  - decision rationale grouped into strengths and risks
- Recommendation logic is still mostly score-threshold driven rather than obligation-specific
- Requested amount is stored, but it does not yet materially change the underwriting outcome
- No org export package yet for audit-ready decision reports
- No embedded workflow or API webhook flow yet for real-time org operations
- Portfolio monitoring exists as a shell, but score history and behaviour trend feeds are still empty in [org-dashboard.service.ts](/Users/jay/Desktop/calen/calen-be/src/org-dashboard/org-dashboard.service.ts)

## Recommended Phase Model

### Phase 1A: Underwrite Hardening

Goal: turn the existing underwriting service into the true MVP described in the organisation document.

This phase should stay narrow. We should not dilute it by building Verify, Passport, and Monitor features inside the same slice.

### Deliverables

- Keep `CALEN Score` as the cross-platform behavioural score
- Add underwriting-specific outputs on top of the score snapshot:
  - affordability score
  - income stability score
  - resilience score
  - debt pressure indicator
  - surplus cash estimate
  - volatility signal
- Make `requestedAmount` and `productType` affect underwriting logic
- Split recommendation rationale into:
  - strengths
  - risk factors
  - policy triggers
  - manual review reasons
- Add audit-ready case export and decision summary
- Add pipeline filters and dashboard analytics tied to real underwriting cases

### Implementation guidance

- Extend the current `scores` layer rather than replacing it
- Introduce an `underwriting assessment` object derived from the score run plus obligation context
- Keep the score pure and reusable; do not embed org policy directly into score generation
- Store the underwriting result as a snapshot so later decisions remain auditable

### Definition of done

Underwrite is done for MVP when an organisation can:

- search or receive a CALEN profile
- create a case
- see score evidence and underwriting outputs separately
- review policy-triggered recommendations
- record notes and decisions
- export a decision record for audit or compliance

### Phase 2: Verify

Goal: create a standalone verification layer that is useful before full underwriting.

This should build on the existing onboarding and bank-connection foundations, not reinvent them.

### Deliverables

- `CALEN Verify` service and summary model
- Verification outputs for:
  - account authenticity
  - account ownership confidence
  - active account status
  - income pattern confirmation
  - cash-flow consistency check
  - data quality and confidence level
- Org-facing verification outcome:
  - verified
  - verified with caution
  - unable to verify
- Reusable verification snapshot attachable to underwriting cases

### Why this is Phase 2

- The repo already has identity submission, bank connection records, and onboarding state
- Verify should become the trusted input layer for Underwrite, not a side effect inside it
- Some orgs will buy verification before they buy full decisioning

### Definition of done

An organisation can run or receive a verification result without opening a full underwriting case.

### Phase 3: Passport

Goal: turn CALEN ID plus sharing into a reusable organisation-grade financial profile.

The foundations already exist in lightweight form:

- share links
- CALEN ID lookup
- public shared profile access logging

Phase 3 is where these become a proper product instead of a profile-sharing utility.

### Deliverables

- Durable `Passport` profile package with versioned shareable fields
- Consent grants by organisation and purpose
- Time-limited access with revocation
- Structured share scopes:
  - score only
  - verification only
  - underwriting summary
  - full profile package
- Organisation intake flow that accepts Passport directly
- Passport access logs visible to users and organisations

### Design rule

Passport should package trusted outputs from Verify and Underwrite. It should not become a second scoring system.

### Definition of done

A user can present a CALEN profile to multiple organisations without repeating the full connection and review flow each time, and each access remains scoped, logged, and revocable.

### Phase 4: Monitor

Goal: move from point-in-time decisioning to ongoing portfolio intelligence.

This is last because it only becomes useful once organisations have approved or active cases worth monitoring.

### Deliverables

- Monitoring enrollment for approved or active profiles
- Scheduled score refresh and delta tracking
- Behaviour drift signals for:
  - income decline
  - surplus cash deterioration
  - increased low-balance events
  - rising volatility
  - increased debt pressure
  - missed obligation indicators
- Alert severity model:
  - informational
  - caution
  - critical
- Real portfolio score history and behaviour trends
- Webhook and notification delivery for alerts

### Definition of done

An organisation can monitor a live portfolio, receive meaningful alerts, and see trends based on real refreshed evidence rather than static snapshots.

## Cross-Phase Product Rules

These rules should stay stable across all phases:

- `CALEN Score` is behavioural and reusable
- `Underwriting` is decision-contextual and may vary by org policy
- `Verify` confirms the reliability of the evidence
- `Passport` packages consented outputs for reuse
- `Monitor` tracks change over time after onboarding or approval
- Trust signals remain visible context, not direct score inputs

## Practical Build Order From Here

If we are aligning work to the organisation document, the cleanest next sequence is:

1. Finish `Phase 1A` Underwrite hardening
2. Build `Phase 2` Verify as a reusable snapshot layer
3. Upgrade sharing into `Phase 3` Passport
4. Convert portfolio scaffolding into real `Phase 4` Monitor

## Immediate Next Backlog

The highest-leverage next tickets are:

1. Add an `underwriting assessment` snapshot model separate from raw score output
2. Make `requestedAmount` and policy thresholds drive recommendation outcomes
3. Expose doc-aligned underwriting fields in API and UI
4. Add exported decision summaries for org case reviews
5. Build a standalone `Verify` snapshot that Underwrite can optionally consume

## Summary

The organisation doc is directionally correct and matches the repo better than it may look at first glance.

The real story today is:

- Underwrite is already the live first product
- it needs refinement more than reinvention
- Verify should be the next reusable evidence layer
- Passport should formalize sharing once org trust exists
- Monitor should come after real approved-case volume exists
