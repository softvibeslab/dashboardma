import test from 'node:test';
import assert from 'node:assert/strict';

test('agent context capability is scoped by trusted grants, not prompt project names',async()=>{
 const {ContextCapability}=await import('../src/onboarding-v3/hermes-agent-engine.js');
 const cap=new ContextCapability({grants:[{actor:'actor-a',org:'synthetic',project:'alpha',caseId:'case-1'}],sources:[{id:'alpha-guide',org:'synthetic',project:'alpha',ref:'fixture-v1',kind:'repository',text:'Alpha guide'},{id:'beta-guide',org:'synthetic',project:'beta',ref:'fixture-v1',kind:'graphify',text:'Beta private'},{id:'ecosystem-guide',org:'common',project:'ecosystem',ref:'2026-01-01T00:00:00Z',kind:'ecosystem',text:'Common reviewed guidance'}]});
 assert.deepEqual(cap.retrieve({actor:'actor-a',org:'synthetic',project:'alpha',caseId:'case-1'}).map(x=>x.id),['alpha-guide','ecosystem-guide']);
 assert.throws(()=>cap.retrieve({actor:'actor-a',org:'synthetic',project:'beta',caseId:'case-1'}),/scope-denied/);
});

test('scope resolver binds actor and persisted exact snapshot, not browser input',async()=>{
 const {scopeResolverFromBindings}=await import('../src/onboarding-v3/hermes-agent-engine.js');
 const scope={actor:'fixture-actor',org:'synthetic',project:'alpha',caseId:'workitem-900001'};
 const resolve=scopeResolverFromBindings([{...scope,sourceHash:'a'.repeat(64)}]);
 assert.deepEqual(resolve({actor:{id:scope.actor,authenticated:true},state:{azureIntakes:[{sourceHash:'a'.repeat(64)}]}}),scope);
 assert.throws(()=>resolve({actor:{id:scope.actor,authenticated:true},state:{azureIntakes:[{sourceHash:'b'.repeat(64)}]}}),/scope-denied/);
});

test('V3 adapter is fail-closed without an authorized native mediator',async()=>{
 const {HermesAgentEngine}=await import('../src/onboarding-v3/hermes-agent-engine.js');
 const service=new HermesAgentEngine();
 assert.equal(service.configured(),false);
 assert.equal(await service.available(),false);
 assert.throws(()=>new HermesAgentEngine({scopeResolver:'browser-controlled'}),/scope-resolver/);
 const transport=async()=>{};transport.health=async()=>true;
 const configured=new HermesAgentEngine({transport,scopeResolver:()=>({})});
 assert.equal(await configured.available('summary'),true);
 assert.equal(await configured.available('question'),false,'Unimplemented question purpose must remain disabled after branch merge');
 assert.equal(configured.engine.kind,'hermes-agent');
});

test('documentary adapter binds native evidence and keeps context refs separate from Azure evidence (injected fixture)',async()=>{
 const {HermesAgentEngine,HERMES_COMMIT,NATIVE_RUNTIME}=await import('../src/onboarding-v3/hermes-agent-engine.js');
 const {fixture,actor,outputFor}=await import('../test-support/documentary-fixture.js');
 const {applyDocumentary}=await import('../src/onboarding-v3/documentary-ai.js');
 const scope={actor:actor.id,org:'synthetic',project:'alpha',caseId:'case-1'};const state=fixture();let mode='valid',seen;
 // Injected protocol fixture ONLY. No provider request is made by this unit test.
 const transport=async request=>{seen=request;const prompt=JSON.parse(request.prompt);return {runtime:NATIVE_RUNTIME,hermesCommit:HERMES_COMMIT,model:'gpt-6.1-sol',modelMode:mode==='fixture'?'deterministic-fixture':'real-provider',allowedTools:['authorized_context'],isolation:Object.fromEntries(['hostHomeHidden','hostWorkspacesHidden','credentialsHidden','networkDisabled','runtimeReadOnly','capabilitiesDropped'].map(k=>[k,true])),executionId:request.executionId,inputHash:mode==='binding'?'x'.repeat(64):request.inputHash,sourceHash:request.sourceHash,tools:mode==='no-tools'?[]:[{toolCallId:'injected-test-call',name:'authorized_context',status:'executed',sources:[{id:'alpha-guide',org:'synthetic',project:'alpha',kind:'repository',ref:'fixture-v1',contentHash:'c'.repeat(64)}]}],answer:JSON.stringify({documentary:outputFor(prompt),contextCitations:[mode==='bad-citation'?'unseen':'alpha-guide']})};};
 transport.health=async()=>true;const service=new HermesAgentEngine({transport,scopeResolver:()=>scope});
 const input={revision:1,purpose:'summary',executionId:'fixture-native-adapter-0001'};
 const stages=[];const result=await service.generate(state,actor,input,async stage=>stages.push(stage));assert.deepEqual(stages,['context-prepared','waiting-model','validating']);assert.equal(result.runtime,NATIVE_RUNTIME);assert.deepEqual(seen.scope,scope);assert.equal(result.agentEvidence.tools[0].toolCallId,'injected-test-call');
 const next=applyDocumentary(state,result,actor);assert.equal(next.aiSummaries[0].status,'generated-pending-review');assert.deepEqual(next.azureIntakes,state.azureIntakes);
 for(mode of ['binding','fixture','no-tools','bad-citation'])await assert.rejects(service.generate(state,actor,input),/native-agent-(evidence|citations)/);
});

test('actual Unix mediator runs native tool with synthetic model and refuses to advertise it as real inference',async()=>{
 const {mkdtemp,writeFile,stat,rm}=await import('node:fs/promises');const {spawn}=await import('node:child_process');const {randomBytes}=await import('node:crypto');
 const {nativeAgentTransport,NATIVE_RUNTIME}=await import('../src/onboarding-v3/hermes-agent-engine.js');
 const directory=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/v3-agent-http-');
 const scope={actor:'fixture-actor',org:'synthetic',project:'alpha',caseId:'case-1'},key=randomBytes(32).toString('hex');
 await writeFile(directory+'/manifest.json',JSON.stringify({grants:[{...scope,sourceHash:'b'.repeat(64)}],sources:[{id:'alpha-guide',org:'synthetic',project:'alpha',ref:'fixture-v1',kind:'repository',text:'Synthetic human review guidance.'}]}),{mode:0o600});await writeFile(directory+'/key',key,{mode:0o600});
 const child=spawn('python3',['scripts/v3-hermes-agent-broker.py','--directory',directory,'--manifest',directory+'/manifest.json','--key-file',directory+'/key'],{stdio:['ignore','ignore','pipe']});let diagnostic='';child.stderr.on('data',x=>diagnostic+=x);
 try{
  let ready=false;for(let i=0;i<120;i++){try{await stat(directory+'/agent.sock');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,diagnostic);
  const transport=nativeAgentTransport({socketPath:directory+'/agent.sock',key,authorized:true});assert.equal(await transport.health(),false,'Synthetic model must not be advertised as real provider');
  const request={executionId:'fixture-http-execution-0001',scope,prompt:'Synthetic only: what is required before release?',inputHash:'a'.repeat(64),sourceHash:'b'.repeat(64)};
  const result=await transport(request);assert.equal(result.runtime,NATIVE_RUNTIME);assert.equal(result.modelMode,'deterministic-fixture');assert.equal(result.providerRequests,0);assert.equal(result.inferenceRequests,2);assert.equal(result.tools[0].status,'executed');assert.equal(result.tools[0].sources[0].id,'alpha-guide');assert.deepEqual(await transport(request),result,'Durable replay');
  await assert.rejects(transport({...request,scope:{...scope,project:'beta'}}),/unavailable/);
  const wrong=nativeAgentTransport({socketPath:directory+'/agent.sock',key:'x'.repeat(32),authorized:true});assert.equal(await wrong.health(),false);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
});
