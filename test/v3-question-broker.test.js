import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {BoundedBroker} from '../src/onboarding-v2/hermes-broker-service.js';import {brokerTransport} from '../src/onboarding-v2/hermes-broker.js';import {DocumentaryAI} from '../src/onboarding-v3/documentary-ai.js';import {fixture,actor} from '../test-support/documentary-fixture.js';
test('question purpose crosses signed broker with bounded current answer, no role assignment or overwrite',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'question-broker-'));let seen;
 const runtime={execute:async p=>{seen=p;return {answer:'Insufficient evidence',sourceRefs:[],assumptions:[],limitations:['Human decision needed'],evidence:'insufficient'};}};
 const broker=await BoundedBroker.open({directory:dir,key:'synthetic-only-'.repeat(4),model:'fixture',runtime});
 const transport=brokerTransport({approved:true,socketPath:'/synthetic.sock',key:broker.key,exchange:e=>broker.exchange(e)});
 try{const service=new DocumentaryAI({model:'fixture',transport}),s=fixture();const r=await service.generate(s,actor,{revision:1,executionId:'question-broker-fixture-1',purpose:'question',id:s.phases[1].questions[0].id,instructions:'Clarify',sourceRefs:[]});assert.equal(r.output.evidence,'insufficient');assert.equal(seen.derivatives.question.currentAnswer,'');assert.equal(seen.policy.tools,'none');assert.equal(seen.schema,'onboarding.questions.bounded.v1');}finally{await broker.close();await rm(dir,{recursive:true,force:true});}
});
