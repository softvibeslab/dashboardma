import test from 'node:test';import assert from 'node:assert/strict';import {createHmac}from'node:crypto';import {mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{createV2Server}from'../src/onboarding-v2/server.js';
test('isolated prefix and shared signed-session consumer require explicit RBAC, exact origin and no local bypass',async()=>{
 const dir=await mkdtemp('/root/.hermes/cache/scratch/v2-sso-');const prefix='/dashboard/onboarding-v2',secret='synthetic-test-session-secret-not-production';
 const server=createV2Server({dataFile:join(dir,'v2.json'),basePath:prefix,authMode:'sso',sessionSecret:secret,publicOrigin:'https://example.test',users:[{id:'reviewer',tid:'test-tenant',oid:'test-oid',roles:['reviewer','qa'],token:'must-not-enable-local-login'}]});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const cookie=claims=>{const body=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+600,...claims})).toString('base64url');return'ma_ct_session='+body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
 try{
 assert.equal((await fetch(base+'/api/state')).status,404);
 assert.equal((await fetch(base+prefix+'/api/state')).status,401);
 const page=await(await fetch(base+prefix)).text();assert.ok(page.includes(prefix+'/app.js'));assert.ok(page.includes(prefix+'/styles.css'));
 const denied=await fetch(base+prefix+'/api/state',{headers:{cookie:cookie({tid:'test-tenant',oid:'unassigned'})}});assert.equal(denied.status,403);
 const session=cookie({tid:'test-tenant',oid:'test-oid',email:'test@example.test'});const res=await fetch(base+prefix+'/api/state',{headers:{cookie:session}});assert.equal(res.status,200);const v=await res.json();assert.equal(v.actor.id,'reviewer');assert.equal(v.actor.mode,'sso');assert.ok(!v.actor.token);
 assert.equal((await fetch(base+prefix+'/api/state',{headers:{cookie:cookie({tid:'test-tenant',oid:'test-oid',exp:1})}})).status,401);
 assert.equal((await fetch(base+prefix+'/api/state',{headers:{cookie:'ma_ct_session=malformed.x'}})).status,401);
 const post=(origin,path,body)=>fetch(base+prefix+path,{method:'POST',headers:{origin,cookie:session,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post('https://example.test','/api/login',{token:'must-not-enable-local-login'})).status,403);
 assert.equal((await post('https://evil.test','/api/action',{})).status,403);
 assert.equal((await post('https://example.test','/api/action',{type:'save',revision:0,phase:1,data:{}})).status,403);
 const signedOut=await(await fetch(base+prefix+'/api/state')).json();assert.equal(signedOut.loginUrl,'/dashboard/auth/login?returnTo=%2Fdashboard%2Fonboarding-v2');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
