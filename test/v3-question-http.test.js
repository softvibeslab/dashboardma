import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';
import {createV3Server} from '../src/onboarding-v3/server.js';import {DocumentaryAI} from '../src/onboarding-v3/documentary-ai.js';import {fixture,actor,outputFor} from '../test-support/documentary-fixture.js';
test('HTTP durable real milestones, question suggestion and deepening never overwrite answers, exact review permissions',{timeout:15000},async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'question-http-')),file=path.join(dir,'state.json');await writeFile(file,JSON.stringify(fixture()));let release,calls=0;
 const service=new DocumentaryAI({model:'synthetic-provider',transport:async r=>{calls++;await new Promise(resolve=>release=resolve);return r.purpose==='question'?{answer:'Synthetic alternative',sourceRefs:[Object.keys(r.sourceRefs)[0]],assumptions:['Needs human confirmation'],limitations:['No live evidence'],evidence:'insufficient'}:outputFor(r);}});
 const users=[{...actor,token:'synthetic-editor-token'},{id:'synthetic-reviewer',roles:['reviewer'],token:'synthetic-reviewer-token'},{id:'synthetic-coordinator',roles:['coordinator'],token:'synthetic-coordinator-token'}];
 const server=createV3Server({dataFile:file,authMode:'local-review',staffingRequired:false,users,documentaryAI:service});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v3`;let cookie='';
 const req=async(route,data)=>{const r=await fetch(base+route,{method:data?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const login=async token=>cookie=(await req('/api/login',{token})).cookie;
 const wait=async fn=>{for(let i=0;i<200;i++){const v=(await req('/api/state')).data;if(fn(v))return v;await new Promise(r=>setTimeout(r,10));}throw Error('wait timeout');};
 try{
 assert.equal((await req('/api/questions/action',{})).status,401);await login(users[0].token);
 let v=(await req('/api/state')).data;assert.ok(v.questions?.length);const id=v.questions[0].id;
 let r=await req('/api/hermes/enrich',{revision:1,executionId:'progress-synthetic-001'});assert.equal(r.status,202);assert.equal(r.data.execution.progress.stage,'received');
 await wait(v=>v.hermes.execution.progress.stage==='waiting-model');let disk=JSON.parse(await readFile(file));assert.ok(disk.aiExecutions[0].progress.updatedAt);release();v=await wait(v=>v.hermes.execution.status!=='in-progress');assert.equal(v.hermes.execution.progress.stage,'completed');assert.deepEqual(v.hermes.execution.progress.events.map(e=>e.stage),['received','context-prepared','waiting-model','validating','persisting','completed']);
 const q=v.questions[0],input={id:q.id,revision:v.state.revision,executionId:'question-synthetic-001',instructions:'Clarify keyboard assumptions',sourceRefs:[Object.keys(service.preview(v.state).sourceRefs)[0]]};
 r=await req('/api/questions/generate',input);assert.equal(r.status,202);await wait(v=>v.hermes.execution.progress.stage==='waiting-model');assert.equal((await req('/api/questions/generate',input)).status,202);release();v=await wait(v=>v.hermes.execution.status!=='in-progress');assert.equal(v.questions[0].answer,'');assert.equal(v.questions[0].suggestions.length,1);assert.equal(calls,2);
 assert.equal((await req('/api/questions/generate',{...input,instructions:'changed'})).status,409);
 assert.equal((await req('/api/questions/action',{revision:v.state.revision,id:q.id,type:'assign',responder:actor.id,reviewer:users[1].id})).status,403);
 await login(users[2].token);r=await req('/api/questions/action',{revision:v.state.revision,id:q.id,type:'assign',responder:actor.id,reviewer:users[1].id});assert.equal(r.status,200);v=r.data;
 await login(users[0].token);r=await req('/api/questions/action',{revision:v.state.revision,id:q.id,type:'answer',text:'Human decision',rationale:'Human evidence',status:'ready-review'});assert.equal(r.status,200);v=r.data;
 await login(users[1].token);const target=v.questions[0];r=await req('/api/questions/action',{revision:v.state.revision,id:q.id,type:'approve',version:target.version,answerHash:target.answerHash,questionHash:target.questionHash});assert.equal(r.status,200);assert.equal(r.data.questions[0].status,'approved');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
