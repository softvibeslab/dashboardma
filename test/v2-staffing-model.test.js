import test from 'node:test';
import assert from 'node:assert/strict';
import {rm} from 'node:fs/promises';
import {staffingFixture} from '../test-support/staffing-fixture.js';
import {StaffingService} from '../src/onboarding-v2/staffing.js';
import {change,initial,objectHash} from '../src/onboarding-v2/model.js';
import {ready} from '../test-support/v2-fixture.js';

test('governed selection remains unconfirmed until the explicitly linked owner confirms, and records provenance',async()=>{
 const f=await staffingFixture();
 try{
  const service=new StaffingService(f.store,{directoryFile:f.source,identities:f.identities});const options=await service.current();
  const data=service.resolve({catalogToken:options.token,fronts:[{id:'F1',catalogFrontId:'C1',project:'P1',owner:'az-owner',reviewer:'az-reviewer',deliverable:'Test deliverable',repository:'repo',area:'Test',contract:'Test',dependencies:[]}]},options);
  const owner={id:'owner',azureIdentityKey:'az-owner',roles:['editor','coordinator'],authenticated:true,mode:'test-only'};
  let s=change(initial(),{type:'save',revision:0,phase:2,data},owner);
  assert.equal(s.phases[2].fronts[0].confirmed,false);
  assert.throws(()=>change(s,{type:'confirm',revision:s.revision,front:'F1'},{...owner,id:'az-owner',azureIdentityKey:undefined}),/responsable/i,'Matching a user-supplied ID is not a verified identity binding');
  s=change(s,{type:'confirm',revision:s.revision,front:'F1'},owner);
  assert.equal(s.phases[2].fronts[0].confirmed,true);assert.equal(s.phases[2].fronts[0].confirmedBy,'owner');assert.ok(s.phases[2].fronts[0].confirmedAt);
  s=change(s,{type:'save',revision:s.revision,phase:2,data:{...s.phases[2],fronts:s.phases[2].fronts.map(x=>({...x,confirmedBy:'FORGED',confirmedAt:'FORGED'}))}},owner);
  assert.equal(s.phases[2].fronts[0].confirmedBy,'owner','Client cannot forge confirmation metadata');
  s=change(s,{type:'save',revision:s.revision,phase:2,data:{...s.phases[2],fronts:s.phases[2].fronts.map(x=>({...x,deliverable:'Changed test deliverable'}))}},owner);
  assert.equal(s.phases[2].fronts[0].confirmed,false);assert.ok(!s.phases[2].fronts[0].confirmedBy);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('project or catalog scope reassignment requires coordinator even when selected people stay the same',()=>{
 const s=ready();s.phases[2].fronts[0]={...s.phases[2].fronts[0],catalogFrontId:'C1',project:'P1'};
 const actor={id:'owner',azureIdentityKey:'owner',roles:['editor'],authenticated:true};
 assert.throws(()=>change(s,{type:'save',revision:s.revision,phase:2,data:{...s.phases[2],fronts:s.phases[2].fronts.map(f=>({...f,project:'P2'}))}},actor),/coordinador/i);
});

test('a front approval uses explicit Azure identity binding without granting a reviewer role',()=>{
 const s=ready();s.phases[2].fronts[0]={...s.phases[2].fronts[0],catalogFrontId:'C1',owner:'az-owner',reviewer:'az-reviewer'};
 const action={type:'decide',revision:s.revision,object:'front:F1',hash:objectHash(s,'front:F1'),decision:'approve'};
 assert.throws(()=>change(s,action,{id:'az-reviewer',roles:['reviewer'],authenticated:true}),/revisor/i);
 assert.throws(()=>change(s,action,{id:'reviewer',azureIdentityKey:'az-reviewer',roles:['reader'],authenticated:true}),/revisor/i);
 const next=change(s,action,{id:'reviewer',azureIdentityKey:'az-reviewer',roles:['reviewer'],authenticated:true});
 assert.equal(next.decisions.at(-1).actor,'reviewer');
});
