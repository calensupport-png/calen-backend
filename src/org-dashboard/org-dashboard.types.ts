export type WorkspaceStage =
  | 'new'
  | 'review'
  | 'analysis'
  | 'approved'
  | 'rejected';

export type WorkspaceApplicant = {
  id: string;
  calenId: string;
  name: string;
  score: number;
  annualIncome: number;
  income: number;
  savings: number;
  debt: number;
  trust: number;
  location: string;
  industry: string;
  verified: boolean;
  product: string;
  stage: WorkspaceStage;
  riskLevel: 'Low' | 'Moderate' | 'High';
  trustEndorsements: Array<{
    type: string;
    source: string;
    status: 'Verified' | 'Pending';
    date: string;
    strength: number;
  }>;
  scoreFactors: Array<{
    subject: string;
    value: number;
  }>;
  indicators: Array<{
    label: string;
    value: number;
    status: 'excellent' | 'good' | 'watch';
  }>;
  createdAt?: Date;
  updatedAt?: Date;
};

export type WorkspaceDecisionRule = {
  id: number;
  field: string;
  operator: string;
  value: string;
  action: string;
};

export type WorkspaceLendingOffer = {
  id: string;
  name: string;
  type: string;
  amountRange: string;
  apr: string;
  minScore: number;
  applicants: number;
  views: number;
  status: 'Active' | 'Paused';
};

export type WorkspaceApiKey = {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: 'Active' | 'Revoked';
};

export type OrgWorkspaceData = {
  applicants: WorkspaceApplicant[];
  decisionRules: WorkspaceDecisionRule[];
  lendingOffers: WorkspaceLendingOffer[];
  apiKeys: WorkspaceApiKey[];
  riskNotesByApplicant: Record<string, string>;
};
