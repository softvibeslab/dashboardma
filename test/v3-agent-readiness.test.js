import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';
import {nativeAgentTransport,HERMES_COMMIT,NATIVE_RUNTIME} from '../src/onboarding-v3/hermes-agent-engine.js';
test('Unix readiness requires real inference mode, exact native capability, schemas/purposes and no-history question policy (descriptor fixture)',async()=>{
 const dir=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/native-descriptor-');
 const descriptor={ready:true,bindingsHash:'b'.repeat(64),coverage:{bindingCount:1,coveredBindingCount:1},runtime:NATIVE_RUNTIME,model:'gpt-6.1-sol',modelMode:'real-provider',hermesCommit:HERMES_COMMIT,allowedTools:['authorized_context'],isolation:Object.fromEntries(['hostHomeHidden','hostWorkspacesHidden','credentialsHidden','networkDisabled','runtimeReadOnly','capabilitiesDropped'].map(k=>[k,true])),schemas:['onboarding.documentary.bounded.v2'],purposes:['summary','enrich'],contextPolicy:{questionHistory:'none',maxOriginalRefs:8}};
 const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(descriptor));});});await new Promise(r=>server.listen(dir+'/agent.sock',r));
 try{
  const transport=nativeAgentTransport({socketPath:dir+'/agent.sock',key:'synthetic-private-mediator-key-0001',authorized:true,expectedBindingsHash:'b'.repeat(64)});
  assert.equal(await transport.health('summary'),true);assert.equal(await transport.health('question'),false);
  descriptor.schemas.push('onboarding.questions.bounded.v1');descriptor.purposes.push('question');assert.equal(await transport.health('question'),true);
  descriptor.contextPolicy.questionHistory='scoped';assert.equal(await transport.health('question'),false);descriptor.contextPolicy.questionHistory='none';
  descriptor.allowedTools.push('terminal');assert.equal(await transport.health('summary'),false);descriptor.allowedTools.pop();
  descriptor.modelMode='deterministic-fixture';assert.equal(await transport.health('question'),false);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
