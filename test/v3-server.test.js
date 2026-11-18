import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';

test('V3 isolated V1 entry, protected APIs, own cookie and versioned answers',async()=>{
 const {createV3Server}=await import('../src/onboarding-v3/server.js');
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'v3-test-'));
 const server=createV3Server({authMode:'local-review',dataFile:path.join(dir,'state.json'),users:[{id:'synthetic-editor',roles:['editor','coordinator'],token:'synthetic-v3-editor-token'}]});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/dashboard/onboarding-v3';let cookie='';
 const req=(route,data,other={})=>fetch(base+route,{method:data?'POST':'GET',headers:{cookie,origin,'content-type':'application/json',...other},...(data?{body:JSON.stringify(data)}:{})});
 try{
 const html=await (await req('/')).text();assert.match(html,/Del contexto a la entrega/);assert.match(html,/onboarding-v3\/app.js/);assert.doesNotMatch(html,/src="\/dashboard\/requirements/);
 assert.equal((await req('/api/state')).status,401);
 assert.equal((await req('/api/action',{}, {origin:'https://evil.test'})).status,403);
 const login=await req('/api/login',{token:'synthetic-v3-editor-token'});cookie=login.headers.get('set-cookie').split(';')[0];assert.match(cookie,/^v3_session=/);
 const data={title:'Synthetic',owner:'synthetic-editor',context:'Manual context',questions:[{id:'Q1',question:'Entorno?',owner:'synthetic-editor',blocking:true,answer:'Fixture only',rationale:'Synthetic source'}],sources:[]};
 const saved=await (await req('/api/action',{type:'save',phase:1,revision:0,data})).json();assert.equal(saved.state.revision,1);
 assert.equal((await (await req('/api/state')).json()).state.phases[1].questions[0].answer,'Fixture only');
 assert.equal((await req('/api/action',{type:'save',phase:1,revision:0,data})).status,409);
 assert.equal(JSON.parse(await readFile(path.join(dir,'state.json'))).history.length,1);
 assert.equal((await fetch(origin+'/dashboard/onboarding-v2/api/state')).status,404);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
