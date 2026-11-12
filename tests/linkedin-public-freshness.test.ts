import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect,test,vi} from 'vitest';
import {JobStore} from '../src/db/store.js';
import {captureLinkedInPublic,parsePublicPosting,PUBLIC_USER_AGENT} from '../src/core/linkedin-public.js';
import {ingestLinkedInEmail} from '../src/core/linkedin-route.js';
import type {EmailFixture} from '../src/core/types.js';

const html=fs.readFileSync('fixtures/linkedin-public/source.html','utf8');
const envelope=JSON.parse(fs.readFileSync('fixtures/email/linkedin-alert-2026-03-12.json','utf8')) as EmailFixture;
const url='https://www.linkedin.com/jobs/view/123';
const at=(hour:string)=>`2026-11-12T${hour}:00.000Z`;
function setup(mode:'urls'|'search') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-freshness-'));
 const store=new JobStore(path.join(dir,'jobs.sqlite'));
 store.sources.configurePublic({enabled:true,budget:25});store.sources.setKill('global',false);store.sources.setKill('linkedin_public',false);
 const email=(messageId:string,receivedAt:string)=>ingestLinkedInEmail(store,{...envelope,messageId,receivedAt,textBody:[
  'Title: Software Engineer','Company: Synthetic Systems','Location: Toronto, Ontario, Canada',
  'Work model: Unknown','Seniority: Unknown','Skills: TypeScript',`View Job: ${url}`,
  `Description: Synthetic snippet ${messageId}.`
 ].join('\n')},{fixture:true});
 const capture=async(runId:string,capturedAt:string,body=html,replay=false)=>{
  let time=Date.parse(capturedAt);
  const result=await captureLinkedInPublic({store,runId,mode,inputs:mode==='urls'?['123']:[],now:()=>time,sleep:async ms=>{time+=ms;},request:async requestUrl=>{
   if(replay)throw new Error('Synthetic replay must not request.');
   return {status:200,body:requestUrl.includes('seeMoreJobPostings')?'<a href="/jobs/view/123">Synthetic</a>':body};
  }});
  expect(result.stoppedReason).toBeNull();
  return result;
 };
 const save=(runId:string,capturedAt:string)=>{
  store.sources.savePublicCapture(runId,'123',parsePublicPosting(html,'123',capturedAt));
  if(mode==='search') {
   store.sources.acquirePublic(runId,'synthetic-owner',25,10,JSON.stringify({mode,ids:[],userAgent:PUBLIC_USER_AGENT}));
   store.sources.savePublicDiscovery(runId,['123']);store.sources.releasePublic('synthetic-owner');
  }
 };
 return {store,email,capture,save};
}

for(const mode of ['urls','search'] as const) {
 test(`${mode} full public capture survives a delayed email and duplicate replay`,async()=>{
  const s=setup(mode);const {leadIds:[id]}=s.email('synthetic-first',at('10:00'));
  await s.capture('synthetic-public',at('11:00'));
  const full=s.store.getLead(id)!;const description=s.store.descriptions.accepted(id);
  const observation=s.store.linkedin.latestPosting(url);
  expect(observation?.leadId).toBe(id);expect(Date.parse(observation!.receivedAt)).toBeGreaterThanOrEqual(Date.parse(at('11:00')));
  s.email('synthetic-delayed',at('10:30'));
  expect(s.store.getLead(id)).toEqual(full);expect(s.store.descriptions.accepted(id)).toEqual(description);
  await s.capture('synthetic-public',at('13:00'),html,true);
  expect(s.store.linkedin.latestPosting(url)).toEqual(observation);
  expect(s.store.descriptions.history(id)).toEqual([description]);
 });
 test(`${mode} saved capture recovery records freshness before delayed email ingestion`,async()=>{
  const s=setup(mode);const {leadIds:[id]}=s.email('synthetic-first',at('10:00'));
  s.save('synthetic-recovery',at('11:00'));
  await s.capture('synthetic-recovery',at('12:00'),html,true);
  const full=s.store.getLead(id)!;const description=s.store.descriptions.accepted(id);
  s.email('synthetic-delayed',at('10:30'));
  expect(s.store.getLead(id)).toEqual(full);expect(s.store.descriptions.accepted(id)).toEqual(description);
  expect(s.store.linkedin.latestPosting(url)).toEqual({leadId:id,receivedAt:at('11:00')});
 });
 test(`${mode} older saved public capture cannot replace a newer email observation`,async()=>{
  const s=setup(mode);const {leadIds:[id]}=s.email('synthetic-newer',at('12:00'));
  const lead=s.store.getLead(id)!;
  s.save('synthetic-older',at('11:00'));
  await s.capture('synthetic-older',at('13:00'),html,true);
  expect(s.store.getLead(id)).toEqual(lead);
  expect(s.store.linkedin.latestPosting(url)).toEqual({leadId:id,receivedAt:at('12:00')});
  expect(s.store.descriptions.history(id)).toEqual([]);
 });
 test(`${mode} duplicate historical replay preserves the newer public observation and hold`,async()=>{
  const s=setup(mode);
  const {leadIds:[id]}=await s.capture('synthetic-old-ingested',at('11:00'));
  await s.capture('synthetic-latest-held',at('12:00'),html.replace('Responsibilities:','Show more Responsibilities:'));
  const lead=s.store.getLead(id)!;const history=s.store.descriptions.history(id);const observation=s.store.linkedin.latestPosting(url);
  await s.capture('synthetic-old-ingested',at('13:00'),html,true);
  expect(s.store.getLead(id)).toEqual(lead);expect(s.store.descriptions.history(id)).toEqual(history);
  expect(s.store.descriptions.current(id)).toEqual(history.at(-1));expect(s.store.linkedin.latestPosting(url)).toEqual(observation);
  expect(()=>s.store.descriptions.accepted(id)).toThrow(/held: partial/);
 });
 test(`${mode} older saved full capture cannot promote a newer description hold`,async()=>{
  const s=setup(mode);
  const {leadIds:[id]}=await s.capture('synthetic-held',at('12:00'),html.replace('Responsibilities:','Show more Responsibilities:'));
  const held=s.store.descriptions.current(id)!;expect(held.status).toBe('partial');
  const lead=s.store.getLead(id)!;const observation=s.store.linkedin.latestPosting(url);
  s.save('synthetic-old-full',at('11:00'));
  await s.capture('synthetic-old-full',at('13:00'),html,true);
  expect(s.store.getLead(id)).toEqual(lead);expect(s.store.descriptions.current(id)).toEqual(held);
  expect(s.store.descriptions.history(id)).toEqual([held]);expect(s.store.linkedin.latestPosting(url)).toEqual(observation);
  expect(()=>s.store.descriptions.accepted(id)).toThrow(/held: partial/);
 });
}

test('public observation and lead update roll back together when description persistence fails',async()=>{
 const s=setup('urls');const {leadIds:[id]}=s.email('synthetic-first',at('10:00'));
 const lead=s.store.getLead(id)!;const messages=s.store.linkedin.listMessages();
 const spy=vi.spyOn(s.store.descriptions,'capturePublic').mockImplementation(()=>{throw new Error('Synthetic description persistence failure.');});
 try {await expect(s.capture('synthetic-atomic',at('11:00'))).rejects.toThrow('Synthetic description persistence failure.');}
 finally {spy.mockRestore();}
 expect(s.store.getLead(id)).toEqual(lead);expect(s.store.linkedin.listMessages()).toEqual(messages);
 expect(s.store.linkedin.latestPosting(url)).toEqual({leadId:id,receivedAt:at('10:00')});
 await s.capture('synthetic-atomic',at('12:00'),html,true);
 expect(s.store.descriptions.accepted(id).status).toBe('complete');
 expect(s.store.linkedin.latestPosting(url)).toEqual({leadId:id,receivedAt:at('11:00')});
});
