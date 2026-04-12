import { OnboardingStateDocument } from '../onboarding/schemas/onboarding-state.schema';

export type UnderwritingScoreSnapshotShape = {
  score: number | null;
  composite: number | null;
  band: string | null;
  status: string;
  engineVersion: string | null;
  confidenceLevel: string | null;
  confidenceScore: number | null;
  explanations: string[];
  reasonCodes: string[];
  anomalyFlags: Array<{
    code: string;
    severity: string;
    detail?: string;
  }>;
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    metrics: Record<string, number | null>;
    reasons: string[];
  }>;
  generatedAt: Date | null;
};

export type UnderwritingObligationContextShape = {
  requestedAmount: number | null;
  requestedTermMonths: number | null;
  monthlyObligationAmount: number | null;
  productCategory: string | null;
  decisionPurpose: string | null;
};

export type UnderwritingAssessmentShape = {
  affordabilityScore: number | null;
  incomeStabilityScore: number | null;
  resilienceScore: number | null;
  debtPressureIndicator: 'Low' | 'Medium' | 'High';
  surplusCashEstimate: number | null;
  volatilitySignal: 'Stable' | 'Moderate' | 'Volatile';
  strengths: string[];
  riskFactors: string[];
  generatedAt: Date;
};

type LatestScoreShape = {
  score: number | null;
  composite: number | null;
  bandKey?: string | null;
  status: string;
  engineVersion?: string | null;
  confidence?:
    | {
        level?: string | null;
        score?: number | null;
      }
    | null;
  explanations?: string[];
  reasonCodes?: string[];
  anomalyFlags?: Array<{
    code: string;
    severity: string;
    detail?: string;
  }>;
  components?: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    metrics: Record<string, number | null>;
    reasons: string[];
  }>;
  generatedAt?: Date | null;
} | null;

export const UNDERWRITING_DECISION_FIELDS = [
  {
    label: 'CALEN Score',
    description: 'Overall behavioural score from the latest scoring run.',
    unit: 'score',
  },
  {
    label: 'Affordability Score',
    description: 'Estimated capacity to carry additional obligations.',
    unit: 'score',
  },
  {
    label: 'Income Stability',
    description: 'Consistency of inflows across the observed period.',
    unit: 'score',
  },
  {
    label: 'Resilience Score',
    description: 'Balance and liquidity resilience from recent account history.',
    unit: 'score',
  },
  {
    label: 'Confidence Score',
    description: 'Confidence in the score based on data depth and quality.',
    unit: 'score',
  },
  {
    label: 'Surplus Cash',
    description: 'Estimated monthly headroom after core expenses.',
    unit: 'currency',
  },
] as const;

export function buildUnderwritingScoreSnapshot(
  latestScore: LatestScoreShape,
): UnderwritingScoreSnapshotShape {
  if (!latestScore) {
    return {
      score: null,
      composite: null,
      band: null,
      status: 'unavailable',
      engineVersion: null,
      confidenceLevel: null,
      confidenceScore: null,
      explanations: [
        'No completed CALEN score was available at the time this underwriting case was created.',
      ],
      reasonCodes: ['score_unavailable'],
      anomalyFlags: [],
      components: [],
      generatedAt: null,
    };
  }

  return {
    score: latestScore.score,
    composite: latestScore.composite,
    band: latestScore.bandKey ?? null,
    status: latestScore.status,
    engineVersion: latestScore.engineVersion ?? null,
    confidenceLevel: latestScore.confidence?.level ?? null,
    confidenceScore: latestScore.confidence?.score ?? null,
    explanations: Array.isArray(latestScore.explanations)
      ? latestScore.explanations
      : [],
    reasonCodes: Array.isArray(latestScore.reasonCodes)
      ? latestScore.reasonCodes
      : [],
    anomalyFlags: Array.isArray(latestScore.anomalyFlags)
      ? latestScore.anomalyFlags
      : [],
    components: Array.isArray(latestScore.components)
      ? latestScore.components.map((component) => ({
          key: component.key,
          label: component.label,
          score: component.score,
          weight: component.weight,
          metrics: component.metrics,
          reasons: component.reasons,
        }))
      : [],
    generatedAt: latestScore.generatedAt ?? null,
  };
}

export function buildUnderwritingAssessment(input: {
  scoreSnapshot: UnderwritingScoreSnapshotShape;
  onboardingState: OnboardingStateDocument | null;
  obligationContext: UnderwritingObligationContextShape;
  monthlyIncomeOverride?: number | null;
  generatedAt?: Date;
}): UnderwritingAssessmentShape {
  const { scoreSnapshot, onboardingState, obligationContext } = input;
  const employmentProfile =
    (onboardingState?.employmentProfile as
      | {
          monthlyIncome?: number;
        }
      | null
      | undefined) ?? null;
  const financialProfile =
    (onboardingState?.financialProfile as
      | {
          monthlyIncome?: number;
          monthlyExpenses?: number;
          housingCost?: number;
          loanCount?: number;
          outstandingLoanTotal?: number;
        }
      | null
      | undefined) ?? null;
  const monthlyIncome =
    input.monthlyIncomeOverride ??
    employmentProfile?.monthlyIncome ??
    financialProfile?.monthlyIncome ??
    null;
  const baselineExpenses =
    typeof financialProfile?.monthlyExpenses === 'number'
      ? financialProfile.monthlyExpenses
      : typeof financialProfile?.housingCost === 'number'
        ? financialProfile.housingCost
        : null;
  const estimatedExistingDebtLoad =
    typeof financialProfile?.outstandingLoanTotal === 'number' &&
    financialProfile.outstandingLoanTotal > 0
      ? Math.round(
          Math.max(
            financialProfile.outstandingLoanTotal / 36,
            financialProfile.outstandingLoanTotal * 0.035,
          ),
        )
      : null;
  const monthlyObligationEstimate =
    obligationContext.monthlyObligationAmount ??
    (typeof obligationContext.requestedAmount === 'number' &&
    typeof obligationContext.requestedTermMonths === 'number' &&
    obligationContext.requestedTermMonths > 0
      ? Math.round(
          obligationContext.requestedAmount / obligationContext.requestedTermMonths,
        )
      : null);
  const totalCommittedOutgoings =
    baselineExpenses == null && estimatedExistingDebtLoad == null
      ? null
      : (baselineExpenses ?? 0) + (estimatedExistingDebtLoad ?? 0);
  const surplusCashEstimate =
    monthlyIncome == null
      ? null
      : Math.round(
          monthlyIncome -
            (totalCommittedOutgoings ?? 0) -
            (monthlyObligationEstimate ?? 0),
        );

  const incomeStabilityScore = getComponentScore(scoreSnapshot, 'income_reliability');
  const resilienceScore = getComponentScore(scoreSnapshot, 'balance_resilience');
  const cashFlowStabilityScore = getComponentScore(
    scoreSnapshot,
    'cash_flow_stability',
  );
  const spendingDisciplineScore = getComponentScore(
    scoreSnapshot,
    'spending_discipline',
  );
  const obligationConsistencyScore = getComponentScore(
    scoreSnapshot,
    'obligation_consistency',
  );
  const rawVolatilityScore = getComponentScore(
    scoreSnapshot,
    'financial_volatility',
  );
  const surplusScore =
    monthlyIncome == null || surplusCashEstimate == null
      ? null
      : getAffordabilityScoreFromSurplus(surplusCashEstimate, monthlyIncome);
  const behaviouralAffordabilityBase = Math.round(
    ((cashFlowStabilityScore ?? 50) * 0.45) +
      ((spendingDisciplineScore ?? 50) * 0.25) +
      ((resilienceScore ?? 50) * 0.3),
  );
  const affordabilityScore =
    surplusScore == null
      ? behaviouralAffordabilityBase
      : clampScore(
          Math.round(
            behaviouralAffordabilityBase * 0.55 + surplusScore * 0.45,
          ),
        );
  const debtPressureRatio =
    monthlyIncome == null || monthlyIncome <= 0
      ? null
      : ((estimatedExistingDebtLoad ?? 0) + (monthlyObligationEstimate ?? 0)) /
        monthlyIncome;
  const debtPressureIndicator =
    obligationConsistencyScore != null && obligationConsistencyScore < 40
      ? 'High'
      : debtPressureRatio != null && debtPressureRatio >= 0.45
        ? 'High'
        : debtPressureRatio != null && debtPressureRatio >= 0.22
          ? 'Medium'
          : typeof financialProfile?.loanCount === 'number' &&
              financialProfile.loanCount > 2
            ? 'Medium'
            : 'Low';
  const volatilitySignal =
    rawVolatilityScore != null && rawVolatilityScore >= 65
      ? 'Volatile'
      : rawVolatilityScore != null && rawVolatilityScore >= 40
        ? 'Moderate'
        : 'Stable';
  const strengths: string[] = [];
  const riskFactors: string[] = [];

  if (affordabilityScore >= 72) {
    strengths.push('Estimated affordability remains comfortably within range.');
  }
  if ((incomeStabilityScore ?? 0) >= 70) {
    strengths.push('Income patterns appear stable across the observed period.');
  }
  if ((resilienceScore ?? 0) >= 70) {
    strengths.push('Balance behaviour suggests healthy financial headroom.');
  }
  if (scoreSnapshot.confidenceLevel === 'high') {
    strengths.push('Score confidence is high based on the available bank history.');
  }

  if (affordabilityScore < 55) {
    riskFactors.push(
      'Estimated affordability is tight for the proposed obligation.',
    );
  }
  if (debtPressureIndicator === 'High') {
    riskFactors.push('Debt pressure appears elevated relative to income.');
  }
  if (volatilitySignal === 'Volatile') {
    riskFactors.push('Cash-flow patterns are more volatile than ideal.');
  }
  if (scoreSnapshot.confidenceLevel === 'low') {
    riskFactors.push(
      'Score confidence is low and requires cautious interpretation.',
    );
  }
  if (scoreSnapshot.anomalyFlags.some((flag) => flag.severity === 'high')) {
    riskFactors.push('High-severity anomalies were detected in the score evidence.');
  }

  if (strengths.length === 0) {
    strengths.push('Behavioural score evidence is available for review.');
  }
  if (riskFactors.length === 0) {
    riskFactors.push('No material behavioural risks were triggered automatically.');
  }

  return {
    affordabilityScore,
    incomeStabilityScore,
    resilienceScore,
    debtPressureIndicator,
    surplusCashEstimate,
    volatilitySignal,
    strengths: strengths.slice(0, 4),
    riskFactors: riskFactors.slice(0, 4),
    generatedAt: input.generatedAt ?? new Date(),
  };
}

export function getUnderwritingComponentScore(
  scoreSnapshot: UnderwritingScoreSnapshotShape,
  key: string,
) {
  return getComponentScore(scoreSnapshot, key);
}

function getComponentScore(
  scoreSnapshot: UnderwritingScoreSnapshotShape,
  key: string,
) {
  const component = scoreSnapshot.components.find((entry) => entry.key === key);
  return typeof component?.score === 'number' ? component.score : null;
}

function getAffordabilityScoreFromSurplus(
  surplusCashEstimate: number,
  monthlyIncome: number,
) {
  if (monthlyIncome <= 0) {
    return 0;
  }

  const surplusRatio = surplusCashEstimate / monthlyIncome;

  if (surplusRatio >= 0.35) return 92;
  if (surplusRatio >= 0.2) return 78;
  if (surplusRatio >= 0.1) return 64;
  if (surplusRatio >= 0) return 48;
  if (surplusRatio >= -0.1) return 28;
  return 12;
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
