import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect,test} from 'vitest';
import {JobStore} from '../src/db/store.js';
import {captureLinkedInPublic} from '../src/core/linkedin-public.js';
import {scoreJobFit} from '../src/core/fit-scoring.js';
import {drainLinkedInAlerts} from '../src/core/linkedin-route.js';
import {authorizeLinkedInInitialDelivery} from '../src/core/job-workflow.js';
import {createDiscordLinkedInTransport,createFixtureLinkedInTransport,DiscordRouteError} from '../src/discord/linkedin-transport.js';

const html=fs.readFileSync('fixtures/linkedin-public/source.html','utf8');
async function setup(mode:'urls'|'search'='urls',description=html) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-review-'));
 const store=new JobStore(path.join(dir,'jobs.sqlite'),{linkedinPublicPdfDelivery:true});
 store.sources.configurePublic({enabled:true,budget:25});store.sources.setKill('global',false);store.sources.setKill('linkedin_public',false);
 let time=Date.parse('2026-11-12T12:00:00Z');
 const options={store,runId:'synthetic',mode,inputs:['123'],now:()=>time,sleep:async(ms:number)=>{time+=ms;},request:async(url:string)=>({status:200,body:url.includes('seeMoreJobPostings')?'<a href="/jobs/view/123">Synthetic</a>':description})};
 const result=await captureLinkedInPublic(options);
 return {dir,store,options,leadId:result.leadIds[0]};
}

test.each(['urls','search'] as const)('%s ingestion and replay score JavaScript independently of Java',async mode=>{
 const s=await setup(mode,html.replaceAll('TypeScript','JavaScript').replaceAll('SQL','JavaScript'));
 const evidence=[{id:'synthetic-js',claim:'Built synthetic JavaScript services.',skills:['javascript'],source:'synthetic://approved',approved:true}];
 for(let replay=0;replay<2;replay++) {
  const lead=s.store.getLead(s.leadId)!;
  expect(lead.skills).toEqual(['javascript']);
  expect(scoreJobFit({job:lead,postingVersion:'synthetic',evidence})).toMatchObject({score:10,gaps:[]});
  await captureLinkedInPublic({...s.options,request:async()=>{throw new Error('Replay must not request.');}});
 }
});
test('skill boundaries reject longer words and retain punctuation-delimited exact names',async()=>{
 const s=await setup('urls',html.replaceAll('TypeScript','Java, JavaScript, Node.js').replaceAll('SQL','React; Python; SQL; AWS; Docker; TypeScript. Not javaish, preact, nosql or nodeXjs'));
 expect(s.store.getLead(s.leadId)!.skills).toEqual(['typescript','javascript','python','sql','react','node.js','java','aws','docker']);
 const longer=await setup('urls',html.replaceAll('TypeScript','javaish javascripted typescripted preact').replaceAll('SQL','nosql pythonic awsome dockers nodeXjs'));
 expect(longer.store.getLead(longer.leadId)!.skills).toEqual([]);
});

for(const backend of ['fixture','rest'] as const) for(const stage of ['alert','thread'] as const) {
 test(`${backend} ${stage} definite admission denial resumes once with the same receipt identity`,async()=>{
  const s=await setup();let deny=true;let alerts=0;let threads=0;
  const channel='12345678901234567',message='12345678901234568',thread='12345678901234569';
  const authorize=(input:Parameters<typeof authorizeLinkedInInitialDelivery>[1])=>{
   if(deny && (stage==='alert'?Boolean(input.key):Boolean(input.messageId)))s.store.sources.setKill('linkedin_public',true);
   authorizeLinkedInInitialDelivery(s.store,input);
  };
  const transport=backend==='fixture'?createFixtureLinkedInTransport(path.join(s.dir,'journal.json'),{authorizeInitial:authorize}):createDiscordLinkedInTransport({token:'synthetic',channelId:channel,authorizeInitial:authorize,fetcher:async(url,init)=>{
   if(!init?.body)return new Response('',{status:404});
   if(String(url).endsWith('/threads')){threads++;return new Response(JSON.stringify({id:thread,parent_id:channel,type:11}));}
   alerts++;return new Response(JSON.stringify({id:message,channel_id:channel}));
  }});
  const now=new Date('2026-11-12T12:00:00Z');
  await drainLinkedInAlerts({store:s.store,transport,now});
  const denied=s.store.linkedin.listDeliveries(transport.target)[0];
  expect(denied).toMatchObject({status:'retry',reconcileRequired:false});
  expect(denied.threadId).toBeUndefined();
  if(stage==='thread')expect(denied.messageId).toBeTruthy();else expect(denied.messageId).toBeUndefined();
  deny=false;s.store.sources.setKill('linkedin_public',false);
  const reopened=new JobStore(s.store.dbPath,{linkedinPublicPdfDelivery:true});
  await drainLinkedInAlerts({store:reopened,transport,now:new Date(now.getTime()+61_000)});
  await drainLinkedInAlerts({store:reopened,transport,now:new Date(now.getTime()+122_000)});
  const delivered=reopened.linkedin.listDeliveries(transport.target)[0];
  expect(delivered).toMatchObject({status:'delivered',key:denied.key,reconcileRequired:false});
  if(denied.messageId)expect(delivered.messageId).toBe(denied.messageId);
  if(backend==='fixture') {
   const journal=JSON.parse(fs.readFileSync(path.join(s.dir,'journal.json'),'utf8'));
   expect(Object.keys(journal.alerts)).toHaveLength(1);expect(Object.keys(journal.threads)).toHaveLength(1);
  }else {expect(alerts).toBe(1);expect(threads).toBe(1);}
 });
}

test('kill during thread readback resumes without inventing an uncertain thread write',async()=>{
 const s=await setup();
 const transport=createFixtureLinkedInTransport(path.join(s.dir,'journal.json'),{authorizeInitial:input=>authorizeLinkedInInitialDelivery(s.store,input)});
 const find=transport.findThread;let kill=true;
 transport.findThread=async id=>{if(kill)s.store.sources.setKill('linkedin_public',true);return find(id);};
 const now=new Date('2026-11-12T12:00:00Z');
 await drainLinkedInAlerts({store:s.store,transport,now});
 expect(s.store.linkedin.listDeliveries(transport.target)[0]).toMatchObject({status:'retry',reconcileRequired:false});
 kill=false;s.store.sources.setKill('linkedin_public',false);
 await drainLinkedInAlerts({store:s.store,transport,now:new Date(now.getTime()+61_000)});
 expect(s.store.linkedin.listDeliveries(transport.target)[0].status).toBe('delivered');
});

test.each(['flag','kill','description'] as const)('store %s refusal is a definite admission failure',async reason=>{
 const s=await setup('urls',reason==='description'?html.replace('Responsibilities:','Show more Responsibilities:'):html);
 const store=reason==='flag'?new JobStore(s.store.dbPath):s.store;
 if(reason==='kill')store.sources.setKill('linkedin_public',true);
 try {store.assertLinkedInDelivery(s.leadId);expect.unreachable('Admission must refuse.');}
 catch(error){expect(error).toBeInstanceOf(DiscordRouteError);expect((error as DiscordRouteError).certainty).toBe('retry');}
});

for(const backend of ['fixture','rest'] as const) for(const stage of ['alert','thread'] as const) {
 test(`${backend} ${stage} callback refusal is definite before transport mutation`,async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-admission-'));let posts=0;
  const transport=backend==='fixture'?createFixtureLinkedInTransport(path.join(dir,'journal.json'),{authorizeInitial:()=>{throw new Error('Synthetic authorization refusal.');}}):createDiscordLinkedInTransport({token:'synthetic',channelId:'12345678901234567',authorizeInitial:()=>{throw new Error('Synthetic authorization refusal.');},fetcher:async()=>{posts++;throw new Error('Unexpected POST.');}});
  const operation=stage==='alert'?transport.sendAlert({key:'synthetic',content:'Synthetic',title:'Synthetic'}):transport.createThread({messageId:'12345678901234568',title:'Synthetic'});
  await expect(operation).rejects.toMatchObject({certainty:'retry'});
  expect(posts).toBe(0);expect(fs.existsSync(path.join(dir,'journal.json'))).toBe(false);
 });
}

test.each(['alert','thread'] as const)('%s interrupted POST remains uncertain and missing readback never resends',async stage=>{
 const s=await setup();let writes=0;
 const transport=createDiscordLinkedInTransport({token:'synthetic',channelId:'12345678901234567',authorizeInitial:input=>authorizeLinkedInInitialDelivery(s.store,input),fetcher:async(url,init)=>{
  if(!init?.body) {
   if(String(url).endsWith('/users/@me'))return new Response(JSON.stringify({id:'12345678901234570'}));
   if(String(url).includes('messages?'))return new Response('[]');
   return new Response('',{status:404});
  }
  if(stage==='alert'||String(url).endsWith('/threads')){writes++;throw new Error('Synthetic interrupted write.');}
  return new Response(JSON.stringify({id:'12345678901234568',channel_id:'12345678901234567'}));
 }});
 await drainLinkedInAlerts({store:s.store,transport});
 expect(s.store.linkedin.listDeliveries(transport.target)[0]).toMatchObject({status:'uncertain',reconcileRequired:true});
 await drainLinkedInAlerts({store:s.store,transport});
 expect(s.store.linkedin.listDeliveries(transport.target)[0]).toMatchObject({status:'uncertain',reconcileRequired:true});
 expect(writes).toBe(1);
});
