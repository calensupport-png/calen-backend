import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UnderwritingCaseDocument = HydratedDocument<UnderwritingCase>;

@Schema({ _id: false, versionKey: false })
class UnderwritingTrustEndorsement {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, trim: true })
  source: string;

  @Prop({ required: true, trim: true })
  status: 'Verified' | 'Pending';

  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ required: true })
  strength: number;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingScoreComponent {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  weight: number;

  @Prop({ type: Object, default: {} })
  metrics: Record<string, number | null>;

  @Prop({ type: [String], default: [] })
  reasons: string[];
}

@Schema({ _id: false, versionKey: false })
class UnderwritingAnomalyFlag {
  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  severity: string;

  @Prop({ type: String, trim: true, default: null })
  detail?: string;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingApplicantSummary {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  verified: boolean;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ type: String, trim: true, default: null })
  employerName?: string | null;

  @Prop({ type: String, trim: true, default: null })
  jobTitle?: string | null;

  @Prop({ type: Number, default: null })
  monthlyIncome?: number | null;

  @Prop({ required: true })
  connectedBanks: number;

  @Prop({ required: true })
  endorsedTrustContacts: number;

  @Prop({ type: [UnderwritingTrustEndorsement], default: [] })
  trustEndorsements: UnderwritingTrustEndorsement[];
}

@Schema({ _id: false, versionKey: false })
class UnderwritingScoreSnapshot {
  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop({ type: Number, default: null })
  composite?: number | null;

  @Prop({ type: String, trim: true, default: null })
  band?: string | null;

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({ type: String, trim: true, default: null })
  engineVersion?: string | null;

  @Prop({ type: String, trim: true, default: null })
  confidenceLevel?: string | null;

  @Prop({ type: Number, default: null })
  confidenceScore?: number | null;

  @Prop({ type: [String], default: [] })
  explanations: string[];

  @Prop({ type: [String], default: [] })
  reasonCodes: string[];

  @Prop({ type: [UnderwritingAnomalyFlag], default: [] })
  anomalyFlags: UnderwritingAnomalyFlag[];

  @Prop({ type: [UnderwritingScoreComponent], default: [] })
  components: UnderwritingScoreComponent[];

  @Prop({ type: Date, default: null })
  generatedAt?: Date | null;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingDecisionRuleMatch {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true, trim: true })
  field: string;

  @Prop({ required: true, trim: true })
  operator: string;

  @Prop({ required: true, trim: true })
  value: string;

  @Prop({ required: true, trim: true })
  action: string;

  @Prop({ required: true, trim: true })
  trigger: string;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingPolicySnapshot {
  @Prop({ type: Number, default: null })
  minimumScore?: number | null;

  @Prop({ type: Number, default: null })
  maxExposureAmount?: number | null;

  @Prop({ required: true, trim: true, default: 'manual_review' })
  defaultDecisionMode: string;

  @Prop({ type: [String], default: [] })
  triggeredRules: string[];

  @Prop({ type: [UnderwritingDecisionRuleMatch], default: [] })
  decisionRules: UnderwritingDecisionRuleMatch[];
}

@Schema({ _id: false, versionKey: false })
class UnderwritingObligationContext {
  @Prop({ type: Number, default: null })
  requestedAmount?: number | null;

  @Prop({ type: Number, default: null })
  requestedTermMonths?: number | null;

  @Prop({ type: Number, default: null })
  monthlyObligationAmount?: number | null;

  @Prop({ type: String, trim: true, default: null })
  productCategory?: string | null;

  @Prop({ type: String, trim: true, default: null })
  decisionPurpose?: string | null;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingAssessment {
  @Prop({ type: Number, default: null })
  affordabilityScore?: number | null;

  @Prop({ type: Number, default: null })
  incomeStabilityScore?: number | null;

  @Prop({ type: Number, default: null })
  resilienceScore?: number | null;

  @Prop({ required: true, trim: true, default: 'Medium' })
  debtPressureIndicator: 'Low' | 'Medium' | 'High';

  @Prop({ type: Number, default: null })
  surplusCashEstimate?: number | null;

  @Prop({ required: true, trim: true, default: 'Moderate' })
  volatilitySignal: 'Stable' | 'Moderate' | 'Volatile';

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  riskFactors: string[];

  @Prop({ type: Date, default: Date.now })
  generatedAt: Date;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingRecommendation {
  @Prop({ required: true, trim: true })
  outcome: 'approve' | 'approve_with_conditions' | 'review' | 'decline';

  @Prop({ type: String, trim: true, default: null })
  summary?: string | null;

  @Prop({ type: [String], default: [] })
  reasons: string[];

  @Prop({ type: [String], default: [] })
  triggeredPolicies: string[];

  @Prop({ type: [String], default: [] })
  policyTriggers: string[];

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  riskFactors: string[];

  @Prop({ type: [String], default: [] })
  manualReviewReasons: string[];

  @Prop({ type: [String], default: [] })
  conditions: string[];

  @Prop({ required: true, trim: true, default: 'manual_review' })
  decisionMode: string;

  @Prop({ type: Date, default: Date.now })
  generatedAt: Date;
}

@Schema({ _id: false, versionKey: false })
class UnderwritingTimelineEvent {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, trim: true, default: null })
  detail?: string | null;

  @Prop({ type: String, trim: true, default: null })
  actorId?: string | null;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

@Schema({
  collection: 'underwriting_cases',
  timestamps: true,
  versionKey: false,
})
export class UnderwritingCase {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  subjectUserId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
  })
  createdByUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  caseId: string;

  @Prop({ required: true, trim: true, index: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  applicantName: string;

  @Prop({ required: true, trim: true, default: 'General Review' })
  productType: string;

  @Prop({ type: Number, default: null })
  requestedAmount?: number | null;

  @Prop({ required: true, trim: true, default: 'new' })
  stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected';

  @Prop({ required: true, trim: true })
  riskLevel: 'Low' | 'Moderate' | 'High';

  @Prop({ type: String, trim: true, default: '' })
  notes: string;

  @Prop({ type: UnderwritingApplicantSummary, required: true })
  applicantSummary: UnderwritingApplicantSummary;

  @Prop({ type: UnderwritingScoreSnapshot, required: true })
  scoreSnapshot: UnderwritingScoreSnapshot;

  @Prop({ type: UnderwritingPolicySnapshot, required: true })
  policySnapshot: UnderwritingPolicySnapshot;

  @Prop({ type: UnderwritingObligationContext, required: true })
  obligationContext: UnderwritingObligationContext;

  @Prop({ type: UnderwritingAssessment, required: true })
  underwritingAssessment: UnderwritingAssessment;

  @Prop({ type: UnderwritingRecommendation, required: true })
  recommendation: UnderwritingRecommendation;

  @Prop({ type: [UnderwritingTimelineEvent], default: [] })
  timeline: UnderwritingTimelineEvent[];

  createdAt?: Date;

  updatedAt?: Date;
}

export const UnderwritingCaseSchema =
  SchemaFactory.createForClass(UnderwritingCase);

UnderwritingCaseSchema.index({ organizationId: 1, caseId: 1 }, { unique: true });
UnderwritingCaseSchema.index({ organizationId: 1, calenId: 1, createdAt: -1 });
