import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {JobStore} from '../db/store.js';
import {captureLinkedInPublic} from './linkedin-public.js';

export function publicDeliveryEnabled(input:unknown):boolean {
  if (!input || typeof input!=='object' || Array.isArray(input) || typeof (input as Record<string,unknown>).linkedinPublicPdfDelivery!=='boolean') throw new Error('Public delivery config requires explicit linkedinPublicPdfDelivery boolean.');
  return (input as {linkedinPublicPdfDelivery:boolean}).linkedinPublicPdfDelivery;
}
function privatePath(raw:string):string {
  const resolved=path.resolve(raw);const relative=path.relative(process.cwd(),resolved);
  if (relative!== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && relative.split(path.sep)[0]!=='data') throw new Error('Private public-capture storage inside checkout must use ignored data/.');
  return resolved;
}
export async function runPublicCli(command:string,args:string[]):Promise<void> {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{db:{type:'string'},mode:{type:'string'},'run-id':{type:'string'},input:{type:'string'},'max-requests':{type:'string'},limit:{type:'string'},'user-agent':{type:'string'},'dry-run':{type:'boolean'},plain:{type:'boolean'},enabled:{type:'string'},budget:{type:'string'},operator:{type:'string'},reason:{type:'string'}}});
  if (!values.db) throw new Error('--db PRIVATE_PATH is required; reuse the authoritative source-control database.');
  const dbPath=privatePath(values.db);
  fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
  if (fs.existsSync(dbPath)) {
    const stat=fs.lstatSync(dbPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Private database must be a regular file, never a symlink.');
    fs.chmodSync(dbPath,0o600);
  } else { const descriptor=fs.openSync(dbPath,'wx',0o600);fs.closeSync(descriptor); }
  const store=new JobStore(dbPath);
  const print=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
  switch(command) {
    case 'linkedin-public-configure':
      if (!['true','false'].includes(values.enabled??'') || values.budget===undefined) throw new Error('--enabled true|false and --budget 0–25 required; kills/cooldown stay unchanged.');
      store.sources.configurePublic({enabled:values.enabled==='true',budget:Number(values.budget)});print(store.sources.state());return;
    case 'linkedin-public-state': print(store.sources.state());return;
    case 'linkedin-public-cooldown-clear':
      store.sources.clearPublicCooldown({operator:values.operator??'',reason:values.reason??''});print({cooldown:store.sources.publicControl().cooldown});return;
    case 'linkedin-public-capture': {
      if (!['search','urls'].includes(values.mode??'') || !values['run-id']) throw new Error('--mode search|urls and --run-id STABLE_ID required.');
      const maxRequests=Number(values['max-requests']??25);const limit=Number(values.limit??10);
      if (!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>25||!Number.isInteger(limit)||limit<1||limit>10) throw new Error('Requests must be 1–25 and postings 1–10.');
      const inputs=[...positionals];
      if(values.input) {
        const stat=fs.lstatSync(values.input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)throw new Error('Local ID input must be a bounded regular file.');
        inputs.push(...fs.readFileSync(values.input,'utf8').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')));
      }
      const started=Date.now();const emoji=values.plain?'':'⏳ ';
      const report=(message:string)=>process.stderr.write(`${emoji}${message.slice(0,Math.max(20,(process.stderr.columns??100)-20))} | ${Math.floor((Date.now()-started)/1000)}s\n`);
      const timer=values['dry-run']?undefined:setInterval(()=>report('LinkedIn public capture active'),5000);
      try {
        const result=await captureLinkedInPublic({store,runId:values['run-id'],mode:values.mode as 'search'|'urls',inputs,maxRequests,limit,userAgent:values['user-agent'],dryRun:values['dry-run'],progress:report});
        const counts:Record<string,number>={};for(const row of result.records)counts[row.completeness.status]=(counts[row.completeness.status]??0)+1;
        print({runId:result.runId,requestsMade:result.requestsMade,captured:result.records.length,counts,dateKnown:result.records.filter(row=>row.datePosted!==null).length,stoppedReason:result.stoppedReason,cooldownActive:store.sources.publicControl().cooldown!==null,...('plan' in result?{plan:result.plan}:{})});
        if(result.stoppedReason && result.stoppedReason!=='budget')process.exitCode=3;
      }finally{if(timer)clearInterval(timer);}
      return;
    }
    default:throw new Error('Unknown public capture command.');
  }
}
