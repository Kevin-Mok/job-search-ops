export const SUPPORTED_JOB_FAMILIES = [
  "swe",
  "web",
  "python",
  "cloud",
  "it-support",
  "call-centre",
  "customer-support",
  "unknown"
] as const;

export type JobFamily = (typeof SUPPORTED_JOB_FAMILIES)[number];

export const REVIEW_STATUSES = [
  "new",
  "shortlisted",
  "needs_review",
  "rejected",
  "duplicate",
  "approved_for_manual_apply",
  "applied_manually"
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type LeadSource = "indeed" | "linkedin";
export type WorkModel = "remote" | "hybrid" | "onsite" | "unknown";
export type Seniority =
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "manager"
  | "unknown";
export type LocationDecision = "accepted" | "rejected" | "needs_review";

export interface EmailFixture {
  messageId: string;
  source: LeadSource;
  receivedAt: string;
  from: string;
  subject: string;
  textBody: string;
}

export interface ParsedLeadInput {
  source: LeadSource;
  sourceMessageId: string;
  sourceItemKey: string;
  sourceFixture: string;
  title: string;
  company: string;
  locationRaw: string;
  workModel: WorkModel;
  officeLocationRaw?: string;
  remoteEligibility?: string;
  seniority: Seniority;
  employmentType?: string;
  compensationText?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  skills: string[];
  canonicalUrl: string;
  normalizedDescription: string;
}

export interface LocationPolicyResult {
  decision: LocationDecision;
  distanceKm?: number;
  locationConfidence: number;
  canadaEligibleRemote: boolean;
  officeLatitude?: number;
  officeLongitude?: number;
}

export interface ResumeVariant {
  id: string;
  lane: "engineering" | "support";
  jobFamilies: JobFamily[];
  skills: string[];
  supportedEvidence: string[];
}

export interface ResumeMatch {
  variantId: string;
  fitScore: number;
  matchReasons: string[];
  missingRequirements: string[];
}

export interface DraftAnswer {
  question: string;
  answer: string;
}

export interface DraftPacket {
  chosenResume: string;
  rationale: string;
  tailoredSummary: string;
  coverLetterDraft: string;
  screenerAnswerDrafts: DraftAnswer[];
  recommendation: string;
}

export interface JobLeadRecord {
  leadId: string;
  duplicateKey: string;
  source: LeadSource;
  sourceMessageId: string;
  sourceItemKey: string;
  sourceFixture: string;
  title: string;
  company: string;
  locationRaw: string;
  workModel: WorkModel;
  officeLocationRaw?: string;
  seniority: Seniority;
  employmentType?: string;
  compensationText?: string;
  compensationMin?: number;
  compensationMax?: number;
  compensationCurrency?: string;
  skills: string[];
  canonicalUrl: string;
  normalizedDescription: string;
  riskFlags: string[];
  locationDecision: LocationDecision;
  locationConfidence: number;
  distanceKm?: number;
  canadaEligibleRemote: boolean;
  officeLatitude?: number;
  officeLongitude?: number;
  jobFamily: JobFamily;
  score: number;
  shortlistReason: string;
  reviewStatus: ReviewStatus;
  resumeMatch: ResumeMatch;
  draftPacket: DraftPacket;
  createdAt: string;
  updatedAt: string;
}

export interface IngestEventRecord {
  eventId: string;
  leadId: string;
  source: LeadSource;
  messageId: string;
  sourceItemKey: string;
  sourceFixture: string;
  ingestedAt: string;
  rawPayload: ParsedLeadInput;
}

export interface ReviewEventRecord {
  eventId: string;
  leadId: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IngestSummary {
  fixturesProcessed: number;
  leadCandidates: number;
  created: number;
  updated: number;
  duplicatesMerged: number;
  leads: JobLeadRecord[];
}

export interface ReviewThreadProjection {
  leadId: string;
  statusChannel: string;
  threadKey: string;
  threadTitle: string;
  feedSummary: string;
  starterMessage: string;
  commands: string[];
}

export interface ReviewBoardProjection {
  shortlistFeed: string[];
  threads: ReviewThreadProjection[];
}
