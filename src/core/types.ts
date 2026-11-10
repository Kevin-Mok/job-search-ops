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
  touchedLeadIds: string[];
  leads: JobLeadRecord[];
}

export interface IndeedAlertConfig {
  id: string;
  label: string;
  searchUrl: string;
  discordTarget: string;
  enabled: boolean;
  maxPages: number;
  browserProfile?: string;
  pageTimeoutMs?: number;
  challengeTimeoutMs?: number;
  auth?: IndeedPassAuthConfig;
}

export interface IndeedAlertsConfig {
  alerts: IndeedAlertConfig[];
}

export interface IndeedPassAuthConfig {
  mode: "pass";
  usernameEntry: string;
  passwordEntry: string;
}

export interface IndeedAuthCredentials {
  username: string;
  password: string;
}

export interface XNewsTopicConfig {
  id: string;
  label: string;
  keywords: string[];
  preferredHandles: string[];
}

export interface XNewsDiscoveryConfig {
  autoAdd: boolean;
  maxNewAccountsPerRun: number;
  minDiscoveryScore: number;
}

export interface XNewsListConfig {
  id: string;
  label: string;
  seedHandle: string;
  discordTarget: string;
  enabled: boolean;
  browserProfile: string;
  pollEveryMinutes: number;
  maxTrackedAccounts: number;
  maxPostsPerAccount: number;
  bootstrapHandles: string[];
  pageTimeoutMs: number;
  challengeTimeoutMs: number;
  topics: XNewsTopicConfig[];
  discovery: XNewsDiscoveryConfig;
}

export interface XNewsConfig {
  lists: XNewsListConfig[];
}

export interface XFollowingAccountSnapshot {
  handle: string;
  displayName: string;
  profileUrl: string;
  bio?: string;
  verified: boolean;
}

export interface XTimelinePostSnapshot {
  postId: string;
  authorHandle: string;
  authorDisplayName: string;
  authorProfileUrl: string;
  postUrl: string;
  postedAt: string;
  text: string;
  normalizedText: string;
  quoteHandles: string[];
  replyHandles: string[];
  mentionHandles: string[];
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount?: number;
  verified: boolean;
}

export type XNewsTrackedAccountSource = "seed_following" | "bootstrap" | "discovery";

export interface XNewsTrackedAccountRecord {
  accountId: string;
  listId: string;
  handle: string;
  displayName: string;
  profileUrl: string;
  bio?: string;
  verified: boolean;
  source: XNewsTrackedAccountSource;
  discoveryScore?: number;
  topicIds: string[];
  authorQualityScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastFetchedAt?: string;
}

export interface XNewsPostRecord {
  postId: string;
  listId: string;
  authorHandle: string;
  authorDisplayName: string;
  authorProfileUrl: string;
  postUrl: string;
  postedAt: string;
  text: string;
  normalizedText: string;
  quoteHandles: string[];
  replyHandles: string[];
  mentionHandles: string[];
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount?: number;
  matchedTopicIds: string[];
  topicRelevanceScore: number;
  authorQualityScore: number;
  engagementScore: number;
  freshnessScore: number;
  score: number;
  ingestedAt: string;
  updatedAt: string;
}

export interface XNewsSyncRunRecord {
  runId: string;
  listId: string;
  status: SyncRunStatus;
  startedAt: string;
  completedAt?: string;
  seedAccountsSeen: number;
  trackedAccountsCrawled: number;
  postsSeen: number;
  postsStored: number;
  accountsAdded: number;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  errorMessage?: string;
}

export interface XNewsDeliveryRecord {
  deliveryId: string;
  listId: string;
  target: string;
  postId: string;
  syncRunId: string;
  deliveredAt: string;
  externalMessageId?: string;
}

export interface XNewsCandidateDiscovery {
  handle: string;
  topicIds: string[];
  sourceHandles: string[];
  postIds: string[];
  topicRelevanceScore: number;
  networkScore: number;
  authorQualityScore: number;
  discoveryScore: number;
}

export interface XNewsSyncSummary {
  runId: string;
  listId: string;
  status: SyncRunStatus;
  seedAccountsSeen: number;
  trackedAccountsCrawled: number;
  postsSeen: number;
  postsStored: number;
  accountsAdded: number;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  deliveredPostIds: string[];
  addedHandles: string[];
  partialErrors: string[];
}

export interface XNewsBriefItem {
  postId: string;
  authorHandle: string;
  authorDisplayName: string;
  postUrl: string;
  postedAt: string;
  text: string;
  matchedTopicIds: string[];
  score: number;
  whyItMatters: string;
}

export interface XNewsBriefSummary {
  hours: number;
  topic?: string;
  items: XNewsBriefItem[];
}

export interface IndeedSearchCard {
  jobKey: string;
  title: string;
  company: string;
  locationRaw: string;
  compensationText?: string;
  summaryText: string;
  metadataTags: string[];
  workModel: WorkModel;
  detailUrl: string;
}

export interface IndeedDetailSnapshot {
  jobKey: string;
  title: string;
  company: string;
  locationRaw: string;
  workModel: WorkModel;
  officeLocationRaw?: string;
  remoteEligibility?: string;
  seniority: Seniority;
  employmentType?: string;
  compensationText?: string;
  skills: string[];
  normalizedDescription: string;
  canonicalUrl: string;
}

export type SyncRunStatus = "running" | "completed" | "completed_with_errors" | "failed";

export interface SyncRunRecord {
  runId: string;
  alertId: string;
  searchUrl: string;
  status: SyncRunStatus;
  startedAt: string;
  completedAt?: string;
  pagesFetched: number;
  cardsSeen: number;
  cardsFilteredBeforeDetail: number;
  detailPagesFetched: number;
  parsedLeads: number;
  leadsCreated: number;
  leadsUpdated: number;
  duplicatesMerged: number;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  errorMessage?: string;
}

export interface DiscordDeliveryRecord {
  deliveryId: string;
  alertId: string;
  target: string;
  leadId: string;
  reviewStatus: ReviewStatus;
  syncRunId: string;
  deliveredAt: string;
  externalMessageId?: string;
}

export interface DiscordMessagePayload {
  target: string;
  message: string;
}

export interface DiscordMessageResult {
  deliveryId?: string;
}

export interface AlertSyncSummary {
  runId: string;
  alertId: string;
  status: SyncRunStatus;
  pagesFetched: number;
  cardsSeen: number;
  cardsFilteredBeforeDetail: number;
  detailPagesFetched: number;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  deliveredLeadIds: string[];
  ingest: IngestSummary;
}

export interface IndeedPageFetcher {
  fetchSearchPage(url: string): Promise<string>;
  fetchDetailPage(jobKey: string, url: string): Promise<string>;
  close(): Promise<void>;
}

export interface XNewsPageFetcher {
  fetchFollowingPage(handle: string): Promise<string>;
  fetchTimelinePage(handle: string): Promise<string>;
  close(): Promise<void>;
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

export type LinkedInDeliveryStatus = "pending" | "sending" | "retry" | "uncertain" | "delivered" | "held" | "blocked";
export interface LinkedInDeliveryRecord {
  target: string;
  leadId: string;
  key: string;
  status: LinkedInDeliveryStatus;
  messageId?: string;
  threadId?: string;
  attempts: number;
  retryAt?: string;
  leaseUntil?: string;
  reconcileRequired?: boolean;
  lastError?: string;
  updatedAt: string;
}
export interface LinkedInMessageRecord {
  messageId: string;
  version: string;
  receivedAt: string;
  leadIds: string[];
}

export interface ReviewActionContext {
  interactionId: string;
  userId: string;
  parentChannelId: string;
  threadId: string;
  rootMessageId: string;
  target: string;
  manualApplicationConfirmed?: boolean;
}

export interface LinkedInIntakeHold {
  messageId: string; version: string; capturePath: string; reasons: string[];
  status: "held" | "resolved"; updatedAt: string;
}
