# CALEN Financial Identity & Scoring Architecture

**Foundational Product Document**  
**Version 1.0 | March 2026 | Internal - Confidential**

---

## Contents

1. [What CALEN Is - and Is Not](#section-01-what-calen-is---and-is-not)  
2. [The Problem CALEN is Solving](#section-02-the-problem-calen-is-solving)  
3. [The Principle Behind the Score](#section-03-the-principle-behind-the-score)  
4. [The Data Model](#section-04-the-data-model)  
5. [What Data Should Not Affect the Score](#section-05-what-data-should-not-affect-the-score)  
6. [The Scoring Architecture](#section-06-the-scoring-architecture)  
7. [Score Bands](#section-07-score-bands)  
8. [How Each Component is Measured](#section-08-how-each-component-is-measured)  
9. [Anti-Gaming Design](#section-09-anti-gaming-design)  
10. [How CALEN Differs from Existing Systems](#section-10-how-calen-differs-from-existing-systems)  
11. [User Questions - and How CALEN Answers](#section-11-user-questions---and-how-calen-answers)  
12. [Organisation Questions - and How CALEN Answers](#section-12-organisation-questions---and-how-calen-answers)  
13. [Compliance and Governance Implications](#section-13-compliance-and-governance-implications)  
14. [MVP Boundary](#section-14-mvp-boundary)  
15. [Final Product Principle](#section-15-final-product-principle)

---

## Section 01: What CALEN Is - and Is Not

CALEN should not be described - internally or externally - as "another credit score." That framing weakens the product immediately by placing it into a category dominated by incumbents and inviting the wrong comparison.

CALEN is a financial interpretation and decision-support system. Its purpose is to take fragmented financial signals and turn them into a clear, structured, and usable representation of financial reliability - good enough for a user to rely on when a real decision is being made, and clear enough for an organisation to trust when speed, fairness, and confidence matter.

The core output of CALEN is not just a number. It is a package of three things:

- **CALEN Score** - reflects observed behavioural reliability.
- **Financial Identity Profile** - explains the score in human terms and provides decision-ready context.
- **CALEN ID** - the portable reference that allows the profile to be shared, reviewed, and traced consistently.

CALEN is not trying to replace all existing underwriting from day one. It is trying to become the missing layer between raw financial data and actual decisions.

## Section 02: The Problem CALEN is Solving

Most financial decisions today are made with partial information.

Traditional credit systems capture borrowing history, repayment records, defaults, and related credit events. That is useful, but incomplete. It misses the difference between someone who has never used much credit and someone who is genuinely unstable. It also misses the quality of day-to-day money management, the consistency of income, the resilience of cash flow, and the shape of affordability over time.

At the same time, many organisations still rely on manual review - collecting bank statements, payslips, screenshots, references, and PDFs, then asking staff to interpret them under time pressure. That creates inconsistency, avoidable subjectivity, slow turnaround, and poor user experience.

CALEN exists to improve both sides of this equation: for users, it creates a clearer representation of their financial reality; for organisations, it reduces the burden of interpretation and provides a standardised view of financial reliability.

## Section 03: The Principle Behind the Score

The score measures behavioural financial reliability - not social worth, wealth, class, popularity, or personal desirability.

This distinction matters. If CALEN starts trying to "score the person" broadly, it becomes ethically weak, easy to challenge, and difficult to trust. If it remains disciplined and measures financial behaviour only, it can be explained, defended, and improved.

The score should answer one narrow but valuable question:

> "How consistently and sustainably does this person appear to manage money over time, based on observed financial signals?"

Not: are they a good person? Not: are they wealthy? Not: what does the model feel about them? The score is anchored in observed behaviour - nothing more, nothing less.

## Section 04: The Data Model

For the MVP, open banking transaction data is sufficient to build a meaningful first version. Long term, CALEN should operate across a layered data model to become a robust financial identity layer used across multiple decision types.

| Layer | Source | Goes into Score? |
|---|---|---|
| Layer 1: Behavioural Bank Data | Open banking transaction data via AIS consent | Yes - foundation |
| Layer 2: Structured Credit & Obligations | Credit bureau data, repayment history, utilisation | Yes - complementary |
| Layer 3: Verified Contextual Data | Employer/landlord endorsements, payroll confirmation | No - Trust Layer only |

### Layer 1 - Behavioural Bank Data

This is the foundation. It comes from current account and transaction data, with explicit consent, through an open banking provider. Open Banking standards require that users are clearly informed what is being shared, why, and for how long - and that they retain the right to manage and revoke consent at any time.

- **Income consistency** - regularity, variability, source concentration, and durability.
- **Balance stability** - whether the user maintains a healthy cushion or repeatedly approaches zero.
- **Cash flow volatility** - predictability of inflows and outflows over time.
- **Recurring obligation behaviour** - whether regular commitments appear to be met consistently.
- **Spending pattern stability** - not what is spent on, but whether patterns are erratic relative to income.
- **Resilience behaviour** - capacity to absorb normal financial shocks without balance collapse.

### Layer 2 - Structured Credit & Obligations

The next expansion layer includes, where legally and commercially feasible, credit bureau data and structured obligations - existing debt, repayment history, defaults, arrears, and credit utilisation. This layer complements behavioural data; it does not replace it. Behavioural data tells you how someone manages money now. Credit data tells you how they have interacted with formal credit systems over time.

### Layer 3 - Verified Contextual Data

This is where CALEN becomes more useful without corrupting the score. Verified employment confirmation, rent payment history, payroll-linked income, and verified endorsements belong here - displayed as profile context, not fed into the numeric score. This is one of the most important design decisions in the entire system.

## Section 05: What Data Should Not Affect the Score

Not all useful data should influence the score. The score must remain behaviourally pure enough to be trusted and explained. That means certain information is shown - but not scored.

Endorsements are the clearest example. If an employer, landlord, or accountant confirms something meaningful, that is valuable context. But it should not directly raise the numeric score. Otherwise the score becomes easier to manipulate, more socially biased, and less defensible.

| SCORE | TRUST LAYER |
|---|---|
| What the behavioural and structured financial data says. Objective. Explainable. Consistent. | What verified people or entities say alongside the score. Visible. Contextual. Separate. |

The same principle applies to user-provided narrative explanations. They can be displayed as context in the profile but should not directly alter the score.

## Section 06: The Scoring Architecture

The score should be simple enough to explain, but robust enough to matter. For v1, CALEN uses a 300-900 scale - familiar enough for immediate comprehension, wide enough to create meaningful distribution.

| Component | Weight | What It Measures |
|---|---:|---|
| Income Reliability | 25% | Pattern, consistency, and durability of inflows |
| Cash Flow Stability | 20% | Coherence of inflow-outflow relationship over time |
| Balance Resilience | 20% | Breathing room and ability to absorb normal shocks |
| Obligation Consistency | 15% | Evidence of recurring commitments being met reliably |
| Spending Discipline | 10% | Proportionality and stability of outflows vs income |
| Financial Volatility | 10% | Month-to-month unpredictability and turbulence |

### The Composite Formula

Each component is calculated as a sub-score from 0 to 100, then combined using the weights above:

```text
CALEN Composite =
  (Income Reliability x 0.25) +
  (Cash Flow Stability x 0.20) +
  (Balance Resilience x 0.20) +
  (Obligation Consistency x 0.15) +
  (Spending Discipline x 0.10) +
  (Financial Volatility x 0.10)
```

The composite is then mapped to the 300-900 range:

```text
CALEN Score = 300 + (Composite x 6)
```

Example: a composite of 70 produces a CALEN Score of 720.

## Section 07: Score Bands

Score categories should be clear and credible. The wording shown to users should be thoughtful - the product should inform without shaming.

| Score Range | Organisation Label | User-Facing Language |
|---|---|---|
| 300 - 499 | High Risk | Needs Attention |
| 500 - 599 | Weak | Less Stable |
| 600 - 699 | Fair | Developing |
| 700 - 799 | Strong | Reliable |
| 800 - 900 | Excellent | Highly Reliable |

## Section 08: How Each Component is Measured

### 8.1 Income Reliability

This should not be based on raw amount - it should be based on pattern. Key signals: how regularly income appears; how many months it has been observed; how concentrated it is; how variable the monthly amount is; and whether sources look recurring or one-off. Someone earning £2,000 consistently every month may be more reliable than someone earning £4,000 one month and £300 the next.

### 8.2 Cash Flow Stability

This examines the shape of the account over time. Key signals: the ratio between inflows and outflows; whether the user consistently ends periods with positive remaining funds; and whether there are repeated periods of instability or severe compression.

### 8.3 Balance Resilience

This is about financial breathing room. Key signals: average end-of-month balance; frequency of low-balance events; time spent below resilience thresholds; and whether the person appears able to absorb normal expenses without balance collapse.

### 8.4 Obligation Consistency

This focuses on recurring commitments. Key signals: whether regular rent, utilities, subscriptions, or debt repayments appear to be met; whether there are repeated failed direct debits or payment reversals; and whether commitments appear stable and managed.

### 8.5 Spending Discipline

This must be designed carefully to avoid moral judgement. The model should not penalise someone for the category of their spending. It should look for: extreme spikes relative to normal baseline; persistent imbalance between discretionary spending and essential obligations; and patterns of disorganisation, not lifestyle taste.

### 8.6 Financial Volatility

This measures unpredictability. Key signals: month-to-month swings in income; large unstable balance movements; sudden severe cash compression patterns; and repeated short-term turbulence.

## Section 09: Anti-Gaming Design

No honest scoring system can claim to be impossible to game. What CALEN can do is make gaming difficult, expensive, and detectable. The main defence is to rely on patterns over time, not single events.

Anti-gaming mechanisms include:

- Minimum history thresholds. Scores should become more confident as more history is available.
- Confidence weighting. Profiles should include confidence indicators where the observed window is short or fragmented.
- Anomaly detection. Sudden atypical deposits, circular transfers, or engineered behaviour should be flagged or excluded.
- Source diversity checks. Multiple recurring, explainable income sources are interpreted differently from suspicious clustered inflows.
- Temporal smoothing. Rolling averages and trend windows reduce the power of one-off spikes.

The design goal is not "make gaming impossible" - it is "make the score reflect durable patterns rather than staged moments."

## Section 10: How CALEN Differs from Existing Systems

Experian and similar credit bureaus are excellent at what they do: collecting and organising historical credit data. That is not the same as interpreting current financial behaviour for a decision-ready use case. CALEN differs in three fundamental ways:

- **Behavioural interpretation first.** CALEN centres observed behaviour rather than historical borrowing alone.
- **Decision-ready profile structure.** Results are structured to be used directly in decisions - not just viewed passively.
- **Score-Trust Layer separation.** Objective behavioural scoring is kept cleanly separate from contextual trust signals. This creates a more defensible and explainable architecture.

## Section 11: User Questions - and How CALEN Answers

Users will not trust CALEN by default. They will ask reasonable questions - and the product must answer all of them plainly.

**Q: Is connecting my bank account safe?**  
CALEN uses read-only access under explicit AIS consent. You can revoke access at any time through your consent dashboard. We never have the ability to move or touch your money.

**Q: What exactly is being read?**  
Your transaction history - inflows, outflows, balances, and recurring patterns. Nothing more. CALEN does not read personal messages, card details, or login credentials.

**Q: Does this affect my credit file?**  
No. CALEN is not a credit reference agency and does not report to or query credit bureaus. Your CALEN Score is entirely separate from your credit file.

**Q: Why is my score what it is?**  
The profile shows the main factors behind your score in plain language. You will always be able to see enough to understand what is driving the result.

**Q: How do I improve it?**  
Consistency over time is the most reliable path. Regular income, stable balances, and met obligations are the strongest positive signals.

**Q: Does CALEN penalise freelancers or irregular earners?**  
No. The model is designed to interpret varied income patterns fairly. Irregular does not automatically mean unreliable - the system looks for consistency within whatever pattern is present.

## Section 12: Organisation Questions - and How CALEN Answers

Organisations will care less about identity narrative and more about reliability, consistency, interpretability, and operational value.

**Q: Is the score explainable?**  
Yes. CALEN provides a clear breakdown of contributing components alongside every score. No black boxes.

**Q: Can it be used consistently across applicants?**  
Yes. The model applies a standardised methodology across all users. The same behaviour produces the same score.

**Q: Does it reduce manual work?**  
Yes. CALEN replaces the need to manually interpret bank statements and payslips with a structured, profile-ready summary.

**Q: Is it auditable?**  
Yes. Consent records, data sources, score components, and profile outputs are logged and traceable.

**Q: Does it introduce compliance risk?**  
CALEN is designed as a decision-support layer with human review pathways. It is not positioned as a system that auto-rejects applicants. Profiling safeguards under UK GDPR are built into the architecture.

## Section 13: Compliance and Governance Implications

If CALEN processes behavioural financial data and produces interpretive scoring, it must treat fairness, consent, explainability, revocation, and human review as first-order product requirements - not legal afterthoughts.

Minimum product requirements include:

- Clear, plain-language consent screens before any data is accessed.
- Explicit explanation of consent duration, scope, and what is being shared.
- A consent dashboard where users can view and revoke access at any time.
- A score explanation view that shows the main drivers of the result.
- A challenge and review process if a user believes the output is incorrect.

Open Banking standards require clear consent management and revocation. UK GDPR requires fairness safeguards and additional protections where profiling or automated decisions materially affect individuals. These requirements shape the product - not just the legal small print.

## Section 14: MVP Boundary

For the MVP, CALEN should not attempt to be omniscient. The strongest v1 proves whether the product deserves to exist - with a clear, honest, and defensible first version.

### In Scope - v1

- Open banking data in, via AIS consent
- Behavioural interpretation across six components
- CALEN Score on the 300-900 scale
- Human-readable Financial Identity Profile
- CALEN ID - portable and shareable
- Organisation-facing profile view
- Endorsements shown separately - not scored
- Score explanation in plain language
- Consent and revocation built properly from day one

### Deferred - Post-MVP

- Credit bureau integration (Layer 2)
- Broader verified contextual data (Layer 3)
- Deeper organisation workflow integrations
- Advanced model refinement and calibration
- Multi-jurisdiction expansion

## Section 15: Final Product Principle

CALEN should help people be understood more accurately in real financial decisions, using behaviour that can be explained, defended, and trusted.

If a feature increases opacity, weakens explainability, rewards gaming, or makes the score more socially manipulable - it should not be in the core score.

If a feature adds meaningful context without corrupting the objectivity of the score - it belongs in the broader profile.

The strongest version of CALEN is not a magical score, not a glossy dashboard, and not a vague "financial reputation platform." It is a disciplined behavioural interpretation engine that turns financial data into decision-ready identity.

The model should be explainable. The score should be constrained. The trust layer should be separate. The data model should grow in layers. And the product should always serve one practical outcome:

> Making people easier to understand, more fairly, when real decisions are being made.
