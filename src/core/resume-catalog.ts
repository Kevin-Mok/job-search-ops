import type { JobFamily, ResumeVariant } from "./types.js";

export const ENGINEERING_FAMILIES: JobFamily[] = ["swe", "web", "python", "cloud"];
export const SUPPORT_FAMILIES: JobFamily[] = ["it-support", "call-centre", "customer-support"];

export const RESUME_VARIANTS: ResumeVariant[] = [
  {
    id: "web-dev",
    lane: "engineering",
    jobFamilies: ["swe", "web"],
    skills: ["javascript", "typescript", "react", "node", "html", "css", "rest api"],
    supportedEvidence: [
      "Built web features across front-end and back-end layers for business applications.",
      "Worked with JavaScript and TypeScript-based product delivery.",
      "Delivered incremental improvements while coordinating with non-technical stakeholders."
    ]
  },
  {
    id: "web-dev-django",
    lane: "engineering",
    jobFamilies: ["swe", "web", "python"],
    skills: ["python", "django", "postgresql", "sql", "rest api", "aws"],
    supportedEvidence: [
      "Built Python and Django applications backed by relational data stores.",
      "Delivered REST-style application features and admin workflows.",
      "Handled both implementation work and operational support for shipped web software."
    ]
  },
  {
    id: "python",
    lane: "engineering",
    jobFamilies: ["swe", "python"],
    skills: ["python", "automation", "sql", "apis", "data processing"],
    supportedEvidence: [
      "Used Python for automation and backend-oriented problem solving.",
      "Worked with APIs and structured data flows.",
      "Can translate manual workflows into repeatable Python-based processes."
    ]
  },
  {
    id: "aws",
    lane: "engineering",
    jobFamilies: ["cloud"],
    skills: ["aws", "cloudwatch", "iam", "ec2", "s3", "troubleshooting"],
    supportedEvidence: [
      "Worked with AWS services and cloud troubleshooting tasks.",
      "Handled operational follow-up and environment-level problem isolation.",
      "Can support cloud-oriented work that mixes delivery and maintenance."
    ]
  },
  {
    id: "aws-web-dev",
    lane: "engineering",
    jobFamilies: ["web", "cloud", "swe"],
    skills: ["aws", "python", "django", "javascript", "typescript", "rest api"],
    supportedEvidence: [
      "Built web applications while also working with AWS-backed environments.",
      "Comfortable moving between application code and cloud delivery concerns.",
      "Can frame web development work in production-oriented, customer-facing terms."
    ]
  },
  {
    id: "aws-python",
    lane: "engineering",
    jobFamilies: ["python", "cloud", "swe"],
    skills: ["aws", "python", "automation", "sql", "apis", "linux"],
    supportedEvidence: [
      "Used Python in environments that also depended on AWS operations.",
      "Handled automation, integration, and troubleshooting work.",
      "Can position Python experience in a cloud-adjacent delivery context."
    ]
  },
  {
    id: "call-centre",
    lane: "support",
    jobFamilies: ["call-centre", "customer-support"],
    skills: ["phone support", "ticketing", "customer service", "triage", "de-escalation"],
    supportedEvidence: [
      "Handled customer conversations and issue triage in service-oriented workflows.",
      "Maintained clear notes and follow-up steps across repeated customer interactions.",
      "Can frame support work in terms of responsiveness, clarity, and reliability."
    ]
  },
  {
    id: "it-support",
    lane: "support",
    jobFamilies: ["it-support"],
    skills: ["help desk", "windows", "active directory", "ticketing", "troubleshooting"],
    supportedEvidence: [
      "Resolved end-user issues across workstation, account, and software problems.",
      "Worked through ticket-driven troubleshooting and communication loops.",
      "Can present technical support work without overstating ownership."
    ]
  },
  {
    id: "it-support-sql",
    lane: "support",
    jobFamilies: ["it-support"],
    skills: ["help desk", "windows", "active directory", "sql", "reporting"],
    supportedEvidence: [
      "Supported end users while also working with SQL-backed reporting tasks.",
      "Comfortable translating support issues into structured data follow-up.",
      "Can connect technical support experience to reporting and operations needs."
    ]
  },
  {
    id: "it-support-aws",
    lane: "support",
    jobFamilies: ["it-support", "cloud"],
    skills: ["help desk", "aws", "cloudwatch", "ticketing", "linux", "troubleshooting"],
    supportedEvidence: [
      "Handled support work that touched both end-user issues and cloud-adjacent systems.",
      "Can explain AWS familiarity in operational support language.",
      "Works well in roles that mix troubleshooting, escalation, and environment context."
    ]
  },
  {
    id: "sales",
    lane: "support",
    jobFamilies: ["customer-support", "call-centre"],
    skills: ["crm", "customer follow-up", "discovery", "relationship building", "pipeline"],
    supportedEvidence: [
      "Handled customer-facing follow-up and relationship-oriented communication.",
      "Can organize work around responsiveness, clarity, and outcome tracking.",
      "Useful when a support role leans into customer retention or light sales behavior."
    ]
  }
];

export function getResumeVariant(id: string): ResumeVariant {
  const variant = RESUME_VARIANTS.find((entry) => entry.id === id);
  if (!variant) {
    throw new Error(`Unknown resume variant: ${id}`);
  }
  return variant;
}
