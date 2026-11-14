import test from 'node:test';
import assert from 'node:assert/strict';
import {rm} from 'node:fs/promises';

import {staffingFixture} from '../test-support/staffing-fixture.js';

test('staffing options use active classifications and enabled project/capability memberships, never infer RBAC',async()=>{
 const f=await staffingFixture();
 try{
  let mod;try{mod=await import('../src/onboarding-v2/staffing.js');}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND')assert.fail('StaffingService is not implemented');throw e;}
  const service=new mod.StaffingService(f.store,{directoryFile:f.source,identities:f.identities});
  const options=await service.current();
  assert.equal(options.required,true);assert.equal(options.catalogRevision,'9');assert.ok(options.token);
  assert.deepEqual(options.fronts,[{id:'C1',name:'Android'}]);assert.equal(options.candidates.length,2);
  assert.deepEqual(mod.candidatesFor(options,{frontId:'C1',project:'P1',role:'developer'}).map(c=>c.userId),['az-owner']);
  assert.equal(mod.candidatesFor(options,{frontId:'C1',project:'P2',role:'developer'}).length,0);
  assert.equal(options.candidates.find(c=>c.userId==='az-owner').canConfirm,true);
  const unlinked=await new mod.StaffingService(f.store,{directoryFile:f.source,identities:[]}).current();
  assert.ok(unlinked.candidates.every(c=>!c.canConfirm&&!c.canReview));
  assert.equal((await f.store.view()).revision,9,'Candidate reads do not import users or mutate the catalog');
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('governed staffing resolves server provenance and rejects stale, ineligible or self-review selections',async()=>{
 const f=await staffingFixture();
 try{
  const {StaffingService}=await import('../src/onboarding-v2/staffing.js');
  const service=new StaffingService(f.store,{directoryFile:f.source,identities:f.identities});const options=await service.current();
  const data={catalogToken:options.token,fronts:[{id:'F1',catalogFrontId:'C1',project:'P1',owner:'az-owner',reviewer:'az-reviewer',ownerName:'FORGED',discipline:'FORGED',deliverable:'AAR de prueba',repository:'https://example.test/repo',area:'Test',contract:'Test contract',dependencies:[]}]};
  assert.equal(typeof service.resolve,'function','Phase 2 must validate governed selection before persisting');
  const resolved=service.resolve(data,options);
  assert.equal(resolved.fronts[0].discipline,'Android');assert.equal(resolved.fronts[0].ownerName,'Responsable de prueba');
  assert.equal(resolved.catalogRevision,'9');assert.equal(resolved.directorySyncedAt,options.directorySyncedAt);assert.equal(resolved.fronts[0].selectionToken,options.token);
  assert.throws(()=>service.resolve({...data,catalogToken:'old'},options),e=>e.status===409);
  assert.throws(()=>service.resolve({...data,fronts:[{...data.fronts[0],owner:'az-disabled'}]},options),/habilitado/i);
  assert.throws(()=>service.resolve({...data,fronts:[{...data.fronts[0],project:'P2'}]},options),/habilitado/i);
  assert.throws(()=>service.resolve({...data,fronts:[{...data.fronts[0],catalogFrontId:'C2'}]},options),/activo/i);
  assert.throws(()=>service.resolve({...data,fronts:[{...data.fronts[0],reviewer:'az-owner'}]},options),/independiente/i);
  await f.store.act({type:'front.update',revision:9,id:'C1',data:{name:'Android',active:false}}, {id:'coordinator',authenticated:true,roles:['coordinator']});
  const latest=await service.current();assert.notEqual(latest.token,options.token);
  assert.throws(()=>service.assertCurrent(resolved,latest),e=>e.status===409);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
