import type {
  JobFamily,
  LocationPolicyResult,
  ParsedLeadInput,
  ReviewStatus,
  Seniority,
  WorkModel
} from "./types.js";

const CANDIDATE_COORDS = {
  latitude: 43.7808,
  longitude: -79.1862
};

const KNOWN_OFFICES: Record<string, { latitude: number; longitude: number; confidence: number }> = {
  "255 consumers road north york on": { latitude: 43.7727, longitude: -79.3353, confidence: 0.98 },
  "2867 lawrence avenue east toronto on": { latitude: 43.7555, longitude: -79.2497, confidence: 0.98 },
  "111 richmond street west toronto on": { latitude: 43.6512, longitude: -79.3841, confidence: 0.98 },
  "325 front street west toronto on": { latitude: 43.6445, longitude: -79.3911, confidence: 0.95 },
  "1 applewood crescent vaughan on": { latitude: 43.7885, longitude: -79.5439, confidence: 0.96 }
};

const TARGET_FAMILY_KEYWORDS: Record<JobFamily, string[]> = {
  swe: ["software engineer", "developer", "engineer", "backend", "full stack"],
  web: ["web", "frontend", "front end", "react", "javascript", "django"],
  python: ["python", "django", "flask", "automation"],
  cloud: ["aws", "cloud", "devops", "infrastructure", "sre"],
  "it-support": ["it support", "help desk", "desktop support", "service desk", "active directory"],
  "call-centre": ["call centre", "call center", "contact centre", "contact center"],
  "customer-support": ["customer support", "customer service", "technical support", "support specialist"],
  unknown: []
};

const HARD_REQUIREMENT_PATTERNS = [
  /security clearance/i,
  /\bts\/sci\b/i,
  /\bcpa\b/i,
  /\brn\b/i,
  /licensed electrician/i,
  /must be bilingual in french/i
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(hav));
}

function resolveOfficeLocation(raw?: string): { latitude?: number; longitude?: number; confidence: number } {
  if (!raw) {
    return { confidence: 0 };
  }

  const normalized = normalizeToken(raw);
  const exact = KNOWN_OFFICES[normalized];
  if (exact) {
    return exact;
  }

  if (normalized.includes("downtown toronto") || normalized === "toronto on" || normalized === "toronto ontario") {
    return { confidence: 0.4 };
  }

  return { confidence: 0 };
}

export function inferJobFamily(lead: ParsedLeadInput): JobFamily {
  const haystack = normalizeToken(
    [lead.title, lead.locationRaw, lead.normalizedDescription, ...lead.skills].join(" ")
  );

  const ranked = Object.entries(TARGET_FAMILY_KEYWORDS)
    .filter(([family]) => family !== "unknown")
    .map(([family, patterns]) => ({
      family: family as JobFamily,
      hits: patterns.filter((pattern) => haystack.includes(pattern)).length
    }))
    .sort((a, b) => b.hits - a.hits);

  return ranked[0]?.hits ? ranked[0].family : "unknown";
}

export function collectRiskFlags(lead: ParsedLeadInput): string[] {
  const flags = new Set<string>();
  const joined = `${lead.company} ${lead.title} ${lead.normalizedDescription} ${lead.remoteEligibility ?? ""}`;

  if (/staffing|recruitment|our client/i.test(joined)) {
    flags.add("staffing_spam");
  }

  if (/telegram|crypto|wire transfer|upfront fee/i.test(joined)) {
    flags.add("suspicious_signals");
  }

  if (/united states only|us only|u\.s\. only/i.test(joined)) {
    flags.add("us_remote_only");
  }

  if (lead.seniority === "senior" || lead.seniority === "staff" || lead.seniority === "manager") {
    flags.add("seniority_mismatch");
  }

  if (HARD_REQUIREMENT_PATTERNS.some((pattern) => pattern.test(joined))) {
    flags.add("unsupported_requirements");
  }

  return [...flags];
}

export function evaluateLocationPolicy(lead: ParsedLeadInput): LocationPolicyResult {
  const remoteEligibility = normalizeToken(lead.remoteEligibility ?? lead.normalizedDescription);
  const resolved = resolveOfficeLocation(lead.officeLocationRaw);

  if (lead.workModel === "remote") {
    const canadaEligible =
      remoteEligibility.includes("canada") ||
      remoteEligibility.includes("canadian residents") ||
      remoteEligibility.includes("north america including canada");

    if (canadaEligible) {
      return {
        decision: "accepted",
        locationConfidence: 1,
        canadaEligibleRemote: true
      };
    }

    if (remoteEligibility.includes("united states") || remoteEligibility.includes("usa")) {
      return {
        decision: "rejected",
        locationConfidence: 1,
        canadaEligibleRemote: false
      };
    }

    return {
      decision: "rejected",
      locationConfidence: 0.6,
      canadaEligibleRemote: false
    };
  }

  if (lead.workModel === "hybrid" || lead.workModel === "onsite") {
    if (!lead.officeLocationRaw || resolved.confidence < 0.8 || resolved.latitude === undefined || resolved.longitude === undefined) {
      return {
        decision: "needs_review",
        locationConfidence: resolved.confidence,
        canadaEligibleRemote: false
      };
    }

    const distanceKm = haversineKm(
      CANDIDATE_COORDS.latitude,
      CANDIDATE_COORDS.longitude,
      resolved.latitude,
      resolved.longitude
    );

    return {
      decision: distanceKm < 20 ? "accepted" : "rejected",
      distanceKm,
      locationConfidence: resolved.confidence,
      canadaEligibleRemote: false,
      officeLatitude: resolved.latitude,
      officeLongitude: resolved.longitude
    };
  }

  return {
    decision: "needs_review",
    locationConfidence: 0,
    canadaEligibleRemote: false
  };
}

export function scoreLead(params: {
  lead: ParsedLeadInput;
  jobFamily: JobFamily;
  location: LocationPolicyResult;
  riskFlags: string[];
  resumeFitScore: number;
}): { score: number; shortlistReason: string; reviewStatus: ReviewStatus } {
  const reasons: string[] = [];
  let score = 35;

  if (params.jobFamily !== "unknown") {
    score += 20;
    reasons.push(`Matches target family: ${params.jobFamily}`);
  } else {
    score -= 25;
    reasons.push("Outside target families");
  }

  if (params.location.decision === "accepted") {
    score += 20;
    reasons.push("Location policy passed");
  } else if (params.location.decision === "needs_review") {
    score += 5;
    reasons.push("Location needs manual review");
  } else {
    score -= 40;
    reasons.push("Location policy failed");
  }

  if (params.lead.seniority === "entry" || params.lead.seniority === "junior" || params.lead.seniority === "mid") {
    score += 10;
  } else if (params.lead.seniority === "senior" || params.lead.seniority === "staff" || params.lead.seniority === "manager") {
    score -= 15;
  }

  score += Math.round(params.resumeFitScore / 5);

  for (const flag of params.riskFlags) {
    if (flag === "suspicious_signals") {
      score -= 30;
      continue;
    }
    if (flag === "us_remote_only" || flag === "unsupported_requirements") {
      score -= 25;
      continue;
    }
    score -= 12;
  }

  score = Math.max(0, Math.min(100, score));

  if (params.location.decision === "rejected" || score < 45) {
    return {
      score,
      shortlistReason: reasons.join("; "),
      reviewStatus: "rejected"
    };
  }

  if (params.location.decision === "needs_review") {
    return {
      score,
      shortlistReason: reasons.join("; "),
      reviewStatus: "needs_review"
    };
  }

  return {
    score,
    shortlistReason: reasons.join("; "),
    reviewStatus: "shortlisted"
  };
}

export function updateReviewStatusForDuplicate(existing: ReviewStatus, candidate: ReviewStatus): ReviewStatus {
  if (existing === "approved_for_manual_apply" || existing === "applied_manually") {
    return existing;
  }

  if (existing === "needs_review" || candidate === "needs_review") {
    return "needs_review";
  }

  if (existing === "rejected" && candidate !== "rejected") {
    return candidate;
  }

  if (candidate === "rejected" && existing !== "rejected") {
    return existing;
  }

  if (existing === "shortlisted" || candidate === "shortlisted") {
    return "shortlisted";
  }

  return existing;
}
