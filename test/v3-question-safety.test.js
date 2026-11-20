import test from 'node:test';import assert from 'node:assert/strict';import {DocumentaryAI,applyDocumentary} from '../src/onboarding-v3/documentary-ai.js';import {fixture,actor} from '../test-support/documentary-fixture.js';import {hash} from '../src/onboarding-v2/model.js';import {validateQuestionOutput} from '../src/onboarding-v2/question-contract.js';
test('question failures/stale/source guards preserve human draft and terminal alternative never overwrites',async()=>{
 const s=fixture(),q=s.phases[1].questions[0];q.answer='Human current';q.rationale='Human source';let seen;
 const service=new DocumentaryAI({model:'synthetic',transport:async p=>{seen=p;return {answer:'Alternative',sourceRefs:Object.keys(p.sourceRefs),assumptions:[],limitations:['Synthetic only'],evidence:'insufficient'};}});
 const input={revision:s.revision,executionId:'question-safety-fixture-1',purpose:'question',id:q.id,instructions:'Clarify',sourceRefs:[`AZ-900001-r1:title`]};
 const result=await service.generate(s,actor,input);assert.equal(seen.snapshot.items[0].description,'');assert.deepEqual(Object.keys(seen.sourceRefs),input.sourceRefs);
 const next=applyDocumentary(s,result,actor);assert.equal(next.phases[1].questions[0].answer,'Human current');assert.deepEqual(next.azureIntakes,s.azureIntakes);
 for(const mutate of [s=>s.revision++,s=>s.phases[1].questions[0].answer='New human',s=>s.azureIntakes[0].snapshot.root.rev++]){const modified=structuredClone(s);mutate(modified);const before=hash(modified);assert.throws(()=>applyDocumentary(modified,result,actor));assert.equal(hash(modified),before);}
 for(const modify of [v=>v.sourceRefs=['invented'],v=>v.roles=['reviewer'],v=>v.evidence='approved',v=>v.answer='']){const value=structuredClone(result.output);modify(value);assert.throws(()=>validateQuestionOutput(value,seen.sourceRefs),/invalid-output/);}
 await assert.rejects(service.generate(s,actor,{...input,sourceRefs:['invented']}),/question-context/);
});
