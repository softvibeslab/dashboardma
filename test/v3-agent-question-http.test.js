import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {createV3Server} from '../src/onboarding-v3/server.js';import {fixture,actor} from '../test-support/documentary-fixture.js';import {nativeQuestionHarness} from '../test-support/native-question-fixture.js';
test('HTTP native fixture: selected question alternative, actual tool trace, baseline/deepen, terminal replay and unchanged approvals',{timeout:60000},async()=>{
 const state=fixture(),q=state.phases[1].questions[0];q.answer='Saved human baseline';q.rationale='Original human rationale';
 const h=await nativeQuestionHarness(state),file=h.directory+'/state.json';await writeFile(file,JSON.stringify(state));
 const server=createV3Server({dataFile:file,authMode:'local-review',staffingRequired:false,users:[{...actor,name:'Synthetic Editor',token:'synthetic-native-question-token'},{...actor,id:'fixture-unbound-editor',name:'Synthetic Unbound Editor',token:'synthetic-native-unbound-token'}],documentaryAI:h.service});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v3`;let cookie='';
 const req=async(route,data)=>{const r=await fetch(base+route,{method:data?'POST':'GET',headers:{cookie,origin:new URL(base).origin,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const wait=async()=>{for(let i=0;i<300;i++){const view=(await req('/api/state')).value;if(view.hermes.execution?.status!=='in-progress')return view;await new Promise(r=>setTimeout(r,30));}throw Error('native fixture timeout');};
 try{
  cookie=(await req('/api/login',{token:'synthetic-native-question-token'})).cookie;
  let view=(await req('/api/state')).value;assert.equal(view.questionAI.configured,true);assert.match(view.questionAI.engine.label,/sintético/);
  const selected=Object.keys(view.questionAI.sourceRefs).find(x=>x.endsWith(':title'));
  const input={id:q.id,revision:state.revision,executionId:'native-http-question-0001',instructions:'Aclarar sin aprobar',sourceRefs:[selected]};
  const accepted=await req('/api/questions/generate',input);assert.equal(accepted.status,202);assert.equal(accepted.value.execution.progress.stage,'received');
  view=await wait();assert.equal(view.hermes.execution.status,'real',JSON.stringify(view.hermes.execution));assert.deepEqual(view.hermes.execution.progress.events.map(e=>e.stage),['received','context-prepared','waiting-model','validating','persisting','completed']);
  let suggestion=view.questions[0].suggestions[0];assert.equal(suggestion.status,'alternative-not-applied');assert.equal(suggestion.runtime,'synthetic-test-transport');assert.equal(suggestion.agentEvidence.nativeRuntime,'hermes-native-sealed-v1');assert.equal(suggestion.agentEvidence.tools[0].status,'executed');assert.equal(view.questions[0].answer,q.answer);assert.equal(view.questions[0].decisions.length,0);
  assert.equal(h.results[0].historyMessages,0);assert.deepEqual(Object.keys(JSON.parse(h.requests[0].prompt).sourceRefs),[selected]);
  assert.equal((await req('/api/questions/generate',input)).status,200);assert.equal(h.requests.length,1);
  assert.equal((await req('/api/questions/generate',{...input,instructions:'changed'})).status,409);
  let saved=await req('/api/questions/action',{id:q.id,revision:view.state.revision,type:'answer',text:'Updated human saved answer',rationale:'New rationale',status:'draft'});assert.equal(saved.status,200);view=saved.value;
  const second=await req('/api/questions/generate',{...input,revision:view.state.revision,executionId:'native-http-question-0002'});assert.equal(second.status,202);view=await wait();assert.equal(view.hermes.execution.status,'real',JSON.stringify(view.hermes.execution));
  assert.equal(view.questions[0].answer,'Updated human saved answer');assert.equal(view.questions[0].suggestions.length,2);assert.equal(view.questions[0].suggestions[1].derivatives.question.currentAnswer,'Updated human saved answer');assert.equal(h.results[1].historyMessages,0);assert.notEqual(h.requests[0].contextKey,h.requests[1].contextKey);
  for(const [route,purpose] of [['/api/ai/summary','summary'],['/api/hermes/enrich','enrich']]){
   assert.equal((await req(route,{revision:view.state.revision,executionId:'native-http-'+purpose+'-0001'})).status,202);view=await wait();assert.equal(view.hermes.execution.status,'real',JSON.stringify(view.hermes.execution));
   assert.equal(h.results.at(-1).purpose,purpose);assert.equal(h.results.at(-1).providerRequests,0);assert.equal(h.results.at(-1).tools[0].status,'executed');
  }
  const disk=JSON.parse(await readFile(file));assert.equal(disk.questionRecords[q.id].decisions.length,0);assert.equal(disk.questionRecords[q.id].versions.length,1);assert.deepEqual(disk.azureIntakes,state.azureIntakes);
  const boundCalls=h.requests.length;cookie=(await req('/api/login',{token:'synthetic-native-unbound-token'})).cookie;view=(await req('/api/state')).value;
  assert.equal(view.questionAI.configured,false);assert.equal(view.hermes.configured,false);assert.equal(view.questionAI.contextStatus,'scope-not-authorized-for-intake');assert.match(view.questionAI.engine.label,/contexto no autorizado/);
  for(const [route,purpose] of [['/api/ai/summary','summary'],['/api/hermes/enrich','enrich'],['/api/questions/generate','question']])assert.equal((await req(route,{revision:view.state.revision,executionId:'native-denied-'+purpose+'-0001',...(purpose==='question'?{id:q.id,sourceRefs:[selected]}:{})})).status,503);
  assert.equal(h.requests.length,boundCalls,'Unbound actor must never queue model or tool execution');
 }finally{await new Promise(r=>server.close(r));await h.close();}
});
