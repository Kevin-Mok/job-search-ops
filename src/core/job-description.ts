export type DescriptionStatus = 'complete' | 'complete_operator_confirmed' | 'partial' | 'layout_unknown' | 'needs_login' | 'blocked' | 'expired';
export interface DescriptionDecision { status: DescriptionStatus; reason: string }
export const DESCRIPTION_MAX_BYTES = 128 * 1024;

/** Offline classification only. Recognized markup is evidence of layout, never authority to fetch. */
export function classifyDescription(input: { text: string; format: 'text' | 'html'; source: string; operatorConfirmed?: boolean; byteCutoff?: boolean }): DescriptionDecision {
  const raw = input.text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (whole, digits: string) => {
    const point = digits.toLowerCase().startsWith('x') ? parseInt(digits.slice(1), 16) : Number(digits);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&hellip;/gi, '…').replace(/&(?:nbsp|NonBreakingSpace|ensp|emsp(?:13|14)?|numsp|puncsp|thinsp|ThinSpace|hairsp|VeryThinSpace|MediumSpace|ThickSpace|Negative(?:VeryThin|Thin|Medium|Thick)Space|Tab|NewLine);/gi, ' ');
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/&hellip;|&#8230;/gi, '…').replace(/\s+/g, ' ').trim();
  const result = (status: DescriptionStatus, reason: string) => ({ status, reason });
  if (/captcha|cloudflare/i.test(raw) || /\b(?:verify (?:that )?you are human|security challenge|access denied|unusual traffic)\b/i.test(text)) return result('blocked', 'Challenge/access block detected. Paste a verified employer description locally.');
  if (/type\s*=\s*["']password|authwall|secure\.indeed\.com\/auth/i.test(raw) || /\b(?:sign[ -]in|log[ -]?in required|log[ -]in to (?:view|continue)|join now|sign up to|join (?:linkedin|indeed) to)\b/i.test(text)) return result('needs_login', 'Authentication wall detected; automated login is disabled.');
  if (/job (?:is |has )?(?:no longer available|expired|closed)|no longer accepting applications|position (?:has been filled|is closed)/i.test(text)) return result('expired', 'Posting appears expired; review a current employer posting.');
  if (input.byteCutoff || Buffer.byteLength(input.text, 'utf8') >= DESCRIPTION_MAX_BYTES) return result('partial', 'Byte limit/cutoff detected; obtain the entire description.');
  if (!text || /…|\.{3}|\b(?:show more|load more|read more|see more|view full (?:job )?description|truncat(?:ed|ion)|job snippet)\b/i.test(text)) return result('partial', 'Missing body or truncation/load-more marker detected; paste the entire description.');
  if (input.format === 'html') {
    if (/<html\b/i.test(raw) && !/<\/html\s*>/i.test(raw)) return result('partial', 'HTML capture ended before its closing document marker.');
    const marker = input.source === 'linkedin' ? /class\s*=\s*["'][^"']*show-more-less-html__markup[^"']*["']/i : input.source === 'indeed' ? /id\s*=\s*["']jobDescriptionText["']/i : /$a/;
    const container = raw.match(/<(section|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi)?.find(chunk => marker.test(chunk));
    if (!container || !/requirements|qualifications/i.test(container) || !/responsibilities|about the role/i.test(container) || container.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length < 120) return result('layout_unknown', 'Unrecognized or incomplete description layout; review and paste plain full text.');
    return result('complete', 'Recognized synthetic detail layout with body and requirements.');
  }
  if (/<\/?[a-z][^>]*>/i.test(raw)) return result('layout_unknown', 'Manual capture requires plain description text; unknown HTML cannot be operator-confirmed.');
  if (text.length < 120 || !/requirements|qualifications/i.test(text) || !/responsibilities|about the role/i.test(text)) return result('layout_unknown', 'Full body, responsibilities and requirements could not be established.');
  if (!input.operatorConfirmed) return result('layout_unknown', 'Operator full-description confirmation is required.');
  return result('complete_operator_confirmed', 'Operator confirmed the entire local description; no known blockers detected.');
}
