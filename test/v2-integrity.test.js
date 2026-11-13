import test from 'node:test';import assert from 'node:assert/strict';import {initial,blockers,change,objectHash,packageFor,hash} from '../src/onboarding-v2/model.js';import {ready} from '../test-support/v2-fixture.js';
const actor={id:'owner',roles:['editor','coordinator'],authenticated:true};
test('blocking decisions need owner and rationale; sources and findings maintain valid IDs',()=>{
 const s=ready();s.phases[1].questions=[{id:'Q1',question:'How?',blocking:true,answer:'yes'}];assert.ok(blockers(s,1).length);
 s.phases[1].questions[0].owner='owner';s.phases[1].questions[0].rationale='Human decision';assert.deepEqual(blockers(s,1),[]);
 s.phases[4].findings=[{id:'H1',section:'nonexistent',owner:'owner',severity:'high',description:'Missing contract',status:'resolved',resolution:'Updated'}];assert.ok(blockers(s,4).length);
});
test('software failed critical coverage, unsupported exceptions and dependency cycles block delivery',()=>{
 const s=ready();const qa=s.phases[5];qa.kind='software';qa.build='TEST-build';qa.environment='TEST-env';Object.assign(qa.cases[0],{status:'executed',result:'failed',executor:'owner',reviewer:'reviewer',evidence:'TEST evidence'});
 assert.ok(blockers(s,5).some(x=>x.includes('críticos')));assert.ok(blockers(s,5).some(x=>x.includes('defecto')));
 qa.cases[0].result='passed';assert.deepEqual(blockers(s,5),[]);
 qa.defects=[{id:'D1',case:'TC1',owner:'owner',severity:'critical',status:'accepted',evidence:'TEST',decision:'Ignore'}];assert.ok(blockers(s,5).length);
 s.phases[2].fronts[0].dependencies=['F1'];assert.ok(blockers(s,2).length);
});
test('structured export manifest can be verified and exact receipt is not an approval',()=>{
 let s=ready();const review={id:'reviewer',roles:['qa','reviewer'],authenticated:true,mode:'local-review'};
 for(const object of ['spec','tests','front:F1'])s=change(s,{type:'decide',object,hash:objectHash(s,object),decision:'approve',revision:s.revision},review);
 const p=packageFor(s);assert.ok(p.files['audit.json']);assert.ok(p.files['approval-subjects.json']);assert.equal(p.version,s.revision);for(const [name,checksum]of Object.entries(p.manifest))assert.equal(hash(p.files[name]),checksum);
 const {hash:checksum,...payload}=p;assert.equal(hash(payload),checksum);
 assert.throws(()=>change(s,{type:'receipt',revision:s.revision,hash:p.hash},actor),/destinatario/);
 s=change(s,{type:'receipt',revision:s.revision,hash:p.hash},review);assert.equal(packageFor(s).hash,p.hash);
});
