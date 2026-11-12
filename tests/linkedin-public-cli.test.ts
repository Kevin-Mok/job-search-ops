import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {beforeAll,expect,test} from 'vitest';
beforeAll(()=>{const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{encoding:'utf8',timeout:60_000});expect(result.status,result.stdout+result.stderr).toBe(0);},60_000);
function cli(args:string[]){return spawnSync(process.execPath,['dist/src/cli.js',...args],{encoding:'utf8'});}
test('actual public CLI is offline by default and reports plan-only safe aggregates in dry-run',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-cli-'));const db=path.join(dir,'jobs.sqlite');
 const result=cli(['linkedin-public-capture','--db',db,'--mode','urls','--run-id','synthetic','--dry-run','--plain','123']);
 expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({requestsMade:0,plan:{postings:1,minIntervalSeconds:15}});
 for(const bad of [['--site','indeed'],['--proxy','http://proxy.invalid'],['--cookies','outside']])expect(cli(['linkedin-public-capture','--db',db,'--mode','urls','--run-id','synthetic','--dry-run',...bad,'123']).status).not.toBe(0);
 const held=cli(['linkedin-public-capture','--db',db,'--mode','urls','--run-id','synthetic','123']);expect(held.status).not.toBe(0);expect(held.stderr).toMatch(/kill|disabled/i);
});
test('actual CLI enables public config without clearing kills or legacy budgets, validates limits and requires Kevin attestation to clear',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-config-'));const db=path.join(dir,'jobs.sqlite');
 const result=cli(['linkedin-public-configure','--db',db,'--enabled','true','--budget','12','--plain']);expect(result.status,result.stderr).toBe(0);
 expect(JSON.parse(result.stdout)).toMatchObject({globalKilled:true,sources:{linkedin_public:{enabled:true,budget:12,killed:true},linkedin:{budget:0},indeed:{budget:0}}});
 for(const max of ['0','26','NaN'])expect(cli(['linkedin-public-capture','--db',db,'--mode','search','--run-id','synthetic','--max-requests',max,'--dry-run']).status).not.toBe(0);
 expect(cli(['linkedin-public-cooldown-clear','--db',db,'--operator','worker','--reason','Synthetic test']).status).not.toBe(0);
});
test('public CLI storage is owner-private and rejects symlink database paths',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-private-'));const db=path.join(dir,'private','jobs.sqlite');
 const result=cli(['linkedin-public-state','--db',db]);expect(result.status,result.stderr).toBe(0);expect(fs.statSync(db).mode&0o777).toBe(0o600);
 const link=path.join(dir,'link.sqlite');fs.symlinkSync(db,link);expect(cli(['linkedin-public-state','--db',link]).status).not.toBe(0);
});
