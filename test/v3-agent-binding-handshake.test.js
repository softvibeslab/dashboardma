import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {bindingSetHash,nativeAgentTransport,HERMES_COMMIT,NATIVE_RUNTIME} from '../src/onboarding-v3/hermes-agent-engine.js';
import {documentaryAIFromEnvironment} from '../src/onboarding-v3/native-agent-startup.js';
test('startup handshake binds exact operator grants to app bindings; no normalization, no inference (descriptor fixture)',async()=>{
 const bindings=[{actor:'entra:tenant:opaque-oid',org:'Organización autorizada',project:'Proyecto Android',caseId:'workitem:900001',sourceHash:'a'.repeat(64)}];
 const expected=bindingSetHash(bindings),python=spawnSync('python3',['-c',`import importlib.util,json,sys;spec=importlib.util.spec_from_file_location('broker','scripts/v3-hermes-agent-broker.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(m.binding_set_hash(json.loads(sys.argv[1])))`,JSON.stringify(bindings)],{encoding:'utf8'});
 assert.equal(python.status,0,python.stderr);assert.equal(python.stdout.trim(),expected);
 const root=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/native-binding-handshake-'),key='synthetic-mediator-private-key-00000001';
 const descriptor={ready:true,bindingsHash:'0'.repeat(64),runtime:NATIVE_RUNTIME,model:'gpt-6.1-sol',modelMode:'real-provider',hermesCommit:HERMES_COMMIT,allowedTools:['authorized_context'],isolation:Object.fromEntries(['hostHomeHidden','hostWorkspacesHidden','credentialsHidden','networkDisabled','runtimeReadOnly','capabilitiesDropped'].map(k=>[k,true])),schemas:['onboarding.documentary.bounded.v2','onboarding.questions.bounded.v1'],purposes:['summary','enrich','question'],contextPolicy:{questionHistory:'none',maxOriginalRefs:8},coverage:{sourceCount:1,bindingCount:1,coveredBindingCount:1,allProjectsIndexed:false}};
 let calls=0;const server=http.createServer((req,res)=>{calls++;assert.equal(req.url,'/health');req.resume();req.on('end',()=>res.end(JSON.stringify(descriptor)));});await new Promise(r=>server.listen(root+'/agent.sock',r));
 try{
  await writeFile(root+'/bindings.json',JSON.stringify(bindings),{mode:0o600});await writeFile(root+'/key',key,{mode:0o600});
  const env={V3_NATIVE_AGENT_AUTHORIZED:'true',V3_NATIVE_AGENT_BINDINGS_FILE:root+'/bindings.json',V3_NATIVE_AGENT_KEY_FILE:root+'/key',V3_NATIVE_AGENT_SOCKET:root+'/agent.sock'},existing={model:'existing-controlled'};
  assert.equal((await documentaryAIFromEnvironment(existing,env)).documentaryAI,existing);
  descriptor.bindingsHash=expected;assert.equal((await documentaryAIFromEnvironment(existing,env)).selection,'native-ready');
  descriptor.ready=false;assert.equal((await documentaryAIFromEnvironment(existing,env)).documentaryAI,existing);
  assert.ok(calls>0);assert.equal((await documentaryAIFromEnvironment(existing,{V3_NATIVE_AGENT_AUTHORIZED:'true'})).gate,'native-bindings-unconfigured');
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
