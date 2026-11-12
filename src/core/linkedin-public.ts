import crypto from 'node:crypto';
import https from 'node:https';
import { classifyDescription, DESCRIPTION_MAX_BYTES, type DescriptionDecision } from './job-description.js';
import { ingestParsedLeads } from './pipeline.js';
import type { WorkModel } from './types.js';
import type { JobStore } from '../db/store.js';

export const PUBLIC_USER_AGENT = 'job-ops-linkedin-public/0.1 (signed-out personal job search; no cookies)';
export interface PublicResponse { status: number; body: string; location?: string; byteCutoff?: boolean }
export interface PublicPosting {
  source: 'linkedin_public'; jobId: string; url: string; title: string; company: string; location: string;
  description: string; descriptionHtml: string; capturedAt: string; datePosted: string | null;
  workModel: WorkModel;
  dateProvenance: { kind: 'metadata' | 'relative' | 'unknown'; raw: string | null; referenceAt: string };
  completeness: DescriptionDecision; byteCutoff: boolean;
}
export function canonicalLinkedInJob(input: string): { id: string; url: string } {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) throw new Error('Bounded public posting ID/URL required.');
  let id = /^\d+$/.test(input) ? input : undefined;
  if (!id) {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['www.linkedin.com','linkedin.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/jobs\/(?:view\/[^/]+\/?|search\/?)$/.test(url.pathname)) throw new Error('Only public HTTPS LinkedIn job IDs/URLs are accepted.');
    id = url.pathname.match(/(?:\/|-)(\d+)\/?$/)?.[1] ?? url.searchParams.get('currentJobId') ?? undefined;
  }
  if (!id || !/^\d{1,30}$/.test(id)) throw new Error('A numeric LinkedIn posting ID is required.');
  return { id, url: `https://www.linkedin.com/jobs/view/${id}` };
}
function allowedRequest(raw: string): URL {
  const url = new URL(raw);
  if (/\/(?:authwall|login|uas\/login|checkpoint)/i.test(decodeURIComponent(url.pathname))) throw new Error('block: authentication wall URL');
  if (url.protocol !== 'https:' || !['www.linkedin.com','linkedin.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/jobs\/view\/[^/]+\/?$|^\/jobs-guest\/jobs\/api\/seeMoreJobPostings\/search$/.test(url.pathname)) throw new Error('block: redirect/request outside public job endpoints');
  if (url.pathname.startsWith('/jobs/view/') && url.search) throw new Error('block: unexpected detail query');
  if (url.pathname.includes('seeMoreJobPostings') && (url.searchParams.size!==4 || url.searchParams.get('keywords')!=='software engineer' || url.searchParams.get('location')!=='Toronto, Ontario, Canada' || url.searchParams.get('f_TPR')!=='r86400' || url.searchParams.get('start')!=='0')) throw new Error('block: unexpected search parameters');
  return url;
}
/** Direct HTTPS ignores proxy/netrc environments. No cookie jar, auth, redirects or retries exist. */
export async function requestPublicHttps(raw: string, userAgent: string): Promise<PublicResponse> {
  const url = allowedRequest(raw);
  validateUserAgent(userAgent);
  return new Promise((resolve,reject)=> {
    const request = https.request(url, { method:'GET', agent:false, headers:{'User-Agent':userAgent,Accept:'text/html'}, timeout:30_000, signal:AbortSignal.timeout(40_000) }, response=> {
      const chunks: Buffer[]=[]; let size=0; let cutoff=false;
      response.on('data',(chunk:Buffer)=> {
        const available=DESCRIPTION_MAX_BYTES-size;
        if (available>0) { const part=chunk.subarray(0,available);chunks.push(part);size+=part.length; }
        if (chunk.length>available || size>=DESCRIPTION_MAX_BYTES) { cutoff=true; response.destroy(); finish(); }
      });
      let finished=false;
      function finish() { if (!finished) { finished=true;resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString('utf8'),location:response.headers.location,byteCutoff:cutoff}); } }
      response.on('end',finish); response.on('error',()=>{if (!cutoff) reject(new Error('Public response interrupted.'));});
    });
    request.on('timeout',()=>request.destroy(new Error('Public request timed out.')));
    request.on('error',()=>reject(new Error('Public network request failed.')));request.end();
  });
}
function validateUserAgent(value:string) {
  if (typeof value!=='string' || !value.trim() || value.length>500 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Honest user agent must be nonempty single-line text.');
}
/** Source-boundary normalization only: retain visible markup and authentication controls. */
export function publicRenderedMarkup(html:string):string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<meta\b[^>]*>/gi,' ');
}
export function publicDescriptionText(html:string):string {
  return publicRenderedMarkup(html).replace(/<\/(?:p|li|div|h[1-6])\s*>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(whole,digits:string)=>{const n=digits.startsWith('x')?parseInt(digits.slice(1),16):Number(digits);return n>0&&n<=0x10ffff?String.fromCodePoint(n):whole;})
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/[\t \r]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
// Balanced same-tag extraction preserves nested paragraphs/divs; unknown/unclosed markup stays held.
function element(html:string,className:string):{html:string;inner:string}|undefined {
  const open=/<([a-z][\w-]*)\b[^>]*\bclass\s*=\s*(["'])(.*?)\2[^>]*>/gi;
  let found:RegExpExecArray|null;
  while ((found=open.exec(html))) {
    if (!found[3].split(/\s+/).includes(className)) continue;
    const tag=found[1];const tokens=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi');tokens.lastIndex=open.lastIndex;let depth=1;let token:RegExpExecArray|null;
    while ((token=tokens.exec(html))) { if (token[0].startsWith('</')) depth--; else if (!token[0].endsWith('/>')) depth++; if (!depth) return {html:html.slice(found.index,tokens.lastIndex),inner:html.slice(open.lastIndex,token.index)}; }
    return undefined;
  }
}
function postingDate(html:string,referenceAt:string):Pick<PublicPosting,'datePosted'|'dateProvenance'> {
  const metadata:unknown[]=[];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { const value:unknown=JSON.parse(match[1]); metadata.push(value); } catch { /* Unknown metadata remains unknown. */ } }
  function find(value:unknown):string|undefined {
    if (Array.isArray(value)) {for (const row of value) {const date=find(row);if(date)return date;}return;}
    if (!value||typeof value!=='object') return;
    const row=value as Record<string,unknown>;
    if ((row['@type']==='JobPosting'||(Array.isArray(row['@type'])&&row['@type'].includes('JobPosting'))) && typeof row.datePosted==='string') return row.datePosted;
    return find(row['@graph']);
  }
  const posted=element(html,'posted-time-ago__text');
  const datetime=posted?.html.match(/\bdatetime\s*=\s*(["'])(.*?)\1/i)?.[2] ?? html.match(/<time\b[^>]*\bdatetime\s*=\s*(["'])(.*?)\1/i)?.[2];
  const raw=metadata.map(find).find(Boolean) ?? datetime;
  if (raw) {
    const day=raw.match(/^\d{4}-\d\d-\d\d(?:$|T)/)?.[0].slice(0,10);
    if (day && Number.isFinite(Date.parse(raw)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)===day && Date.parse(raw)<=Date.parse(referenceAt)) return {datePosted:day,dateProvenance:{kind:'metadata',raw,referenceAt}};
  }
  const relative=publicDescriptionText(element(html,'posted-time-ago__text')?.inner ?? '');
  const match=relative.match(/^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i);
  if (match) {
    const unit:Record<string,number>={minute:60_000,hour:3_600_000,day:86_400_000,week:604_800_000};
    const date=new Date(Date.parse(referenceAt)-Number(match[1])*unit[match[2].toLowerCase()]);
    if (Number.isFinite(date.getTime())) return {datePosted:date.toISOString().slice(0,10),dateProvenance:{kind:'relative',raw:relative,referenceAt}};
  }
  return {datePosted:null,dateProvenance:{kind:'unknown',raw:raw??(relative||null),referenceAt}};
}
export function parsePublicPosting(html:string,jobId:string,capturedAt:string,byteCutoff=false):PublicPosting {
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('Valid capture reference timestamp required.');
  const identity=canonicalLinkedInJob(jobId);
  const container=element(html,'show-more-less-html__markup');
  const descriptionHtml=container?.html??'';
  const description=publicDescriptionText(container?.inner??'');
  const title=publicDescriptionText(element(html,'top-card-layout__title')?.inner??'');
  const company=publicDescriptionText(element(html,'topcard__org-name-link')?.inner??'');
  const location=publicDescriptionText(element(html,'topcard__flavor--bullet')?.inner??'');
  const cutoff=byteCutoff||Buffer.byteLength(html)>=DESCRIPTION_MAX_BYTES||!/<\/html\s*>/i.test(html);
  let completeness=classifyDescription({text:publicRenderedMarkup(descriptionHtml),format:'html',source:'linkedin',byteCutoff:cutoff});
  if (!title||!company||!location) completeness={status:'layout_unknown',reason:'Public detail identity/layout missing; operator review required.'};
  if (description.length<400 && completeness.status==='complete') completeness={status:'partial',reason:'Public body shorter than conservative MVP minimum.'};
  const workModel:WorkModel = /\bhybrid\b/i.test(description) ? 'hybrid' : /\bremote work\b|\bwork remotely\b/i.test(description) ? 'remote' : /\bon[ -]site\b/i.test(description) ? 'onsite' : 'unknown';
  return {source:'linkedin_public',workModel,jobId:identity.id,url:identity.url,title,company,location,description,descriptionHtml,capturedAt,...postingDate(html,capturedAt),completeness,byteCutoff:cutoff};
}
function wall(response:PublicResponse):string|undefined {
  if (response.status>=400 && response.status!==404) return `HTTP ${response.status} block`;
  if (response.status<200) return 'block: unexpected HTTP status';
  const rendered=publicRenderedMarkup(response.body);
  const visible=publicDescriptionText(rendered);
  const decision=classifyDescription({text:visible,format:'text',source:'linkedin'});
  if(decision.status==='blocked')return 'challenge block';
  if(!element(rendered,'show-more-less-html__markup')&&(decision.status==='needs_login'||/<form\b[^>]*action\s*=\s*["'][^"']*(?:login|checkpoint)/i.test(rendered)))return 'authentication wall block';
  if (/<(?:form|iframe|div)\b[^>]*(?:id|class|src)\s*=\s*["'][^"']*(?:captcha|cloudflare|challenge)/i.test(rendered)) return 'structural challenge block';
  if (/authwall|type\s*=\s*["']password/i.test(rendered)||/\b(?:verify (?:that )?you are human|security challenge|access denied|unusual traffic)\b/i.test(visible)) return 'challenge/auth wall block';
  if (!element(rendered,'show-more-less-html__markup') && /\b(?:sign[ -]in|log[ -]?in|join now|sign up)\b/i.test(visible)) return 'sign-in wall block';
}
function ingest(store:JobStore,row:PublicPosting):string {
  const payload={source:'linkedin' as const,sourceMessageId:`public:${row.jobId}`,sourceItemKey:row.jobId,sourceFixture:'private:linkedin_public',title:row.title||'Unknown public posting',company:row.company||'Unknown',locationRaw:row.location||'Unknown',workModel:row.workModel,officeLocationRaw:row.workModel==='hybrid'||row.workModel==='onsite'?row.location:undefined,seniority:'unknown' as const,skills:['typescript','javascript','python','sql','react','node.js','java','aws','docker'].filter(skill=>new RegExp(`\\b${skill.replaceAll('.', '\\.')}\\b`, 'i').test(row.description)),canonicalUrl:row.url,normalizedDescription:row.description};
  const version=crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
  const result=store.linkedin.ingest({messageId:payload.sourceMessageId,version,receivedAt:row.capturedAt,payload:row},()=>{
    const latest=store.linkedin.latestPosting(row.url);
    if (latest && Date.parse(latest.receivedAt)>Date.parse(row.capturedAt)) return [latest.leadId];
    const leadIds=ingestParsedLeads(store,[payload],true).touchedLeadIds;
    store.descriptions.capturePublic(leadIds[0],row);
    store.linkedin.observePosting(row.url,row.capturedAt,leadIds[0]);
    return leadIds;
  });
  return result.leadIds[0];
}
function persistedPosting(value: unknown): PublicPosting {
  const invalid = () => new Error('Invalid persisted public capture; preserve the database and review its schema.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  for (const key of ['jobId','url','title','company','location','description','descriptionHtml','capturedAt']) {
    if (typeof row[key] !== 'string' || String(row[key]).length > DESCRIPTION_MAX_BYTES) throw invalid();
  }
  const date = row.dateProvenance;
  const completeness = row.completeness;
  if (row.source !== 'linkedin_public' || typeof row.byteCutoff !== 'boolean' || !['remote','hybrid','onsite','unknown'].includes(String(row.workModel)) || !Number.isFinite(Date.parse(String(row.capturedAt))) || (row.datePosted !== null && (typeof row.datePosted !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(row.datePosted))) || !date || typeof date !== 'object' || Array.isArray(date) || !completeness || typeof completeness !== 'object' || Array.isArray(completeness)) throw invalid();
  const provenance = date as Record<string,unknown>;
  const decision = completeness as Record<string,unknown>;
  if (!['metadata','relative','unknown'].includes(String(provenance.kind)) || provenance.referenceAt !== row.capturedAt || (provenance.raw !== null && typeof provenance.raw !== 'string') || !['complete','partial','layout_unknown','needs_login','blocked','expired'].includes(String(decision.status)) || typeof decision.reason !== 'string' || canonicalLinkedInJob(String(row.jobId)).url !== row.url || publicDescriptionText(String(row.descriptionHtml)) !== row.description) throw invalid();
  return value as PublicPosting;
}
export interface PublicCaptureOptions {
  store:JobStore;runId:string;mode:'search'|'urls';inputs?:string[];maxRequests?:number;limit?:number;userAgent?:string;dryRun?:boolean;
  now?:()=>number;sleep?:(ms:number)=>Promise<void>;request?:(url:string,userAgent:string)=>Promise<PublicResponse>;progress?:(message:string)=>void;
}
export async function captureLinkedInPublic(options:PublicCaptureOptions) {
  const {store,runId}=options;const maxRequests=options.maxRequests??25;const limit=options.limit??10;const userAgent=options.userAgent??PUBLIC_USER_AGENT;
  validateUserAgent(userAgent);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>25||!Number.isInteger(limit)||limit<1||limit>10) throw new Error('Invalid run ID/limits: requests 1–25, postings 1–10.');
  if (!['search','urls'].includes(options.mode)) throw new Error('Mode must be search or urls.');
  const ids=[...new Set((options.inputs??[]).map(value=>canonicalLinkedInJob(value).id))];
  if (options.mode==='urls' && (!ids.length||ids.length>10)) throw new Error('URL mode requires 1–10 unique posting IDs from local input.');
  const search=new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');search.search=new URLSearchParams({keywords:'software engineer',location:'Toronto, Ontario, Canada',f_TPR:'r86400',start:'0'}).toString();
  if (options.dryRun) return {runId,requestsMade:0,records:[] as PublicPosting[],leadIds:[] as string[],stoppedReason:null,plan:{mode:options.mode,postings:options.mode==='urls'?ids.length:limit,maxRequests,minIntervalSeconds:15}};
  const owner=crypto.randomUUID();store.sources.acquirePublic(runId,owner,maxRequests,limit,JSON.stringify({mode:options.mode,ids,userAgent}));
  const now=options.now??Date.now;const sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));const request=options.request??requestPublicHttps;
  const records:PublicPosting[]=[];const leadIds:string[]=[];let stoppedReason:string|null=null;
  class Stop extends Error {}
  const stop=(reason:string,block=false):never=>{if(block)store.sources.blockPublic(reason);if(block||reason.startsWith('network'))store.sources.stopPublicRun(runId,reason);throw new Stop(reason);};
  async function get(initial:string):Promise<PublicResponse> {
    let url=initial;
    let attempts=0;
    for (;;) {
      if (attempts>=11) return stop('block: too many redirects',true);
      try { allowedRequest(url); } catch { return stop('block: redirect outside public job endpoints',true); }
      store.sources.assertPublic(owner);
      let remaining=Math.max(store.sources.publicControl().lastStart??-Infinity,store.sources.publicControl().lastCompleted??-Infinity)+15000-now();
      while (remaining>0) {options.progress?.(`Pacing public request; ${Math.ceil(remaining/1000)}s remaining`);await sleep(Math.min(remaining,1000));store.sources.assertPublic(owner);remaining=Math.max(store.sources.publicControl().lastStart??-Infinity,store.sources.publicControl().lastCompleted??-Infinity)+15000-now();}
      if (!store.sources.reservePublicRequest(runId,owner,now(),url)) return stop('budget');
      attempts++;
      let response:PublicResponse;
      try { const pending=request(url,userAgent); options.progress?.(`Public HTTP request ${store.sources.publicRequests(runId)}/${maxRequests}`); response=await pending; } catch {store.sources.completePublicRequest(runId,0,now());return stop('network error; no retry');}
      store.sources.completePublicRequest(runId,response.status,now());
      const block=wall(response);if(block)return stop(block,true);
      if (response.status===404) return response;
      if (response.status>=300 && response.status<400) {
        if (!response.location)return stop('block: redirect missing location',true);
        try {
          const next=new URL(response.location,url);
          allowedRequest(next.toString());
          if (new URL(initial).pathname.startsWith('/jobs/view/') && canonicalLinkedInJob(next.toString()).id!==canonicalLinkedInJob(initial).id) return stop('block: redirect changed posting identity',true);
          url=next.toString();
        } catch {return stop('block: redirect outside public job endpoints/auth wall',true);}
        continue;
      }
      return response;
    }
  }
  try {
    try { records.push(...store.sources.publicCaptures(runId).map(persistedPosting)); } catch { throw new Error('Invalid persisted public capture; preserve the database and review its schema.'); }
    for (const row of records) leadIds.push(ingest(store,row));
    const previousStop=store.sources.publicRunProgress(runId).stopped;if(previousStop)throw new Stop(previousStop);
    let pending=ids;
    if(options.mode==='search') {
      const discovered=store.sources.publicRunProgress(runId).discovery;
      if(discovered!==null) pending=discovered;
      else {
        const response=await get(search.toString());
        pending=[...new Set([...response.body.matchAll(/(?:https:\/\/(?:www\.)?linkedin\.com)?\/jobs\/view\/[^\s"'<>]+/g)].flatMap(match=>{try{return [canonicalLinkedInJob(new URL(match[0],'https://www.linkedin.com').toString()).id];}catch{return [];}}))].slice(0,limit);
        store.sources.savePublicDiscovery(runId,pending);
      }
    }
    for (const id of pending.slice(0,limit)) {
      if(records.some(row=>row.jobId===id)||store.sources.publicRunProgress(runId).visited.includes(id))continue;
      if(records.length>=limit)break;
      const response=await get(canonicalLinkedInJob(id).url);store.sources.visitPublic(runId,id);if(response.status===404)continue;
      const row=parsePublicPosting(response.body,id,new Date(now()).toISOString(),response.byteCutoff);
      if(['blocked','needs_login'].includes(row.completeness.status))return stop(`block: ${row.completeness.status}`,true);
      store.sources.savePublicCapture(runId,id,row);records.push(row);leadIds.push(ingest(store,row));
    }
  } catch(error) {
    if(error instanceof Stop) stoppedReason=error.message;
    else if(error instanceof Error && /kill|disabled|cooldown/i.test(error.message)) stoppedReason=error.message;
    else throw error;
  } finally {store.sources.releasePublic(owner);}
  return {runId,requestsMade:store.sources.publicRequests(runId),records,leadIds,stoppedReason};
}
