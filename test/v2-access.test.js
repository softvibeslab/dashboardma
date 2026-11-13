import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('SSO access status returns only the signed caller identity, without granting roles or exposing state', async()=>{
 const secret='test-only-access-session-secret';
 const server=createV2Server({authMode:'sso',sessionSecret:secret,users:[],basePath:'/dashboard/onboarding-v2'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v2`;
 try {
  assert.equal((await fetch(base+'/api/access')).status,401);
  const body=Buffer.from(JSON.stringify({tid:'tenant-test',oid:'caller-test',name:'Synthetic caller',email:'caller@example.test',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
  const cookie='ma_ct_session='+body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
  const response=await fetch(base+'/api/access',{headers:{cookie}});
  assert.equal(response.status,200,'An authenticated unassigned caller must be able to request their own access identity');
  const data=await response.json();
  assert.deepEqual(data,{mode:'sso',assigned:false,identity:{tid:'tenant-test',oid:'caller-test',name:'Synthetic caller',email:'caller@example.test'}});
  assert.equal((await fetch(base+'/api/state',{headers:{cookie}})).status,403);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
