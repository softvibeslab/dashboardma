import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, change, blockers, digest, objectHash, packageFor } from '../src/onboarding-v2/model.js';
const editor={id:'owner',roles:['editor'],authenticated:true};
test('phase gates enforce confirmed fronts, shared traceability, human review and distinguish plans from software QA',()=>{
 const s=initial();
 assert.ok(blockers(s,2).length); assert.ok(blockers(s,3).length); assert.ok(blockers(s,4).length); assert.ok(blockers(s,5).length);
 s.phases[2]={fronts:[{id:'F1',deliverable:'AAR',repository:'repo',owner:'owner',reviewer:'reviewer',discipline:'Android',area:'Ventas',confirmed:true,dependencies:[]}]};
 assert.deepEqual(blockers(s,2),[]);
 s.phases[3]={sections:[{id:'SPEC1',front:'shared',title:'Funcional',body:'Flujo compartido'},{id:'SPEC2',front:'F1',title:'Android',body:'Contrato'}],criteria:[{id:'AC1',section:'SPEC1',critical:true,text:'Aceptar'}]};
 assert.deepEqual(blockers(s,3),[]);
 s.phases[4]={humanReview:true,reviewer:'reviewer',findings:[]}; assert.deepEqual(blockers(s,4),[]);
 s.phases[5]={kind:'document',plan:'Revisión del diseño',reviewed:true,reviewer:'reviewer',cases:[{id:'TC1',criterion:'AC1',risk:'R1',steps:'Revisar flujo',expected:'Consistente',status:'planned'}],defects:[]};
 assert.deepEqual(blockers(s,5),[]);
 s.phases[5].kind='software'; assert.ok(blockers(s,5).length);
 s.phases[5].build='abc'; s.phases[5].environment='QA'; Object.assign(s.phases[5].cases[0],{status:'reported',evidence:'https://evidence.test',executor:'owner'});
 assert.ok(blockers(s,5).length); // reporting is not verified execution
 Object.assign(s.phases[5].cases[0],{status:'executed',result:'passed',reviewer:'reviewer'}); assert.deepEqual(blockers(s,5),[]);
});
test('V2 preserves immutable versions, refuses stale writes and never trusts source extraction claims',()=>{
 let s=initial();
 s=change(s,{type:'save',phase:1,revision:0,data:{title:'TEST',owner:'owner',context:'Context',sources:[{id:'S1',kind:'url',name:'https://example.test',status:'extracted'}],questions:[]}},editor);
 assert.equal(s.revision,1); assert.equal(s.history.length,1);
 assert.equal(s.phases[1].sources[0].status,'referenced');
 assert.throws(()=>change(s,{type:'save',phase:1,revision:0,data:{}},editor),/versión/);
 assert.ok(blockers(s,1).length===0); assert.equal(digest(s).length,64);
 assert.throws(()=>change(s,{type:'save',phase:1,revision:1,data:{}},{id:'x',roles:[],authenticated:false}),/autentic/);
});
