import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('SSO intake rejects unassigned/expired sessions, hostile origin; source failure is atomic and concurrent imports serialize',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'v2-intake-sso-'));let failure=true,reads=0;
 const connector=new AzureIntake({token:'private-synthetic',allowedIds:[17],fetcher:async url=>{reads++;if(failure)return new Response('do-not-leak-private-synthetic',{status:401});return Response.json(String(url).includes('/comments')?{comments:[]}:{id:17,rev:1,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Test'},relations:[]});}});
 const secret='synthetic-session-secret';const server=createV2Server({dataFile:path.join(dir,'state.json'),authMode:'sso',sessionSecret:secret,publicOrigin:'https://example.test',users:[{id:'coordinator',tid:'tenant',oid:'oid',roles:['coordinator']}],azureIntake:connector});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const cookie=(oid='oid',exp=Math.floor(Date.now()/1000)+600)=>{const body=Buffer.from(JSON.stringify({tid:'tenant',oid,exp})).toString('base64url');return `ma_ct_session=${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;};
 const post=(session=cookie(),origin='https://example.test')=>fetch(`http://127.0.0.1:${server.address().port}/api/azure/import`,{method:'POST',headers:{cookie:session,origin,'content-type':'application/json'},body:JSON.stringify({id:17,revision:0})});
 try{
 assert.equal((await post(cookie('unknown'))).status,403);assert.equal((await post(cookie('oid',1))).status,401);assert.equal((await post(cookie(),'https://evil.test')).status,403);assert.equal(reads,0);
 const failed=await post();assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('private-synthetic'));await assert.rejects(()=>readFile(path.join(dir,'state.json')),{code:'ENOENT'});
 failure=false;const pair=await Promise.all([post(),post()]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
 const persisted=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));assert.equal(persisted.revision,1);assert.equal(persisted.azureIntakes.length,1);assert.equal(reads,3);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('authenticated intake creates a documentary version, preserves original, locks revision and requires replacement confirmation',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'v2-intake-'));
 const snapshot={root:{id:17,rev:3,fields:{'System.Title':'Synthetic title','System.Description':'Original <b>reported</b> issue','System.TeamProject':'agileNestCorp'},comments:{items:[],status:'read'},relations:[],attachments:[],fetchedAt:'2026-01-01T00:00:00Z'},children:[],warnings:['No environment verified'],fetchedAt:'2026-01-01T00:00:00Z'};
 let reads=0;const azureIntake={configured:()=>true,read:async()=>{reads++;return structuredClone(snapshot);}};
 const server=createV2Server({dataFile:path.join(dir,'state.json'),users:[{id:'editor',token:'synthetic-editor-key',roles:['editor']},{id:'reader',token:'synthetic-reader-key',roles:[]}],azureIntake});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 let cookie='';const req=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{origin:base,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 assert.equal((await req('/api/azure/import',{id:17,revision:0})).status,401);assert.equal(reads,0);
 cookie=(await req('/api/login',{token:'synthetic-reader-key'})).cookie;
 assert.equal((await req('/api/azure/import',{id:17,revision:0})).status,403);assert.equal(reads,0);
 cookie=(await req('/api/login',{token:'synthetic-editor-key'})).cookie;
 const imported=await req('/api/azure/import',{id:17,revision:0});assert.equal(imported.status,200,'import route must exist');
 assert.equal(imported.data.state.revision,1);assert.equal(imported.data.state.phases[1].title,'Synthetic title');
 assert.equal(imported.data.state.azureIntakes[0].snapshot.root.rev,3);assert.equal(imported.data.state.azureIntakes[0].generation,'documentary-deterministic-v1');
 assert.equal(imported.data.integrations.ai,'not-run');assert.equal(imported.data.state.history.length,1);
 assert.equal((await req('/api/azure/import',{id:17,revision:0,confirmReplace:true})).status,409);
 assert.equal((await req('/api/azure/import',{id:17,revision:1})).status,409);
 const saved=await req('/api/action',{type:'save',phase:1,revision:1,data:{...imported.data.state.phases[1],context:'Human draft'}});assert.equal(saved.status,200);
 const replaced=await req('/api/azure/import',{id:17,revision:2,confirmReplace:true});assert.equal(replaced.status,200);assert.equal(replaced.data.state.azureIntakes.length,2);
 assert.equal(replaced.data.state.history.at(-1).phases[1].context,'Human draft');
 assert.equal((await req('/api/action',{type:'azure.import',revision:3,snapshot})).status,400,'cannot inject source through generic action');
 assert.equal((await req('/api/azure/publish',{revision:3})).status,404);
 assert.equal(JSON.parse(await readFile(path.join(dir,'state.json'),'utf8')).azureIntakes[0].snapshot.root.fields['System.Description'],snapshot.root.fields['System.Description']);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
