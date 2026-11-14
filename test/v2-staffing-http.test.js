import test from 'node:test';
import assert from 'node:assert/strict';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {staffingFixture} from '../test-support/staffing-fixture.js';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('Etapa 2 HTTP uses governed candidates and token, linked confirmation and stale catalog gates',async()=>{
 const f=await staffingFixture(),secret='synthetic-staffing-session-secret',prefix='/dashboard/onboarding-v2';
 const users=f.identities.map(u=>({...u,tid:'tenant-test',oid:u.id}));
 const server=createV2Server({basePath:prefix,dataFile:join(f.dir,'state.json'),classificationFile:f.file,directoryFile:f.source,users,staffingRequired:true,authMode:'sso',sessionSecret:secret,publicOrigin:'https://example.test'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const cookie=id=>{const body=Buffer.from(JSON.stringify({tid:'tenant-test',oid:id,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return 'ma_ct_session='+body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
 const get=path=>fetch(base+path,{headers:{cookie:cookie('owner')}});
 const post=body=>fetch(base+'/api/action',{method:'POST',headers:{cookie:cookie('owner'),Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/api/staffing')).status,401);
  let view=await(await get('/api/state')).json();assert.ok(view.staffing?.required,'State must include governed catalog options');
  assert.equal(view.actor.azureIdentityKey,'az-owner','Only explicit server RBAC links identify the confirmer');
  assert.equal((await(await get('/api/staffing')).json()).candidates.length,2);
  let response=await post({type:'save',revision:0,phase:2,data:{fronts:[{id:'F1'}]}});assert.equal(response.status,409,'Manual/stale phase2 bypass must fail');
  const data={catalogToken:view.staffing.token,fronts:[{id:'F1',catalogFrontId:'C1',project:'P1',owner:'az-owner',reviewer:'az-reviewer',discipline:'FORGED',deliverable:'Test AAR',repository:'repo',area:'Test',dependencies:[],contract:'Test'}]};
  response=await post({type:'save',revision:0,phase:2,data});assert.equal(response.status,200);view=await response.json();
  assert.equal(view.state.phases[2].fronts[0].discipline,'Android');assert.equal(view.state.phases[2].fronts[0].ownerName,'Responsable de prueba');assert.equal(view.state.phases[2].fronts[0].confirmed,false);
  response=await post({type:'confirm',revision:view.state.revision,front:'F1'});assert.equal(response.status,200);view=await response.json();assert.equal(view.state.phases[2].fronts[0].confirmedBy,'owner');
  await f.store.act({type:'front.update',revision:9,id:'C1',data:{name:'Android',active:false}},{id:'coordinator-test',authenticated:true,roles:['coordinator']});
  response=await post({type:'confirm',revision:view.state.revision,front:'F1'});assert.equal(response.status,409,'Catalog changes must block old confirmations');
  response=await get('/api/package');assert.equal(response.status,409,'Catalog changes must block export independently of client UI');
  view=await(await get('/api/state')).json();assert.ok(view.blockers[2].some(b=>/catálogo/i.test(b)));
 }finally{await new Promise(r=>server.close(r));await rm(f.dir,{recursive:true,force:true});}
});

test('classification writes serialize behind a staffing read/commit snapshot',async()=>{
 const f=await staffingFixture();
 try{
  assert.equal(typeof f.store.withSnapshot,'function','Shared serialization is needed for governance reads and writes');
  let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const events=[];
  const read=f.store.withSnapshot(async s=>{events.push('snapshot:'+s.revision);entered();await gate;events.push('commit');});
  await started;
  const write=f.store.act({type:'front.update',revision:9,id:'C1',data:{name:'Android v2'}},{id:'coordinator-test',authenticated:true,roles:['coordinator']}).then(()=>events.push('catalog-write'));
  assert.deepEqual(events,['snapshot:9']);release();await Promise.all([read,write]);assert.deepEqual(events,['snapshot:9','commit','catalog-write']);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
