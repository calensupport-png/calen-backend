import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScoreSnapshot,
  ScoreSnapshotDocument,
} from '../dashboard/schemas/score-snapshot.schema';
import {
  BankConnection,
  BankConnectionDocument,
} from '../onboarding/schemas/bank-connection.schema';
import { ScoreRun, ScoreRunDocument } from './schemas/score-run.schema';

const ENGINE_PROVIDER = 'calen-v1';
const ENGINE_VERSION = 'v1.phase1';
const ACTIVE_BANK_CONNECTION_FILTER = {
  provider: { $ne: 'mock-open-banking' },
  status: 'connected',
} as const;

type CanonicalTransaction = {
  bookedAt: Date;
  amount: number;
  description: string;
  runningBalance: number | null;
  status: string | null;
};

type ScorePayload = {
  score: number | null;
  composite: number | null;
  status: string;
  bandKey: string | null;
  orgLabel: string | null;
  userLabel: string | null;
  confidence: {
    score: number;
    level: string;
  };
  reasonCodes: string[];
  explanationSummary: string[];
  anomalyFlags: Array<{
    code: string;
    severity: string;
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
};

@Injectable()
export class ScoresService {
  constructor(
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
    @InjectModel(ScoreRun.name)
    private readonly scoreRunModel: Model<ScoreRunDocument>,
    @InjectModel(ScoreSnapshot.name)
    private readonly scoreSnapshotModel: Model<ScoreSnapshotDocument>,
  ) {}

  async generateScore(userId: string, generatedAt = new Date()) {
    const userObjectId = this.toObjectId(userId);
    const bankConnections = await this.bankConnectionModel
      .find({
        userId: userObjectId,
        ...ACTIVE_BANK_CONNECTION_FILTER,
      })
      .sort({ createdAt: -1 });

    if (bankConnections.length === 0) {
      throw new BadRequestException({
        code: 'BANK_DATA_REQUIRED',
        message:
          'Connect at least one active bank account before generating a score.',
      });
    }

    const payload = this.buildScorePayload(bankConnections);
    const scoreRun = await this.scoreRunModel.create({
      userId: userObjectId,
      score: payload.score,
      composite: payload.composite,
      status: payload.status,
      bandKey: payload.bandKey,
      orgLabel: payload.orgLabel,
      userLabel: payload.userLabel,
      confidence: payload.confidence,
      engineVersion: ENGINE_VERSION,
      provider: ENGINE_PROVIDER,
      reasonCodes: payload.reasonCodes,
      explanationSummary: payload.explanationSummary,
      anomalyFlags: payload.anomalyFlags,
      inputWindow: payload.inputWindow,
      components: payload.components,
      sourceConnectionIds: bankConnections.map((connection) =>
        this.toObjectId(String(connection._id)),
      ),
      generatedAt,
    });

    await this.scoreSnapshotModel.create({
      userId: userObjectId,
      score: payload.score,
      band: payload.bandKey,
      factors: payload.explanationSummary,
      status: payload.status,
      provider: ENGINE_PROVIDER,
      confidenceLevel: payload.confidence.level,
      scoreRunId: String(scoreRun._id),
      generatedAt,
    });

    return this.serializeScoreRun(scoreRun);
  }

  async getLatestScore(userId: string) {
    const userObjectId = this.toObjectId(userId);
    const latestScore = await this.scoreRunModel
      .findOne({ userId: userObjectId })
      .sort({ generatedAt: -1 });

    return latestScore ? this.serializeScoreRun(latestScore) : null;
  }

  async getScoreHistory(userId: string) {
    const userObjectId = this.toObjectId(userId);
    const history = await this.scoreRunModel
      .find({ userId: userObjectId })
      .sort({ generatedAt: -1 });

    return history.map((entry) => this.serializeScoreRun(entry));
  }

  private buildScorePayload(
    bankConnections: BankConnectionDocument[],
  ): ScorePayload {
    const transactions: CanonicalTransaction[] = bankConnections
      .flatMap((connection) => this.readTransactions(connection))
      .sort((left, right) => left.bookedAt.getTime() - right.bookedAt.getTime());
    const balanceValues = bankConnections.flatMap((connection) =>
      this.readBalanceValues(connection),
    );
    const recurringCommitmentCount = bankConnections.reduce(
      (sum, connection) => sum + this.readRecurringCommitmentCount(connection),
      0,
    );
    const failedPaymentCount = bankConnections.reduce(
      (sum, connection) => sum + this.readFailedPaymentCount(connection),
      0,
    );
    const anomalyFlags = this.detectAnomalies(transactions);
    const inputWindow = this.buildInputWindow(transactions, bankConnections.length);
    const confidence = this.buildConfidence({
      observedDays: inputWindow.observedDays,
      observedMonths: inputWindow.observedMonths,
      transactionCount: inputWindow.transactionCount,
      connectionCount: inputWindow.connectionCount,
      hasBalanceSignals: balanceValues.length > 0,
    });

    const hasMinimumWindow =
      inputWindow.observedDays >= 90 || inputWindow.observedMonths >= 3;

    if (!hasMinimumWindow || inputWindow.transactionCount < 50) {
      const explanations = [
        'More bank history is needed before CALEN can produce a reliable score.',
        `We currently see ${inputWindow.transactionCount} transactions across ${inputWindow.observedMonths} observed month${inputWindow.observedMonths === 1 ? '' : 's'}.`,
      ];

      return {
        score: null,
        composite: null,
        status: 'insufficient_data',
        bandKey: null,
        orgLabel: null,
        userLabel: null,
        confidence,
        reasonCodes: ['insufficient_transaction_history'],
        explanationSummary: explanations,
        anomalyFlags,
        inputWindow,
        components: [],
      };
    }

    const monthMap = new Map<
      string,
      {
        inflow: number;
        outflow: number;
        net: number;
        incomeLikeCredits: number;
        lowBalanceEvents: number;
        largeOutflowEvents: number;
      }
    >();
    const allCredits = transactions.filter((transaction) => transaction.amount > 0);
    const salaryLikeCredits = allCredits.filter((transaction) =>
      /(salary|payroll|wage|paye|allowance|stipend)/i.test(
        transaction.description,
      ),
    );

    for (const transaction of transactions) {
      const monthKey = transaction.bookedAt.toISOString().slice(0, 7);
      const existing = monthMap.get(monthKey) ?? {
        inflow: 0,
        outflow: 0,
        net: 0,
        incomeLikeCredits: 0,
        lowBalanceEvents: 0,
        largeOutflowEvents: 0,
      };

      if (transaction.amount > 0) {
        existing.inflow += transaction.amount;
      } else {
        existing.outflow += Math.abs(transaction.amount);
      }

      existing.net += transaction.amount;

      if (
        transaction.amount > 0 &&
        /(salary|payroll|wage|paye|allowance|stipend)/i.test(
          transaction.description,
        )
      ) {
        existing.incomeLikeCredits += 1;
      }

      if (
        transaction.runningBalance != null &&
        transaction.runningBalance <= 100
      ) {
        existing.lowBalanceEvents += 1;
      }

      if (transaction.amount < 0 && Math.abs(transaction.amount) >= 500) {
        existing.largeOutflowEvents += 1;
      }

      monthMap.set(monthKey, existing);
    }

    const monthlyRows = Array.from(monthMap.values());
    const monthlyInflows = monthlyRows.map((row) => row.inflow);
    const monthlyOutflows = monthlyRows.map((row) => row.outflow);
    const monthlyNets = monthlyRows.map((row) => row.net);
    const monthsWithIncome = monthlyRows.filter((row) => row.inflow > 0).length;
    const positiveNetMonths = monthlyRows.filter((row) => row.net >= 0).length;
    const lowBalanceEvents = monthlyRows.reduce(
      (sum, row) => sum + row.lowBalanceEvents,
      0,
    );
    const largeOutflowEvents = monthlyRows.reduce(
      (sum, row) => sum + row.largeOutflowEvents,
      0,
    );
    const averageBalance =
      balanceValues.length > 0
        ? balanceValues.reduce((sum, value) => sum + value, 0) /
          balanceValues.length
        : null;
    const averageMonthlyInflow = this.average(monthlyInflows);
    const averageMonthlyOutflow = this.average(monthlyOutflows);
    const averageMonthlyNet = this.average(monthlyNets);
    const inflowVariation = this.coefficientOfVariation(monthlyInflows);
    const outflowVariation = this.coefficientOfVariation(monthlyOutflows);
    const netVariation = this.coefficientOfVariation(
      monthlyNets.map((value) => Math.abs(value)),
    );
    const outflowCoverageRatio =
      averageMonthlyInflow > 0 ? averageMonthlyOutflow / averageMonthlyInflow : 1.5;
    const balanceCoverageRatio =
      averageMonthlyOutflow > 0 && averageBalance != null
        ? averageBalance / averageMonthlyOutflow
        : 0;

    const components: ScorePayload['components'] = [
      {
        key: 'income_reliability',
        label: 'Income Reliability',
        weight: 0.25,
        metrics: {
          income_month_coverage:
            inputWindow.observedMonths > 0
              ? monthsWithIncome / inputWindow.observedMonths
              : 0,
          income_variation: inflowVariation,
          salary_like_credits: salaryLikeCredits.length,
        },
        score: this.clampScore(
          45 * (monthsWithIncome / Math.max(inputWindow.observedMonths, 1)) +
            35 * (1 - Math.min(inflowVariation, 1)) +
            20 *
              Math.min(
                1,
                salaryLikeCredits.length / Math.max(inputWindow.observedMonths, 1),
              ),
        ),
        reasons: [
          monthsWithIncome >= Math.max(3, inputWindow.observedMonths - 1)
            ? 'Income-like inflows appear across most observed months.'
            : 'Income patterns are present but not yet consistent month to month.',
        ],
      },
      {
        key: 'cash_flow_stability',
        label: 'Cash Flow Stability',
        weight: 0.2,
        metrics: {
          positive_net_month_ratio:
            positiveNetMonths / Math.max(inputWindow.observedMonths, 1),
          outflow_to_inflow_ratio: outflowCoverageRatio,
          net_variation: netVariation,
        },
        score: this.clampScore(
          45 * (positiveNetMonths / Math.max(inputWindow.observedMonths, 1)) +
            30 * (1 - Math.min(Math.abs(1 - outflowCoverageRatio), 1)) +
            25 * (1 - Math.min(netVariation, 1)),
        ),
        reasons: [
          positiveNetMonths >= Math.ceil(inputWindow.observedMonths / 2)
            ? 'Cash inflows and outflows look broadly sustainable over time.'
            : 'Cash flow shows recurring periods of compression.',
        ],
      },
      {
        key: 'balance_resilience',
        label: 'Balance Resilience',
        weight: 0.2,
        metrics: {
          average_balance: averageBalance,
          balance_coverage_ratio: balanceCoverageRatio,
          low_balance_events: lowBalanceEvents,
        },
        score: this.clampScore(
          45 * Math.min(Math.max(balanceCoverageRatio, 0), 1) +
            35 *
              (1 -
                Math.min(
                  lowBalanceEvents / Math.max(inputWindow.transactionCount, 1) / 0.2,
                  1,
                )) +
            20 * (averageBalance != null && averageBalance > 0 ? 1 : 0.35),
        ),
        reasons: [
          lowBalanceEvents === 0
            ? 'Balances show healthy breathing room across the observed window.'
            : 'Low-balance events were detected in the observed account history.',
        ],
      },
      {
        key: 'obligation_consistency',
        label: 'Obligation Consistency',
        weight: 0.15,
        metrics: {
          recurring_commitment_count: recurringCommitmentCount,
          failed_payment_count: failedPaymentCount,
        },
        score:
          recurringCommitmentCount === 0
            ? 55
            : this.clampScore(
                65 +
                  Math.min(recurringCommitmentCount * 4, 20) -
                  Math.min(failedPaymentCount * 12, 45),
              ),
        reasons: [
          recurringCommitmentCount > 0
            ? 'Recurring commitments are visible in the connected bank data.'
            : 'Recurring commitments are not yet clearly visible in the connected data.',
        ],
      },
      {
        key: 'spending_discipline',
        label: 'Spending Discipline',
        weight: 0.1,
        metrics: {
          outflow_to_inflow_ratio: outflowCoverageRatio,
          large_outflow_events: largeOutflowEvents,
          average_monthly_net: averageMonthlyNet,
        },
        score: this.clampScore(
          50 * (1 - Math.min(Math.max(outflowCoverageRatio - 0.75, 0), 1)) +
            25 *
              (1 -
                Math.min(
                  largeOutflowEvents / Math.max(inputWindow.observedMonths, 1) / 3,
                  1,
                )) +
            25 * (averageMonthlyNet >= 0 ? 1 : 0.4),
        ),
        reasons: [
          averageMonthlyNet >= 0
            ? 'Outflows remain broadly proportional to inflows.'
            : 'Outflows appear to pressure available income in multiple months.',
        ],
      },
      {
        key: 'financial_volatility',
        label: 'Financial Volatility',
        weight: 0.1,
        metrics: {
          inflow_variation: inflowVariation,
          outflow_variation: outflowVariation,
          net_variation: netVariation,
        },
        score: this.clampScore(
          40 * Math.min(inflowVariation, 1) +
            35 * Math.min(outflowVariation, 1) +
            25 * Math.min(netVariation, 1),
        ),
        reasons: [
          Math.max(inflowVariation, outflowVariation, netVariation) < 0.45
            ? 'Month-to-month financial activity appears relatively stable.'
            : 'Month-to-month financial activity is more turbulent than ideal.',
        ],
      },
    ];

    const financialVolatility = components[5]?.score ?? 50;
    const composite = this.roundComposite(
      components[0].score * 0.25 +
        components[1].score * 0.2 +
        components[2].score * 0.2 +
        components[3].score * 0.15 +
        components[4].score * 0.1 +
        (100 - financialVolatility) * 0.1,
    );
    const score = this.clampScore(Math.round(300 + composite * 6), 300, 900);
    const band = this.resolveBand(score);
    const reasons = this.buildReasonCodes({
      monthsWithIncome,
      observedMonths: inputWindow.observedMonths,
      lowBalanceEvents,
      positiveNetMonths,
      recurringCommitmentCount,
      inflowVariation,
      anomalyFlags,
    });

    return {
      score,
      composite,
      status:
        confidence.level === 'low' || anomalyFlags.some((flag) => flag.severity === 'high')
          ? 'flagged_for_review'
          : 'ready',
      bandKey: band.bandKey,
      orgLabel: band.orgLabel,
      userLabel: band.userLabel,
      confidence,
      reasonCodes: reasons.codes,
      explanationSummary: reasons.explanations,
      anomalyFlags,
      inputWindow,
      components: components.map((component) => ({
        key: component.key,
        label: component.label,
        score: component.score,
        weight: component.weight,
        metrics: component.metrics,
        reasons: component.reasons,
      })),
    };
  }

  private buildReasonCodes(input: {
    monthsWithIncome: number;
    observedMonths: number;
    lowBalanceEvents: number;
    positiveNetMonths: number;
    recurringCommitmentCount: number;
    inflowVariation: number;
    anomalyFlags: Array<{ code: string; severity: string; detail?: string }>;
  }) {
    const codes: string[] = [];
    const explanations: string[] = [];

    if (input.monthsWithIncome >= Math.max(3, input.observedMonths - 1)) {
      codes.push('income_consistency_strong');
      explanations.push(
        'Income patterns have been consistent across most observed months.',
      );
    } else {
      codes.push('income_pattern_unstable');
      explanations.push(
        'Income patterns are still uneven across the observed months.',
      );
    }

    if (input.lowBalanceEvents === 0) {
      codes.push('healthy_balance_buffer');
      explanations.push(
        'Balances stayed away from persistent low-balance stress points.',
      );
    } else {
      codes.push('frequent_low_balance_events');
      explanations.push(
        'Low-balance events appear in the transaction history and reduce resilience.',
      );
    }

    if (input.recurringCommitmentCount > 0) {
      codes.push('recurring_commitments_visible');
      explanations.push(
        'Recurring commitments are visible in the connected bank data.',
      );
    }

    if (input.positiveNetMonths < Math.ceil(input.observedMonths / 2)) {
      codes.push('cashflow_pattern_unstable');
      explanations.push(
        'Several observed months show tighter outflow pressure than we would like.',
      );
    }

    if (input.inflowVariation > 0.75) {
      codes.push('high_cashflow_turbulence');
      explanations.push(
        'Month-to-month inflows are more volatile than ideal for a high-confidence score.',
      );
    }

    if (input.anomalyFlags.length > 0) {
      codes.push('review_signals_detected');
      explanations.push(
        'Some transaction patterns need closer review before the score can be treated as fully settled.',
      );
    }

    return {
      codes: codes.slice(0, 5),
      explanations: explanations.slice(0, 3),
    };
  }

  private buildInputWindow(
    transactions: CanonicalTransaction[],
    connectionCount: number,
  ) {
    if (transactions.length === 0) {
      return {
        startDate: null,
        endDate: null,
        observedDays: 0,
        observedMonths: 0,
        transactionCount: 0,
        connectionCount,
      };
    }

    const startDate = transactions[0].bookedAt;
    const endDate = transactions[transactions.length - 1].bookedAt;
    const observedDays = Math.max(
      1,
      Math.round(
        (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    const observedMonths = new Set(
      transactions.map((transaction) => transaction.bookedAt.toISOString().slice(0, 7)),
    ).size;

    return {
      startDate,
      endDate,
      observedDays,
      observedMonths,
      transactionCount: transactions.length,
      connectionCount,
    };
  }

  private buildConfidence(input: {
    observedDays: number;
    observedMonths: number;
    transactionCount: number;
    connectionCount: number;
    hasBalanceSignals: boolean;
  }) {
    const score = Math.round(
      this.clampScore(
        Math.min(input.observedDays / 180, 1) * 35 +
          Math.min(input.transactionCount / 250, 1) * 30 +
          Math.min(input.observedMonths / 6, 1) * 20 +
          Math.min(input.connectionCount / 2, 1) * 10 +
          (input.hasBalanceSignals ? 5 : 0),
      ),
    );

    if (score >= 70) {
      return { score, level: 'high' };
    }
    if (score >= 40) {
      return { score, level: 'moderate' };
    }

    return { score, level: 'low' };
  }

  private detectAnomalies(transactions: CanonicalTransaction[]) {
    if (transactions.length === 0) {
      return [];
    }

    const credits = transactions.filter((transaction) => transaction.amount > 0);
    const averageCredit = this.average(credits.map((transaction) => transaction.amount));
    const lastTransaction = transactions[transactions.length - 1];
    const flags: Array<{ code: string; severity: string; detail?: string }> = [];

    if (
      averageCredit > 0 &&
      credits.some(
        (transaction) =>
          transaction.amount >= averageCredit * 4 &&
          lastTransaction.bookedAt.getTime() - transaction.bookedAt.getTime() <=
            10 * 24 * 60 * 60 * 1000,
      )
    ) {
      flags.push({
        code: 'recent_atypical_inflow',
        severity: 'medium',
        detail: 'A large credit appeared close to the latest observed activity.',
      });
    }

    const repeatedRoundedCredits = new Map<number, number>();
    for (const credit of credits) {
      const rounded = Math.round(credit.amount);
      repeatedRoundedCredits.set(
        rounded,
        (repeatedRoundedCredits.get(rounded) ?? 0) + 1,
      );
    }

    if (
      Array.from(repeatedRoundedCredits.values()).some((count) => count >= 4) &&
      credits.length >= 8
    ) {
      flags.push({
        code: 'clustered_credit_pattern',
        severity: 'low',
        detail: 'Several credits repeat in near-identical amounts.',
      });
    }

    return flags;
  }

  private readTransactions(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};
    const transactions: CanonicalTransaction[] = [];

    for (const entry of this.readRecordArray(snapshot.transactions)) {
      const bookedAtValue =
        this.readString(entry.timestamp) ??
        this.readString(entry.booking_date) ??
        this.readString(entry.update_timestamp);
      const bookedAt = bookedAtValue ? new Date(bookedAtValue) : null;
      const amount = this.readNumber(entry.amount);

      if (!bookedAt || Number.isNaN(bookedAt.getTime()) || amount == null) {
        continue;
      }

      transactions.push({
        bookedAt,
        amount,
        description:
          this.readString(entry.description) ??
          this.readString(entry.merchant_name) ??
          'Transaction',
        runningBalance:
          this.readNumber(this.readRecord(entry.running_balance)?.amount) ??
          this.readNumber(entry.running_balance) ??
          null,
        status: this.readString(entry.status) ?? null,
      });
    }

    return transactions;
  }

  private readBalanceValues(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};

    return this.readRecordArray(snapshot.balances)
      .flatMap((entry) => [
        this.readNumber(entry.current),
        this.readNumber(entry.available),
        this.readNumber(entry.last_statement_balance),
      ])
      .filter((value): value is number => value != null);
  }

  private readRecurringCommitmentCount(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};

    return (
      this.readRecordArray(snapshot.directDebits).length +
      this.readRecordArray(snapshot.standingOrders).length
    );
  }

  private readFailedPaymentCount(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};
    const directDebits = this.readRecordArray(snapshot.directDebits);
    const standingOrders = this.readRecordArray(snapshot.standingOrders);
    const failedDirectDebits = directDebits.filter((entry) =>
      /(failed|cancelled|rejected|returned)/i.test(
        this.readString(entry.status) ?? '',
      ),
    ).length;
    const failedStandingOrders = standingOrders.filter((entry) =>
      /(failed|cancelled|rejected|returned)/i.test(
        this.readString(entry.status) ?? '',
      ),
    ).length;

    return failedDirectDebits + failedStandingOrders;
  }

  private resolveBand(score: number) {
    if (score >= 800) {
      return {
        bandKey: 'excellent',
        orgLabel: 'Excellent',
        userLabel: 'Highly Reliable',
      };
    }
    if (score >= 700) {
      return {
        bandKey: 'strong',
        orgLabel: 'Strong',
        userLabel: 'Reliable',
      };
    }
    if (score >= 600) {
      return {
        bandKey: 'fair',
        orgLabel: 'Fair',
        userLabel: 'Developing',
      };
    }
    if (score >= 500) {
      return {
        bandKey: 'weak',
        orgLabel: 'Weak',
        userLabel: 'Less Stable',
      };
    }

    return {
      bandKey: 'high_risk',
      orgLabel: 'High Risk',
      userLabel: 'Needs Attention',
    };
  }

  private serializeScoreRun(scoreRun: ScoreRunDocument) {
    return {
      id: String(scoreRun._id),
      score: scoreRun.score ?? null,
      composite: scoreRun.composite ?? null,
      band: scoreRun.bandKey ?? 'unavailable',
      bandKey: scoreRun.bandKey ?? null,
      orgLabel: scoreRun.orgLabel ?? null,
      userLabel: scoreRun.userLabel ?? null,
      status: scoreRun.status,
      provider: scoreRun.provider,
      engineVersion: scoreRun.engineVersion,
      confidence: scoreRun.confidence ?? { score: 0, level: 'low' },
      reasonCodes: Array.isArray(scoreRun.reasonCodes) ? scoreRun.reasonCodes : [],
      explanations: Array.isArray(scoreRun.explanationSummary)
        ? scoreRun.explanationSummary
        : [],
      factors: Array.isArray(scoreRun.explanationSummary)
        ? scoreRun.explanationSummary
        : [],
      anomalyFlags: Array.isArray(scoreRun.anomalyFlags)
        ? scoreRun.anomalyFlags
        : [],
      components: Array.isArray(scoreRun.components) ? scoreRun.components : [],
      inputWindow: scoreRun.inputWindow ?? null,
      generatedAt: scoreRun.generatedAt,
    };
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private coefficientOfVariation(values: number[]) {
    const normalized = values.filter((value) => Number.isFinite(value));
    if (normalized.length < 2) {
      return 0;
    }

    const mean = this.average(normalized);
    if (mean === 0) {
      return 1;
    }

    const variance =
      normalized.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      normalized.length;

    return Math.sqrt(variance) / Math.abs(mean);
  }

  private roundComposite(value: number) {
    return Math.round(value * 10) / 10;
  }

  private clampScore(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  private readRecord(value: unknown) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readRecordArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null && !Array.isArray(entry),
        )
      : [];
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value))
        ? Number(value)
        : undefined;
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
