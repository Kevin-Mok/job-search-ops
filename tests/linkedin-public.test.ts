import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { JobStore } from '../src/db/store.js';
import { captureLinkedInPublic, canonicalLinkedInJob, parsePublicPosting, type PublicResponse } from '../src/core/linkedin-public.js';

export const body = 'Responsibilities: Build reliable TypeScript services and maintain accessible interfaces with documented tests. Qualifications: Experience with TypeScript and SQL, collaboration and clear documentation. ';
export const page = (extra = '', date = '<span class="posted-time-ago__text">3 hours ago</span>') => fs.readFileSync('fixtures/linkedin-public/source.html','utf8').replace('<span class="posted-time-ago__text">3 hours ago</span>',date).replace('</p></div>',`${extra}</p></div>`);
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-source-'));
  const store = new JobStore(path.join(dir, 'jobs.sqlite'));
  let time = Date.parse('2026-11-12T12:00:00Z');
  const starts: number[] = [];
  const requests: string[] = [];
  let responses: PublicResponse[] = [];
  let onSleep = () => {};
  const options = { store, runId: 'synthetic-run', mode: 'urls' as const, inputs: ['123', '456'], maxRequests: 25, limit: 10,
    userAgent: 'job-ops-public/0.1 (personal job search)', now: () => time,
    sleep: async (ms: number) => { time += ms; onSleep(); },
    request: async (url: string, ua: string): Promise<PublicResponse> => { expect(ua).toContain('job-ops'); starts.push(time); requests.push(url); return responses.shift() ?? { status: 200, body: page() }; } };
  const enable = () => { store.sources.configurePublic({ enabled: true, budget: 25 }); store.sources.setKill('global', false); store.sources.setKill('linkedin_public', false); };
  return { dir, store, starts, requests, options, enable, responses: (r: PublicResponse[]) => { responses = r; }, onSleep: (fn: () => void) => { onSleep = fn; } };
}
test('default public source is disabled and legacy source budgets cannot be enabled', async () => {
  const s = setup();
  expect(s.store.sources.state().sources.linkedin_public).toMatchObject({ killed: true, budget: 0, enabled: false });
  await expect(captureLinkedInPublic(s.options)).rejects.toThrow(/disabled|kill/i);
  expect(s.requests).toEqual([]);
  s.enable();
  for (const source of ['linkedin', 'indeed']) { s.store.sources.setKill(source, false); expect(() => s.store.sources.assertAutomated(source)).toThrow(/budget.*0|disabled/i); }
});
test('canonical IDs refuse credentialed URLs and all non LinkedIn job routes', () => {
  for (const value of ['123', 'https://www.linkedin.com/jobs/view/engineer-123', 'https://linkedin.com/jobs/search?currentJobId=123']) expect(canonicalLinkedInJob(value)).toEqual({ id: '123', url: 'https://www.linkedin.com/jobs/view/123' });
  const credentialed = new URL('https://linkedin.com/jobs/view/123');
  expect(canonicalLinkedInJob(credentialed.href)).toEqual({ id: '123', url: 'https://www.linkedin.com/jobs/view/123' });
  credentialed.username = 'user'; credentialed.password = 'pass';
  expect(credentialed.hostname).toBe('linkedin.com');
  expect([credentialed.username, credentialed.password]).toEqual(['user', 'pass']);
  expect(() => canonicalLinkedInJob(credentialed.href)).toThrow();
  for (const value of ['http://linkedin.com/jobs/view/123', 'https://indeed.com/jobs/view/123', 'https://linkedin.com:444/jobs/view/123', 'https://linkedin.com/login?currentJobId=123']) expect(() => canonicalLinkedInJob(value)).toThrow();
});
test('URL mode parses a genuine relative posting date with provenance, unknown stays null', () => {
  const actual = parsePublicPosting(page(), '123', '2026-11-12T01:00:00Z');
  expect(actual).toMatchObject({ jobId: '123', datePosted: '2026-11-11', dateProvenance: { kind: 'relative', raw: '3 hours ago', referenceAt: '2026-11-12T01:00:00Z' }, completeness: { status: 'complete' } });
  expect(parsePublicPosting(page('', ''), '123', actual.capturedAt).datePosted).toBeNull();
  const metadata = '<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-11-10"}</script>';
  expect(parsePublicPosting(page('', metadata), '123', actual.capturedAt).datePosted).toBe('2026-11-10');
  expect(parsePublicPosting(page('', metadata.replace('2026-11-10', '2026-02-30')), '123', actual.capturedAt).datePosted).toBeNull();
});
test.each(['…', 'Show more', 'Load more', 'Sign in to view', 'captcha', 'Job is no longer available'])('incomplete or blocked content never enters accepted work: %s', extra => {
  const row = parsePublicPosting(page(extra), '123', '2026-11-12T12:00:00Z');
  expect(row.completeness.status).not.toMatch(/^complete/);
});
test('unrecognized, short, and byte-cutoff bodies are held', () => {
  for (const html of [page().replaceAll('show-more-less-html__markup', 'unknown-body'), page().replace(body.repeat(3), 'short'), page().slice(0, -7), page('x'.repeat(140_000))]) expect(parsePublicPosting(html, '123', '2026-11-12T12:00:00Z').completeness.status).not.toMatch(/^complete/);
});
test('shared starts, completed results and request cap survive restart/dedup with honest public provenance', async () => {
  const s = setup(); s.enable();
  const first = await captureLinkedInPublic({ ...s.options, maxRequests: 2 });
  expect(first.records).toHaveLength(2);
  expect(first.requestsMade).toBe(2);
  expect(s.starts[1] - s.starts[0]).toBeGreaterThanOrEqual(15_000);
  const accepted = s.store.descriptions.accepted(first.leadIds[0]);
  expect(accepted.provenance).toBe('linkedin_public');
  expect(accepted.fullDescriptionConfirmed).toBe(false);
  const again = await captureLinkedInPublic({ ...s.options, store: new JobStore(s.store.dbPath), maxRequests: 2 });
  expect(again.records).toHaveLength(2); expect(s.requests).toHaveLength(2);
  await expect(captureLinkedInPublic({ ...s.options, maxRequests: 25 })).rejects.toThrow(/run.*limits|changed/i);
  await captureLinkedInPublic({ ...s.options, runId: 'next-run', inputs: ['789'] });
  expect(s.starts[2] - s.starts[1]).toBeGreaterThanOrEqual(15_000);
});
test('search has exact Toronto/24h parameters and details share redirect budget', async () => {
  const s = setup(); s.enable();
  s.responses([{ status: 200, body: '<a href="https://www.linkedin.com/jobs/view/software-123">A</a><a href="https://www.linkedin.com/jobs/view/software-456">B</a>' }, { status: 302, location: 'https://www.linkedin.com/jobs/view/123', body: '' }, { status: 200, body: page() }]);
  const result = await captureLinkedInPublic({ ...s.options, mode: 'search', inputs: [], maxRequests: 3 });
  const search = new URL(s.requests[0]);
  expect(search.searchParams.get('keywords')).toBe('software engineer'); expect(search.searchParams.get('location')).toBe('Toronto, Ontario, Canada'); expect(search.searchParams.get('f_TPR')).toBe('r86400');
  expect(result).toMatchObject({ requestsMade: 3, stoppedReason: 'budget' }); expect(result.records).toHaveLength(1);
  expect(s.starts.slice(1).every((t, i) => t - s.starts[i] >= 15_000)).toBe(true);
});
test.each([{status:429,body:''},{status:999,body:''},{status:503,body:''},{status:302,location:'https://www.linkedin.com/authwall',body:''},{status:200,body:'<html>Sign in to view jobs</html>'},{status:200,body:'<html>Verify you are human</html>'}])('whole run stops and cooldown survives new runs/config toggles: %j', async response => {
  const s = setup(); s.enable(); s.responses([{status:200,body:page()},response]);
  const result = await captureLinkedInPublic(s.options);
  expect(result.records).toHaveLength(1); expect(result.stoppedReason).toMatch(/block|HTTP|wall|challenge/i); expect(s.requests).toHaveLength(2);
  s.enable();
  await expect(captureLinkedInPublic({...s.options, store:new JobStore(s.store.dbPath),runId:'do-not-retry'})).rejects.toThrow(/cooldown/i);
  expect(s.requests).toHaveLength(2);
  expect(() => s.store.sources.clearPublicCooldown({ operator:'worker', reason:'test' })).toThrow(/Kevin/);
  s.store.sources.clearPublicCooldown({ operator:'Kevin', reason:'Synthetic operator decision only' });
  expect(s.store.sources.publicControl().cooldown).toBeNull();
});
test.each(['global', 'linkedin_public'])('kill %s during wait prevents next request', async source => {
  const s=setup(); s.enable(); s.onSleep(()=>s.store.sources.setKill(source,true));
  const result=await captureLinkedInPublic(s.options);
  expect(result.records).toHaveLength(1); expect(result.stoppedReason).toMatch(/kill/i); expect(s.requests).toHaveLength(1);
});
test('network failure has no retry; 404 skips; default dry-run has no requests', async () => {
  const s=setup(); s.enable();
  expect((await captureLinkedInPublic({...s.options,dryRun:true})).requestsMade).toBe(0);
  s.responses([{status:404,body:''},{status:200,body:page()}]);
  expect((await captureLinkedInPublic(s.options)).records).toHaveLength(1);
  const failed=await captureLinkedInPublic({...s.options,runId:'network', request:async()=>{throw new Error('sensitive diagnostics');}});
  expect(failed).toMatchObject({requestsMade:1, stoppedReason:'network error; no retry'});
});
test('capture owner refuses concurrent run before transport or state reset', async () => {
  const s=setup();s.enable(); let release!:()=>void;
  const pending=captureLinkedInPublic({...s.options,inputs:['123'],request:async()=>{await new Promise<void>(r=>{release=r;});return {status:200,body:page()};}});
  await Promise.resolve();
  await expect(captureLinkedInPublic({...s.options,runId:'concurrent'})).rejects.toThrow(/active|owner|busy/i);
  release();await pending;
});
test('search resumes remaining discovered IDs after kill without a second search request',async()=>{
 const s=setup();s.enable();s.responses([{status:200,body:'<a href="https://www.linkedin.com/jobs/view/job-123">A</a><a href="https://www.linkedin.com/jobs/view/job-456">B</a>'}]);
 let sleeps=0;s.onSleep(()=>{if(++sleeps===16)s.store.sources.setKill('linkedin_public',true);});
 const first=await captureLinkedInPublic({...s.options,mode:'search',inputs:[]});expect(first.records).toHaveLength(1);
 s.onSleep(()=>{});s.enable();
 const second=await captureLinkedInPublic({...s.options,store:new JobStore(s.store.dbPath),mode:'search',inputs:[]});
 expect(second.records).toHaveLength(2);expect(s.requests.filter(url=>url.includes('seeMore'))).toHaveLength(1);
});
test('replay cannot replace a newer held description with historical complete capture',async()=>{
 const s=setup();s.enable();const result=await captureLinkedInPublic({...s.options,inputs:['123']});
 const leadId=result.leadIds[0];
 s.store.descriptions.capture({...s.store.descriptions.template(leadId),body:'Show more',fullDescriptionConfirmed:true});
 await captureLinkedInPublic({...s.options,inputs:['123']});
 expect(()=>s.store.descriptions.accepted(leadId)).toThrow(/held/);
});
test('MVP environment kill prevents transport before request reservation',async()=>{
 const s=setup();s.enable();const previous=process.env.JD_CAPTURE_DISABLED;process.env.JD_CAPTURE_DISABLED='1';
 try {await expect(captureLinkedInPublic(s.options)).rejects.toThrow(/kill|disabled/i);expect(s.requests).toHaveLength(0);}
 finally {if(previous===undefined)delete process.env.JD_CAPTURE_DISABLED;else process.env.JD_CAPTURE_DISABLED=previous;}
});
test('work model is extracted only from explicit public description evidence',()=>{
 expect(parsePublicPosting(page(' Hybrid work in Toronto.'),'123','2026-11-12T12:00:00Z')).toMatchObject({workModel:'hybrid'});
 expect(parsePublicPosting(page(),'123','2026-11-12T12:00:00Z')).toMatchObject({workModel:'unknown'});
});
test('redirect may canonicalize the same posting but cannot switch posting identity',async()=>{
 const s=setup();s.enable();s.responses([{status:302,location:'https://www.linkedin.com/jobs/view/456',body:''}]);
 const result=await captureLinkedInPublic({...s.options,inputs:['123']});expect(result.records).toHaveLength(0);expect(result.stoppedReason).toMatch(/identity|block/i);expect(s.requests).toHaveLength(1);
});
test('stricter MVP redirect loop stop persists cooldown after eleven attempts',async()=>{
 const s=setup();s.enable();s.responses(Array.from({length:30},()=>({status:302,location:'https://www.linkedin.com/jobs/view/123',body:''})));
 const result=await captureLinkedInPublic({...s.options,inputs:['123']});expect(result.requestsMade).toBe(11);expect(result.stoppedReason).toMatch(/redirect/i);expect(s.requests).toHaveLength(11);expect(s.store.sources.publicControl().cooldown).not.toBeNull();
});
test('persisted request receipts retain starts/status/identity without response body',async()=>{
 const s=setup();s.enable();await captureLinkedInPublic(s.options);
 const receipts=s.store.sources.publicRequestLog('synthetic-run');expect(receipts).toHaveLength(2);
 expect(receipts[0]).toMatchObject({url:'https://www.linkedin.com/jobs/view/123',status:200});
 expect(receipts[1].startedAt-receipts[0].startedAt).toBeGreaterThanOrEqual(15000);
 expect(receipts[0]).not.toHaveProperty('body');
});
test('new public capture replay never promotes an earlier body after a later changed posting',async()=>{
 const s=setup();s.enable();const first=await captureLinkedInPublic({...s.options,inputs:['123']});
 await captureLinkedInPublic({...s.options,runId:'later',inputs:['123'],request:async()=>({status:200,body:page(' New responsibilities and qualifications for a revised posting.')})});
 const latest=s.store.descriptions.current(first.leadIds[0])!.versionId;
 await captureLinkedInPublic({...s.options,inputs:['123']});
 expect(s.store.descriptions.current(first.leadIds[0])!.versionId).toBe(latest);
});
test('interrupted owner survives reopen and cannot be replaced by a new run',async()=>{
 const s=setup();s.enable();s.store.sources.acquirePublic('interrupted','synthetic-dead-owner',25,10,'synthetic');
 const reopened=new JobStore(s.store.dbPath);
 await expect(captureLinkedInPublic({...s.options,store:reopened})).rejects.toThrow(/interrupted|owner|busy/i);
 expect(s.requests).toHaveLength(0);expect(reopened.sources.publicControl().owner).toBe('synthetic-dead-owner');
});
test.each(['Verify&ThinSpace;you are human','Sign&ThickSpace;in to view','<input type="password">'])('formatted challenge/auth wall stops whole run: %s',wall=>{
 const s=setup();s.enable();s.responses([{status:200,body:`<html><main>${wall}</main></html>`}]);
 return captureLinkedInPublic(s.options).then(result=>{expect(result.records).toHaveLength(0);expect(result.stoppedReason).toMatch(/wall|challenge|block/i);expect(s.requests).toHaveLength(1);expect(s.store.sources.publicControl().cooldown).not.toBeNull();});
});
test('malformed redirect records cooldown instead of throwing away the run summary',async()=>{
 const s=setup();s.enable();s.responses([{status:302,body:'',location:'https://['}]);
 const result=await captureLinkedInPublic(s.options);expect(result.stoppedReason).toMatch(/block|redirect/i);expect(s.store.sources.publicControl().cooldown).not.toBeNull();
});
test('corrupt persisted capture fails closed before any restart request',async()=>{
 const s=setup();s.enable();await captureLinkedInPublic({...s.options,inputs:['123']});
 const {default:Database}=await import('better-sqlite3');const db=new Database(s.store.dbPath);
 const saved=db.prepare('SELECT record_json FROM linkedin_public_captures').get() as {record_json:string};
 db.prepare('UPDATE linkedin_public_captures SET record_json=?').run(JSON.stringify({...JSON.parse(saved.record_json),dateProvenance:null}));db.close();
 const before=s.requests.length;await expect(captureLinkedInPublic({...s.options,inputs:['123']})).rejects.toThrow(/persisted public capture/i);expect(s.requests).toHaveLength(before);
});

test('independent bounded detail redirects still share the absolute 25-request run cap',async()=>{
 const s=setup();s.enable();let details=0;
 const result=await captureLinkedInPublic({...s.options,mode:'search',inputs:[],request:async(url:string)=>{
   s.starts.push(s.options.now());s.requests.push(url);
   if(url.includes('seeMore'))return {status:200,body:Array.from({length:10},(_,i)=>`<a href="https://www.linkedin.com/jobs/view/${100+i}">Synthetic</a>`).join('')};
   return ++details%3?{status:302,body:'',location:url}:{status:200,body:page()};
 }});
 expect(result).toMatchObject({requestsMade:25,stoppedReason:'budget'});expect(result.records).toHaveLength(8);expect(s.requests).toHaveLength(25);
});
test.each([{status:200,body:'<html><form action="/login"></form></html>'},{status:404,body:'<html>Verify you are human</html>'},{status:302,body:'',location:'https://www.linkedin.com/jobs/view/%61uthwall-123'}])('stricter MVP wall stops including forms, 404 and encoded URL: %j',async response=>{
 const s=setup();s.enable();s.responses([response]);const result=await captureLinkedInPublic(s.options);
 expect(result.records).toHaveLength(0);expect(result.stoppedReason).toMatch(/block|wall|challenge/i);expect(s.requests).toHaveLength(1);expect(s.store.sources.publicControl().cooldown).not.toBeNull();
});
test('URL mode parses actual time datetime metadata instead of leaving the posting date null',()=>{
 const row=parsePublicPosting(page('','<time datetime="2026-11-10">2 days ago</time>'),'123','2026-11-12T12:00:00Z');
 expect(row).toMatchObject({datePosted:'2026-11-10',dateProvenance:{kind:'metadata',raw:'2026-11-10',referenceAt:'2026-11-12T12:00:00Z'}});
});
test.each([
 '<script>const telemetry = {result: "captcha"};</script>',
 '<style>/* cloudflare telemetry marker */ .job {color: black}</style>',
 '<meta name="telemetry" content="captcha">',
 '<!-- telemetry > captcha is a non-rendered diagnostic label -->'
])('recognized complete page plus only incidental non-rendered metadata stays capturable: %s',async metadata=>{
 const control=setup();control.enable();const baseline=await captureLinkedInPublic({...control.options,inputs:['123']});expect(baseline.records).toHaveLength(1);expect(baseline.stoppedReason).toBeNull();
 for(const inside of [false,true]) {
  const s=setup();s.enable();const ordinary=page();const html=ordinary.replace(inside?'</p></div>':'</html>',`${metadata}${inside?'</p></div>':'</html>'}`);
  s.responses([{status:200,body:html}]);const result=await captureLinkedInPublic({...s.options,inputs:['123']});
  expect(result.stoppedReason).toBeNull();expect(result.records).toHaveLength(1);expect(s.store.sources.publicControl().cooldown).toBeNull();expect(s.store.descriptions.accepted(result.leadIds[0]).status).toBe('complete');expect(result.records[0].description).toBe(baseline.records[0].description);
 }
});
test.each(['<p>Verify you are human</p>','<p>Security challenge: captcha</p>','<input type="password">','<div class="g-recaptcha"></div>','<iframe src="https://example.test/captcha"></iframe>','<form id="challenge"></form>'])('actual visible/structural challenge alongside complete body still stops: %s',async challenge=>{
 const s=setup();s.enable();s.responses([{status:200,body:page().replace('</html>',`${challenge}</html>`)}]);
 const result=await captureLinkedInPublic({...s.options,inputs:['123']});expect(result.records).toHaveLength(0);expect(result.stoppedReason).toMatch(/block|challenge|wall/i);expect(s.store.sources.publicControl().cooldown).not.toBeNull();
});
test('public visible-markup correction never promotes an immutable historical hold',async()=>{
 const s=setup();s.enable();const result=await captureLinkedInPublic({...s.options,inputs:['123']});const id=result.leadIds[0];
 const html=page('<script>const telemetry="captcha";</script>');const current=parsePublicPosting(html,'123','2026-11-12T12:00:01Z');expect(current.completeness.status).toBe('complete');
 const held=s.store.descriptions.capturePublic(id,{...current,completeness:{status:'blocked',reason:'Historical source decision; must not auto-promote.'}});
 const reopened=new JobStore(s.store.dbPath);expect(reopened.descriptions.current(id)?.versionId).toBe(held.versionId);expect(()=>reopened.descriptions.accepted(id)).toThrow(/held.*blocked/i);
 const recaptured=reopened.descriptions.capturePublic(id,{...current,capturedAt:'2026-11-12T12:00:02Z',dateProvenance:{...current.dateProvenance,referenceAt:'2026-11-12T12:00:02Z'}});
 expect(reopened.descriptions.accepted(id).versionId).toBe(recaptured.versionId);expect(reopened.descriptions.history(id).find(row=>row.versionId===held.versionId)?.status).toBe('blocked');
});
