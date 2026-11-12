import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {expect,test,vi} from 'vitest';
import {JobStore} from '../src/db/store.js';
import {captureLinkedInPublic} from '../src/core/linkedin-public.js';
import {drainLinkedInAlerts} from '../src/core/linkedin-route.js';
import {attachLinkedInResume,postingVersion,processLinkedInWork,authorizePublicResumeDelivery,authorizeLinkedInInitialDelivery} from '../src/core/job-workflow.js';
import {createDiscordLinkedInTransport,createFixtureLinkedInTransport} from '../src/discord/linkedin-transport.js';
const html=fs.readFileSync('fixtures/linkedin-public/posting.html','utf8');
const root=process.env.JOB_OPS_PORTFOLIO_ROOT;
async function setup(extra='') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-delivery-'));const store=new JobStore(path.join(dir,'jobs.sqlite'),{linkedinPublicPdfDelivery:true});
 store.sources.configurePublic({enabled:true,budget:25});store.sources.setKill('global',false);store.sources.setKill('linkedin_public',false);
 const result=await captureLinkedInPublic({store,runId:'synthetic',mode:'urls',inputs:['123'],request:async()=>({status:200,body:html.replace('</p>',`${extra}</p>`)})});
 const transport=createFixtureLinkedInTransport(path.join(dir,'discord.json'),{authorizeInitial:input=>authorizeLinkedInInitialDelivery(store,input)});
 const lead=store.getLead(result.leadIds[0])!;
 return {dir,store,transport,lead};
}
test('public handoff default OFF, incomplete, kill and cooldown cannot send even an initial thread',async()=>{
 for (const mode of ['disabled','partial','kill','cooldown']) {
  const s=await setup(mode==='partial'?'Show more':'');
  if(mode==='kill')s.store.sources.setKill('linkedin_public',true);
  if(mode==='cooldown')s.store.sources.blockPublic('Synthetic 429');
  await drainLinkedInAlerts({store:mode==='disabled'?new JobStore(s.store.dbPath):s.store,transport:s.transport});
  expect(fs.existsSync(path.join(s.dir,'discord.json'))).toBe(false);
 }
});
test('real transport default and opt-in without public authorization refuse bytes before HTTP',async()=>{
 const fetcher=vi.fn();
 for (const opts of [{},{linkedinPublicPdfDelivery:true}]) {
  const transport=createDiscordLinkedInTransport({token:'synthetic',channelId:'12345678901234567',fetcher,...opts});
  await expect(transport.sendAttachment!({threadId:'12345678901234568',key:'fixture',filename:'fixture.pdf',bytes:Buffer.from('synthetic'),sha256:'a'.repeat(64)})).rejects.toThrow(/disabled|public|authorization/i);
 }
 expect(fetcher).not.toHaveBeenCalled();
});
test.runIf(Boolean(root))('approved public capture -> fit -> CMU geometry -> exact PDF -> single mocked thread; restart does not resend',async()=>{
 const s=await setup(); const {store,transport,dir}=s;
 await drainLinkedInAlerts({store,transport});
 const lead=store.getLead(s.lead.leadId)!;
 store.work.decideEligibility({leadId:lead.leadId,postingVersion:postingVersion(lead),eligibility:'eligible',reason:'Synthetic authorization and requirements explicitly reviewed.'});
 const candidate=JSON.parse(fs.readFileSync('fixtures/resume/representative-candidate.json','utf8'));
 const evidence=JSON.parse(fs.readFileSync('fixtures/resume/representative-evidence.json','utf8'));
 const args={store,transport,privateDir:dir,candidate,evidence,portfolioRoot:root!,linkedinPublicPdfDelivery:true};
 const [work]=await processLinkedInWork(args);
 expect(work.status,work.lastError).toBe('awaiting_visual_review');expect(work.artifact?.layoutMeasurement?.pageWidthPts).toBe(612);
 const attach={store,transport,workId:work.workId,approvedSha256:work.artifact!.sha256,portfolioRoot:root!,linkedinPublicPdfDelivery:true};
 await expect(attachLinkedInResume({...attach,linkedinPublicPdfDelivery:false})).rejects.toThrow(/flag|enabled|opt.in/i);
 expect((await attachLinkedInResume(attach)).status).toBe('delivered');
 await drainLinkedInAlerts({store:new JobStore(store.dbPath,{linkedinPublicPdfDelivery:true}),transport});
 await processLinkedInWork({...args,store:new JobStore(store.dbPath)});await attachLinkedInResume({...attach,store:new JobStore(store.dbPath)});
 const journal=JSON.parse(fs.readFileSync(path.join(dir,'discord.json'),'utf8'));
 expect(Object.keys(journal.threads)).toHaveLength(1);expect(Object.keys(journal.entries)).toHaveLength(2);
 const messages=Object.values(journal.entries) as {threadId:string;content?:string;filename?:string;sha256?:string}[];
 expect(messages.every(row=>row.threadId===work.threadId)).toBe(true);
 expect(messages.find(row=>row.content)?.content).toContain(lead.canonicalUrl);expect(messages.find(row=>row.content)?.content).toContain('Fit');expect(messages.find(row=>row.content)?.content).toContain('Synthetic Software');
 const file=messages.find(row=>row.filename)!;
 const copied=fs.readdirSync(dir).find(name=>name.startsWith('fixture-')&&name.endsWith('.pdf'))!;
 expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,copied))).digest('hex')).toBe(work.artifact!.sha256);
 expect(file.sha256).toBe(work.artifact!.sha256);
 // Real transport capability exercised only against a synthetic HTTP mock.
 const calls:{url:string;body?:unknown}[]=[];
 const remote=createDiscordLinkedInTransport({token:'synthetic',channelId:'12345678901234567',linkedinPublicPdfDelivery:true,
  authorizePublicPdf:input=>authorizePublicResumeDelivery(store,input),
  fetcher:async(url,init)=>{calls.push({url:String(url),body:init?.body});if(!init?.body)return new Response(JSON.stringify({parent_id:'12345678901234567',type:11}));return new Response(JSON.stringify({id:'12345678901234569',channel_id:work.threadId,attachments:[{id:'12345678901234570',filename:'synthetic.pdf',size:fs.statSync(work.artifact!.pdfPath).size}]}));}});
 // Authorization binds to existing receipt; fixture thread IDs are intentionally invalid REST IDs.
 expect(()=>authorizePublicResumeDelivery(store,{threadId:work.threadId!,sha256:work.artifact!.sha256,descriptionVersion:work.descriptionVersion!})).not.toThrow();
 expect(()=>authorizePublicResumeDelivery(store,{threadId:work.threadId!,sha256:'b'.repeat(64),descriptionVersion:work.descriptionVersion!})).toThrow();
 await expect(remote.sendAttachment!({threadId:work.threadId!,key:'synthetic',filename:'synthetic.pdf',bytes:fs.readFileSync(work.artifact!.pdfPath),sha256:work.artifact!.sha256,publicDescriptionVersion:work.descriptionVersion,beforeSend:()=>{}})).rejects.toThrow(/receipt|snowflake|Invalid/i);
 expect(calls).toHaveLength(0);
 store.sources.blockPublic('Synthetic block after render');
 await expect(attachLinkedInResume(attach)).rejects.toThrow(/cooldown/i);
}, 60_000);

test('source kill during initial thread lookup prevents the new thread write',async()=>{
 const s=await setup();
 s.transport.findThread=async()=>{s.store.sources.setKill('linkedin_public',true);return undefined;};
 await drainLinkedInAlerts({store:s.store,transport:s.transport});
 const journal=JSON.parse(fs.readFileSync(path.join(s.dir,'discord.json'),'utf8'));
 expect(Object.keys(journal.alerts)).toHaveLength(1);expect(Object.keys(journal.threads)).toHaveLength(0);
});
