import test from 'node:test';import assert from 'node:assert/strict';
test('startup keeps existing LLM unless native real readiness admits all three purposes; no inference or fallback retry',async()=>{
 const {chooseStartupDocumentaryAI}=await import('../src/onboarding-v3/native-agent-startup.js');
 const existing={model:'existing-model'},seen=[],native={engine:{kind:'hermes-agent'},available:async purpose=>{seen.push(purpose);return purpose!=='question';},generate:()=>assert.fail('No inference during startup')};
 assert.equal((await chooseStartupDocumentaryAI({existing,native,authorized:false})).documentaryAI,existing);assert.deepEqual(seen,[]);
 assert.equal((await chooseStartupDocumentaryAI({existing,native,authorized:true})).documentaryAI,existing);
 native.available=async()=>true;assert.equal((await chooseStartupDocumentaryAI({existing,native,authorized:true})).documentaryAI,native);
 native.engine.kind='hermes-agent-fixture';assert.equal((await chooseStartupDocumentaryAI({existing,native,authorized:true})).documentaryAI,existing);
});
