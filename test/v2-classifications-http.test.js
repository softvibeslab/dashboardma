import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('catalog endpoints enforce SSO, RBAC and origin, persist separately and expose module page',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','catalog-http-'));
 const secret='synthetic-catalog-test-session';const prefix='/dashboard/onboarding-v2';
 const source=join(dir,'directory.json');await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[]}));
 const users=[{id:'admin-test',tid:'tenant-test',oid:'admin',roles:['coordinator']},{id:'reader-test',tid:'tenant-test',oid:'reader',roles:['reader']}];
 const server=createV2Server({dataFile:join(dir,'onboarding.json'),directoryFile:source,basePath:prefix,authMode:'sso',sessionSecret:secret,publicOrigin:'https://example.test',users});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const cookie=oid=>{const body=Buffer.from(JSON.stringify({tid:'tenant-test',oid,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return 'ma_ct_session='+body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
 const post=(oid,origin,data)=>fetch(base+'/api/classifications',{method:'POST',headers:{cookie:cookie(oid),origin,'content-type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(base+'/api/classifications')).status,401);
  const response=await fetch(base+'/api/classifications',{headers:{cookie:cookie('reader')}});
  assert.equal(response.status,200,'The classifications module API must exist');
  assert.equal((await response.json()).canManage,false);
  const action={type:'front.create',revision:0,data:{name:'Android'}};
  assert.equal((await post('reader','https://example.test',action)).status,403);
  assert.equal((await post('admin','https://evil.test',action)).status,403);
  const saved=await post('admin','https://example.test',action);assert.equal(saved.status,200);
  assert.equal((await saved.json()).catalog.fronts[0].name,'Android');
  assert.equal((await post('admin','https://example.test',action)).status,409);
  const state=await(await fetch(base+'/api/state',{headers:{cookie:cookie('admin')}})).json();assert.equal(state.state.revision,0);
  const page=await fetch(base+'/classifications');assert.equal(page.status,200);assert.ok((await page.text()).includes('Clasificaciones y participación'));
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
