#!/usr/bin/env node
// Synthetic offline executable proof; never imports a live transport or mailbox client.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseArgs} from 'node:util';
import {JobStore} from '../dist/src/db/store.js';
import {captureLinkedInPublic} from '../dist/src/core/linkedin-public.js';
import {drainLinkedInAlerts} from '../dist/src/core/linkedin-route.js';
import {processLinkedInWork,postingVersion,attachLinkedInResume,authorizeLinkedInInitialDelivery} from '../dist/src/core/job-workflow.js';
import {createFixtureLinkedInTransport} from '../dist/src/discord/linkedin-transport.js';
const {values}=parseArgs({options:{dir:{type:'string'},phase:{type:'string'},'portfolio-root':{type:'string'},'approve-visual':{type:'boolean'},plain:{type:'boolean'}}});
const label=(emoji,message)=>`${values.plain?'':emoji+' '}${message}`;
try {
 if(!values.dir||!['capture','prepare','attach','verify'].includes(values.phase))throw new Error('--dir NEW_PRIVATE_DIRECTORY and --phase capture|prepare|attach|verify required. Build first.');
 const dir=path.resolve(values.dir);const sentinel=path.join(dir,'synthetic-public-demo.json');
 if(!fs.existsSync(dir)){fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(sentinel,'{"synthetic":true,"schema":1}\n',{mode:0o600,flag:'wx'});}
 else if(!fs.existsSync(sentinel)||fs.readFileSync(sentinel,'utf8')!=='{"synthetic":true,"schema":1}\n')throw new Error('Existing directory is not this synthetic demo; preserved. Choose a fresh directory.');
 const store=new JobStore(path.join(dir,'synthetic.sqlite'),{linkedinPublicPdfDelivery:true});const journal=path.join(dir,'mock-discord.json');const transport=createFixtureLinkedInTransport(journal,{authorizeInitial:input=>authorizeLinkedInInitialDelivery(store,input)});
 const report=message=>console.error(label('⏳',message));const started=Date.now();const timer=setInterval(()=>report(`Synthetic ${values.phase} active | ${Math.floor((Date.now()-started)/1000)}s`),5000);
 try {
  if(values.phase==='capture'){
   store.sources.configurePublic({enabled:true,budget:25});store.sources.setKill('global',false);store.sources.setKill('linkedin_public',false);
   let now=Date.parse('2026-11-12T12:00:00Z');const html=fs.readFileSync(new URL('../fixtures/linkedin-public/posting.html',import.meta.url),'utf8');
   const result=await captureLinkedInPublic({store,runId:'synthetic-demo',mode:'urls',inputs:['111111','222222'],now:()=>now,sleep:async ms=>{now+=ms;},request:async()=>({status:200,body:html}),progress:report});
   await drainLinkedInAlerts({store,transport});
   for(const id of result.leadIds){const lead=store.getLead(id);store.work.decideEligibility({leadId:id,postingVersion:postingVersion(lead),eligibility:'eligible',reason:'Synthetic demo fixture requirements reviewed; no real authorization.'});}
   console.log(JSON.stringify({synthetic:true,requests:result.requestsMade,captured:result.records.length,accepted:result.records.filter(row=>row.completeness.status==='complete').length,dateKnown:result.records.filter(row=>row.datePosted).length,threads:Object.keys(JSON.parse(fs.readFileSync(journal,'utf8')).threads).length},null,2));
  }else if(values.phase==='prepare'){
   if(!values['portfolio-root'])throw new Error('--portfolio-root PINNED_ASSETS required.');
   const candidate=JSON.parse(fs.readFileSync(new URL('../fixtures/resume/representative-candidate.json',import.meta.url),'utf8'));
   const evidence=JSON.parse(fs.readFileSync(new URL('../fixtures/resume/representative-evidence.json',import.meta.url),'utf8'));
   const works=await processLinkedInWork({store,transport,privateDir:dir,candidate,evidence,portfolioRoot:values['portfolio-root'],linkedinPublicPdfDelivery:true});
   if(works.length!==2||works.some(work=>!['awaiting_visual_review','delivered'].includes(work.status)))throw new Error('Synthetic preparation held; inspect local work state.');
   console.log(JSON.stringify({synthetic:true,work:works.map(work=>({workId:work.workId,status:work.status,sha256:work.artifact.sha256,previewPath:work.artifact.previewPath,pdfPath:work.artifact.pdfPath,geometry:work.artifact.layoutMeasurement}))},null,2));
  }else if(values.phase==='attach'){
   if(!values['approve-visual']||!values['portfolio-root'])throw new Error('Inspect the exact synthetic previews; then pass --approve-visual and --portfolio-root.');
   for(const work of store.work.list()){if(!work.artifact)throw new Error('Prepare first.');await attachLinkedInResume({store,transport,workId:work.workId,approvedSha256:work.artifact.sha256,portfolioRoot:values['portfolio-root'],linkedinPublicPdfDelivery:true});}
   console.log(JSON.stringify({synthetic:true,delivered:store.work.list().filter(work=>work.status==='delivered').length},null,2));
  }else{
   const remote=JSON.parse(fs.readFileSync(journal,'utf8'));const work=store.work.list();
   if(work.length!==2||Object.keys(remote.threads).length!==2||Object.keys(remote.entries??{}).length!==4)throw new Error('Expected two threads, two fit notes and two PDF receipts.');
   for(const row of work){const entry=remote.entries[row.attachmentDelivery?.key];if(row.status!=='delivered'||entry?.threadId!==row.threadId||entry.sha256!==row.artifact.sha256)throw new Error('PDF/posting/thread receipt mismatch.');const copy=path.join(dir,`fixture-${row.attachmentDelivery.key}-${entry.filename}`);if(crypto.createHash('sha256').update(fs.readFileSync(copy)).digest('hex')!==row.artifact.sha256)throw new Error('Copied PDF hash mismatch.');}
   console.log(JSON.stringify({synthetic:true,threads:2,fitNotes:2,matchingPdfs:2,liveLinkedInRequests:0,liveDiscordSends:0,liveGmailCalls:0},null,2));
  }
 }finally{clearInterval(timer);}
}catch(error){console.error(label('❌',error.message));process.exitCode=1;}
