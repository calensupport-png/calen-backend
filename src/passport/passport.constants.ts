export const PASSPORT_PURPOSES = [
  'underwriting_review',
  'tenant_screening_review',
  'employment_verification',
  'compliance_review',
  'portfolio_monitoring_review',
  'partner_due_diligence',
] as const;

export type PassportPurpose = (typeof PASSPORT_PURPOSES)[number];
