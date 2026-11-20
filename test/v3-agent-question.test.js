import test from 'node:test';
import assert from 'node:assert/strict';
import {HermesAgentEngine,HERMES_COMMIT,NATIVE_RUNTIME} from '../src/onboarding-v3/hermes-agent-engine.js';
import {fixture,actor} from '../test-support/documentary-fixture.js';
import {applyDocumentary} from '../src/onboarding-v3/documentary-ai.js';
import {questionHash} from '../src/onboarding-v3/questions.js';

test('native question projects selected originals, binds saved answer/hash, emits milestones and stores only an alternative (protocol fixture)',async()=>{
 const state=fixture(),q=state.phases[1].questions[0];q.answer='Human saved baseline';q.rationale='Human rationale';
 const scope={actor:actor.id,org:'synthetic',project:'alpha',caseId:'workitem-900001'};let request,historyMessages=0;
 const transport=async r=>{request=r;const prompt=JSON.parse(r.prompt);return {runtime:NATIVE_RUNTIME,hermesCommit:HERMES_COMMIT,model:'gpt-6.1-sol',modelMode:'real-provider',allowedTools:['authorized_context'],isolation:Object.fromEntries(['hostHomeHidden','hostWorkspacesHidden','credentialsHidden','networkDisabled','runtimeReadOnly','capabilitiesDropped'].map(k=>[k,true])),...Object.fromEntries(['executionId','inputHash','sourceHash','purpose','contextKey','historyPolicy'].map(k=>[k,r[k]])),historyMessages,tools:[{toolCallId:'protocol-fixture-only',name:'authorized_context',status:'executed',sources:[{id:'alpha-guide',org:'synthetic',project:'alpha',kind:'repository',ref:'fixture-v1',contentHash:'c'.repeat(64)}]}],answer:JSON.stringify({documentary:{answer:'Propuesta sintética pendiente de revisión',sourceRefs:Object.keys(prompt.sourceRefs),assumptions:['Requiere confirmación humana'],limitations:['Solo fuentes seleccionadas e indexadas'],evidence:'insufficient'},contextCitations:['alpha-guide']})};};
 transport.health=async()=>true;const service=new HermesAgentEngine({transport,scopeResolver:()=>scope});
 const ref=Object.keys(service.preview(state).sourceRefs).find(x=>x.endsWith(':title'));
 const input={id:q.id,revision:state.revision,purpose:'question',executionId:'fixture-question-native-0001',sourceRefs:[ref],instructions:'Aclarar, nunca aprobar'};const stages=[];
 const result=await service.generate(state,actor,input,async x=>stages.push(x));
 assert.equal(result.questionId,q.id);assert.equal(result.questionHash,questionHash(state,q));assert.equal(result.derivatives.question.currentAnswer,q.answer);
 assert.deepEqual(stages,['context-prepared','waiting-model','validating']);
 const prompt=JSON.parse(request.prompt);assert.deepEqual(Object.keys(prompt.sourceRefs),[ref]);assert.equal(prompt.snapshot.items[0].description,'');assert.equal(prompt.snapshot.items[0].acceptanceCriteria,'');assert.ok(prompt.snapshot.items[0].attachments.every(a=>!a.text));
 assert.equal(request.historyPolicy,'none');assert.match(request.contextKey,/^[a-f0-9]{64}$/);assert.equal(request.purpose,'question');
 const next=applyDocumentary(state,result,actor);assert.equal(next.phases[1].questions[0].answer,q.answer);assert.equal(next.questionRecords[q.id].suggestions[0].status,'alternative-not-applied');assert.equal(next.questionRecords[q.id].versions.length,0);assert.equal(next.questionRecords[q.id].decisions.length,0);assert.deepEqual(next.azureIntakes,state.azureIntakes);
 const stale=structuredClone(state);stale.phases[1].questions[0].answer='Another saved baseline';assert.throws(()=>applyDocumentary(stale,result,actor),/stale-question/);
 await assert.rejects(service.generate(state,actor,{...input,sourceRefs:['invented']}),/question-context/);
 await assert.rejects(service.generate(state,actor,{...input,instructions:'x'.repeat(2001)}),/question-context/);
 historyMessages=2;await assert.rejects(service.generate(state,actor,input),/native-agent-evidence/);
});
