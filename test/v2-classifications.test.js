import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

test('catalog CRUD restricts writes, keeps revision and audit, and prevents dangling classifications', async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','classification-test-'));
 try {
  let module;try {module=await import('../src/onboarding-v2/classifications.js');} catch(e) {if(e.code==='ERR_MODULE_NOT_FOUND'){assert.fail('ClassificationStore has not been implemented');}throw e;}
  const store=new module.ClassificationStore(join(dir,'classifications.json'));
  const admin={id:'coordinator-test',authenticated:true,roles:['coordinator']};
  const reader={id:'reader-test',authenticated:true,roles:['reader']};
  assert.equal((await store.view()).revision,0);
  await assert.rejects(()=>store.act({type:'front.create',revision:0,data:{name:'Android'}},reader),/coordinator/i);
  let s=await store.act({type:'front.create',revision:0,data:{name:'Android',description:'Mobile native',active:true}},admin);
  assert.equal(s.fronts[0].name,'Android');assert.equal(s.revision,1);const id=s.fronts[0].id;
  await assert.rejects(()=>store.act({type:'front.update',revision:0,id,data:{name:'Wrong'}},admin),/revisi/i);
  await assert.rejects(()=>store.act({type:'front.create',revision:1,data:{name:'ANDROID'}},admin),/existe/i);
  s=await store.act({type:'front.update',revision:1,id,data:{name:'Android nativo',description:'Revised',active:false}},admin);
  assert.equal(s.fronts[0].active,false);
  s=await store.act({type:'front.delete',revision:2,id},admin);
  assert.equal(s.fronts.length,0);assert.equal(s.audit.length,3);
  assert.equal((await store.view()).revision,3);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('participation CRUD binds trusted Azure identities, validates scope and preserves one principal front', async()=>{
 const {ClassificationStore}=await import('../src/onboarding-v2/classifications.js');
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','participation-test-'));
 try {
  const source=join(dir,'directory.json');
  await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'azure:test-001',name:'Synthetic user',email:'user@example.test',projects:['Project-test']}]}));
  const store=new ClassificationStore(join(dir,'catalog.json'),{directoryFile:source});
  const actor={id:'coordinator-test',authenticated:true,roles:['coordinator']};
  let s=await store.act({type:'directory.sync',revision:0},actor);
  assert.equal(s.directory.users[0].id,'azure:test-001');
  s=await store.act({type:'front.create',revision:s.revision,data:{name:'Android'}},actor);const frontId=s.fronts[0].id;
  const data={userId:'azure:test-001',frontId,level:'principal',roles:['developer','reviewer'],projects:['Project-test'],enabled:true,notes:'Confirmed by coordinator'};
  s=await store.act({type:'participation.create',revision:s.revision,data},actor);
  assert.equal(s.participations.length,1);const id=s.participations[0].id;
  await assert.rejects(()=>store.act({type:'front.delete',revision:s.revision,id:frontId},actor),/participaciones/i);
  await assert.rejects(()=>store.act({type:'participation.create',revision:s.revision,data:{...data,userId:'forged'}},actor),/sincronizad/i);
  await assert.rejects(()=>store.act({type:'participation.update',revision:s.revision,id,data:{...data,projects:['Other project']}},actor),/proyecto/i);
  await assert.rejects(()=>store.act({type:'participation.create',revision:s.revision,data},actor),/existe/i);
  s=await store.act({type:'front.create',revision:s.revision,data:{name:'Web'}},actor);const web=s.fronts[1].id;
  await assert.rejects(()=>store.act({type:'participation.create',revision:s.revision,data:{...data,frontId:web}},actor),/principal/i);
  s=await store.act({type:'participation.update',revision:s.revision,id,data:{...data,enabled:false}},actor);
  assert.equal(s.participations[0].enabled,false);
  s=await store.act({type:'participation.delete',revision:s.revision,id},actor);
  assert.equal(s.participations.length,0);
  assert.equal(s.audit.at(-1).before.id,id);
  await assert.rejects(()=>store.act({type:'directory.sync',revision:s.revision,data:{users:[{id:'forged'}]}},actor),/cliente/i);
  assert.equal((await store.view()).revision,s.revision);
 }finally {await rm(dir,{recursive:true,force:true});}
});

test('directory refresh preserves history and permits retiring an identity absent from the latest snapshot',async()=>{
 const {ClassificationStore}=await import('../src/onboarding-v2/classifications.js');
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','catalog-retirement-'));
 try{
  const source=join(dir,'source.json');const snapshot={source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'azure:test',name:'Persona de prueba',projects:['Test']}]};
  await writeFile(source,JSON.stringify(snapshot));const store=new ClassificationStore(join(dir,'catalog.json'),{directoryFile:source});const actor={id:'coordinator-test',authenticated:true,roles:['coordinator']};
  let s=await store.act({type:'directory.sync',revision:0},actor);
  s=await store.act({type:'front.create',revision:s.revision,data:{name:'Android'}},actor);
  const data={userId:'azure:test',frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Test'],enabled:true};
  s=await store.act({type:'participation.create',revision:s.revision,data},actor);const id=s.participations[0].id;
  await writeFile(source,JSON.stringify({...snapshot,users:[]}));s=await store.act({type:'directory.sync',revision:s.revision},actor);
  assert.equal(s.participations.length,1,'Source refresh must never silently delete classifications');
  s=await store.act({type:'participation.update',revision:s.revision,id,data:{...data,enabled:false}},actor);
  assert.equal(s.participations[0].enabled,false);
  await assert.rejects(()=>store.act({type:'participation.update',revision:s.revision,id,data},actor),/sincronizad/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
