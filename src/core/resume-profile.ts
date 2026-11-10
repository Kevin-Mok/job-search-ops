import type { ApprovedResumeClaim } from "./job-resume.js";

export interface ResumeSource { path: string; sha256: string }
export interface CanonicalResumeWork {
  company: string;
  title: string;
  date: string;
  languages: string[];
  evidenceIds: string[];
  companyUrl?: string;
  titleUrl?: string;
  evidenceUrl?: string;
  evidenceLabel?: string;
}
export interface CanonicalResumeProject {
  name: string;
  date: string;
  languages: string[];
  evidenceIds: string[];
  url?: string;
}
export interface CanonicalResumeProfile {
  version: 1;
  baseline: { variantId: "web-dev"; sources: ResumeSource[] };
  contact: { phone: string; linkedin: string; github: string };
  sectionTitles: { experience: string; projects: string; skills: string; education: string; otherExperience?: string };
  experience: CanonicalResumeWork[];
  projects: CanonicalResumeProject[];
  otherExperience?: CanonicalResumeWork[];
  skills: string[];
  skillsBold?: string[];
  education: { institution: string; degree: string; gpa: string; date: string }[];
  primarySectionOrder?: "experience-first" | "projects-first";
}

const placeholder = /\b(?:TODO|TBD|PLACEHOLDER|lorem ipsum)\b|\{\{[^}]+\}\}|\[INSERT\b/i;
const plain = (text: string): string => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
function text(value: unknown, label: string, limit = 300): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u001f<>]/.test(value)) throw new Error(`Resume profile ${label} must be bounded plain text.`);
  if (placeholder.test(value)) throw new Error(`Resume profile ${label} contains an unresolved placeholder.`);
  return value.trim();
}
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`Resume profile ${label} has unsupported fields or is not an object.`);
  return value as Record<string, unknown>;
}
function list(value: unknown, label: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`Resume profile ${label} must be a bounded list.`);
  return value;
}
function texts(value: unknown, label: string, max: number, min = 0): string[] {
  const result = list(value, label, max, min).map(entry => text(entry, label));
  if (new Set(result).size !== result.length) throw new Error(`Resume profile ${label} must contain unique values.`);
  return result;
}
function url(value: unknown, label: string): string {
  const result = text(value, label, 2000);
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new Error(`Resume profile ${label} must be an absolute HTTPS URL.`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`Resume profile ${label} must be an absolute HTTPS URL without credentials.`);
  return result;
}
function optionalUrl(entry: Record<string, unknown>, key: string): Record<string, string> {
  return entry[key] === undefined ? {} : { [key]: url(entry[key], `${key} URL`) };
}

/** Metadata retains baseline provenance; contribution text comes only from approved evidence. */
export function prepareResumeProfile(value: unknown, evidence: ApprovedResumeClaim[], targetTitle: string, selectedIds?: string[]): { profile: CanonicalResumeProfile; claims: ApprovedResumeClaim[]; requiredText: string[] } {
  const input = object(value, ["version", "baseline", "contact", "sectionTitles", "experience", "projects", "otherExperience", "skills", "skillsBold", "education", "primarySectionOrder"], "document");
  if (input.version !== 1) throw new Error("Resume profile version must be 1.");
  const baseline = object(input.baseline, ["variantId", "sources"], "baseline provenance");
  if (baseline.variantId !== "web-dev") throw new Error("Resume profile baseline must use the existing web-dev layout.");
  const sources = list(baseline.sources, "baseline sources", 20, 1).map(value => {
    const entry = object(value, ["path", "sha256"], "source provenance");
    const sourcePath = text(entry.path, "source path", 500);
    if (sourcePath.startsWith("/") || sourcePath.includes("\\") || sourcePath.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Resume profile source paths must stay relative to the read-only portfolio.");
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Resume profile source provenance requires a SHA-256 hash.");
    return { path: sourcePath, sha256: entry.sha256 };
  });
  if (new Set(sources.map(source => source.path)).size !== sources.length) throw new Error("Resume profile source paths must be unique.");
  const contactInput = object(input.contact, ["phone", "linkedin", "github"], "contact");
  const contact = { phone: text(contactInput.phone, "phone", 80), linkedin: text(contactInput.linkedin, "LinkedIn", 300), github: text(contactInput.github, "GitHub", 300) };
  for (const label of [contact.linkedin, contact.github]) url(/^https:\/\//.test(label) ? label : `https://${label}`, "contact URL");
  const titlesInput = object(input.sectionTitles, ["experience", "projects", "skills", "education", "otherExperience"], "section titles");
  const sectionTitles: CanonicalResumeProfile["sectionTitles"] = {
    experience: text(titlesInput.experience, "experience heading", 100), projects: text(titlesInput.projects, "projects heading", 100),
    skills: text(titlesInput.skills, "skills heading", 100), education: text(titlesInput.education, "education heading", 100),
    ...(titlesInput.otherExperience === undefined ? {} : { otherExperience: text(titlesInput.otherExperience, "other experience heading", 100) })
  };
  if (input.primarySectionOrder !== undefined && input.primarySectionOrder !== "experience-first" && input.primarySectionOrder !== "projects-first") throw new Error("Resume profile primary section order is invalid.");
  const byId = new Map(evidence.map(claim => [claim.id, claim]));
  const selected = selectedIds && new Set(selectedIds);
  const usedIds = new Set<string>();
  const targetWords = new Set(targetTitle.toLowerCase().match(/[a-z0-9+#]+/g) ?? []);
  const relevance = (id: string): number => [...targetWords].filter(word => word.length > 2 && plain(byId.get(id)!.claim).toLowerCase().split(/[^a-z0-9+#]+/).includes(word)).length;
  function evidenceIds(value: unknown): string[] {
    const ids = texts(value, "entry evidence IDs", 20);
    for (const id of ids) {
      if (/^SRC-/i.test(id)) throw new Error("Resume profile SRC-only retained statements are not approved bank evidence.");
      if (!byId.has(id) || byId.get(id)!.approved !== true) throw new Error("Resume profile references missing approved evidence.");
      if (usedIds.has(id)) throw new Error("Resume profile cannot duplicate evidence across entries.");
      usedIds.add(id);
    }
    return ids.filter(id => !selected || selected.has(id)).sort((a, b) => relevance(b) - relevance(a));
  }
  function work(value: unknown): CanonicalResumeWork {
    const entry = object(value, ["company", "title", "date", "languages", "evidenceIds", "companyUrl", "titleUrl", "evidenceUrl", "evidenceLabel"], "work entry");
    return { company: text(entry.company, "company"), title: text(entry.title, "work title"), date: text(entry.date, "work date", 100), languages: texts(entry.languages, "work technologies", 30), evidenceIds: evidenceIds(entry.evidenceIds), ...optionalUrl(entry, "companyUrl"), ...optionalUrl(entry, "titleUrl"), ...optionalUrl(entry, "evidenceUrl"), ...(entry.evidenceLabel === undefined ? {} : { evidenceLabel: text(entry.evidenceLabel, "evidence label", 100) }) };
  }
  const experience = list(input.experience, "experience", 20, 1).map(work);
  const projects = list(input.projects, "projects", 20, 1).map(value => {
    const entry = object(value, ["name", "date", "languages", "evidenceIds", "url"], "project entry");
    return { name: text(entry.name, "project name"), date: text(entry.date, "project date", 100), languages: texts(entry.languages, "project technologies", 30), evidenceIds: evidenceIds(entry.evidenceIds), ...optionalUrl(entry, "url") };
  });
  const otherExperience = input.otherExperience === undefined ? undefined : list(input.otherExperience, "other experience", 20).map(work);
  if (selectedIds?.some(id => !usedIds.has(id))) throw new Error("Selected resume profile evidence must belong to a canonical entry.");
  const skills = texts(input.skills, "skills", 100, 1);
  const skillsBold = input.skillsBold === undefined ? undefined : texts(input.skillsBold, "bold skills", 100);
  if (skillsBold?.some(skill => !skills.includes(skill))) throw new Error("Resume profile bold skills must be present in baseline skills.");
  const education = list(input.education, "education", 10, 1).map(value => {
    const entry = object(value, ["institution", "degree", "gpa", "date"], "education entry");
    return { institution: text(entry.institution, "institution"), degree: text(entry.degree, "degree"), gpa: text(entry.gpa, "education GPA", 500), date: text(entry.date, "education date", 100) };
  });
  const profile: CanonicalResumeProfile = {
    version: 1, baseline: { variantId: "web-dev", sources }, contact, sectionTitles, experience, projects,
    ...(otherExperience === undefined ? {} : { otherExperience }), skills, ...(skillsBold === undefined ? {} : { skillsBold }), education,
    ...(input.primarySectionOrder === undefined ? {} : { primarySectionOrder: input.primarySectionOrder })
  };
  const orderedEntries = profile.primarySectionOrder === "projects-first" ? [...projects, ...experience, ...(otherExperience ?? [])] : [...experience, ...projects, ...(otherExperience ?? [])];
  const claims = orderedEntries.flatMap(entry => entry.evidenceIds.map(id => byId.get(id)!));
  if (!claims.length) throw new Error("Resume profile requires at least one routed approved evidence claim.");
  const requiredText = [contact.phone, contact.linkedin, contact.github, sectionTitles.experience, sectionTitles.projects, sectionTitles.skills, sectionTitles.education,
    ...(otherExperience?.length ? [sectionTitles.otherExperience ?? "Other Work Experience"] : []),
    ...orderedEntries.flatMap(entry => ["company" in entry ? entry.company : entry.name, entry.date, ...entry.languages, ...("title" in entry ? [entry.title, ...(entry.evidenceUrl ? [entry.evidenceLabel ?? "Evidence"] : [])] : [])]),
    ...skills, ...education.flatMap(entry => [entry.institution, entry.degree, entry.gpa, entry.date])];
  return { profile, claims, requiredText };
}

const escapeHtml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const emphasized = (text: string): string => escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

export function renderResumeProfile(candidate: { name: string; email: string; profile: CanonicalResumeProfile }, target: { title: string; company: string }, claims: ApprovedResumeClaim[]): string {
  const { profile } = candidate;
  const byId = new Map(claims.map(claim => [claim.id, claim]));
  const link = (href: string, label: string, className: string): string => `<a href="${escapeHtml(href)}" class="${className}">${escapeHtml(label)}</a>`;
  const website = (label: string): string => /^https:\/\//.test(label) ? label : `https://${label}`;
  const contact = (href: string, label: string, side: string): string => `<a href="${escapeHtml(href)}" class="contact-item contact-item-${side}"><span class="contact-label">${escapeHtml(label)}</span></a>`;
  const bullets = (ids: string[]): string => ids.length ? `<ul class="resume-bullets">${ids.map(id => `<li>${emphasized(byId.get(id)!.claim)}</li>`).join("")}</ul>` : "";
  const technologies = (languages: string[]): string => languages.length ? `<span class="entry-tech-inline">&lt;${languages.map(escapeHtml).join(", ")}&gt;</span>` : "";
  const work = (entry: CanonicalResumeWork): string => `<div class="resume-entry"><div class="resume-entry-header"><h3 class="entry-company">${entry.companyUrl ? link(entry.companyUrl, entry.company, "entry-company-link") : escapeHtml(entry.company)}</h3><span class="entry-date">${escapeHtml(entry.date)}</span></div><div class="entry-subtitle">${entry.titleUrl ? link(entry.titleUrl, entry.title, "entry-position entry-position-link") : `<span class="entry-position">${escapeHtml(entry.title)}</span>`}${technologies(entry.languages)}${entry.evidenceUrl ? link(entry.evidenceUrl, entry.evidenceLabel ?? "Evidence", "entry-evidence-link") : ""}</div>${bullets(entry.evidenceIds)}</div>`;
  const project = (entry: CanonicalResumeProject): string => `<div class="resume-entry"><div class="resume-entry-header"><div class="entry-headline"><h3 class="entry-title">${entry.url ? link(entry.url, entry.name, "entry-title-link") : escapeHtml(entry.name)}</h3>${technologies(entry.languages)}</div><span class="entry-date">${escapeHtml(entry.date)}</span></div>${bullets(entry.evidenceIds)}</div>`;
  const section = (title: string, content: string): string => `<section class="resume-section"><h2 class="resume-section-title">${escapeHtml(title)}</h2>${content}</section>`;
  const experience = section(profile.sectionTitles.experience, profile.experience.map(work).join(""));
  const projects = section(profile.sectionTitles.projects, profile.projects.map(project).join(""));
  const boldSkills = new Set(profile.skillsBold ?? profile.skills);
  return `<main class="resume-latex resume-latex--pdf resume-variant-web-dev"><header class="resume-header"><h1 class="resume-name">${escapeHtml(candidate.name)}</h1><div class="resume-contact-columns"><div class="resume-contact-column resume-contact-column-left">${contact(`tel:${profile.contact.phone}`, profile.contact.phone, "left")}${contact(`mailto:${candidate.email}`, candidate.email, "left")}</div><div class="resume-contact-column resume-contact-column-right">${contact(website(profile.contact.linkedin), profile.contact.linkedin, "right")}${contact(website(profile.contact.github), profile.contact.github, "right")}</div></div><p class="resume-summary">Application target: ${escapeHtml(target.title)} | ${escapeHtml(target.company)}</p></header>${profile.primarySectionOrder === "projects-first" ? projects + experience : experience + projects}${profile.otherExperience?.length ? section(profile.sectionTitles.otherExperience ?? "Other Work Experience", profile.otherExperience.map(work).join("")) : ""}${section(profile.sectionTitles.skills, `<p class="resume-skills-inline">${profile.skills.map(skill => boldSkills.has(skill) ? `<strong>${escapeHtml(skill)}</strong>` : escapeHtml(skill)).join(", ")}</p>`)}${section(profile.sectionTitles.education, profile.education.map(entry => `<div class="resume-education"><div class="education-header"><h3 class="education-institution">${escapeHtml(entry.institution)}</h3><span class="entry-date">${escapeHtml(entry.date)}</span></div><p class="education-details">${escapeHtml(entry.degree)} — ${escapeHtml(entry.gpa)}</p></div>`).join(""))}</main>`;
}
