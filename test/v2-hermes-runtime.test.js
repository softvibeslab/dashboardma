import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../src/onboarding-v2/hermes-broker-service.js';
test('worker runs in kernel namespaces with host memory and Hermes code hidden',async()=>{
 const runtime=new mod.StatelessCodexRuntime({authorized:true,model:'gpt-6.1-sol'});
 assert.equal(typeof runtime.audit,'function');
 const audit=await runtime.audit();
 assert.deepEqual(audit,{isolatedPython:true,noSite:true,hostMemoriesHidden:true,hermesCodeHidden:true,readOnlyAuth:true});
});
test('stateless runtime requires explicit authorization and fixed provider/model',()=>{
 assert.equal(typeof mod.StatelessCodexRuntime,'function');
 assert.throws(()=>new mod.StatelessCodexRuntime(),/runtime-configuration/);
 assert.throws(()=>new mod.StatelessCodexRuntime({authorized:true,model:'unapproved'}),/runtime-configuration/);
 const runtime=new mod.StatelessCodexRuntime({authorized:true,model:'gpt-6.1-sol'});
 assert.equal(runtime.kind,'stateless-llm');
 assert.equal(typeof runtime.execute,'function');
});
