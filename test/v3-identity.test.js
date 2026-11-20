import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {createV3Server} from '../src/onboarding-v3/server.js';
import {displayIdentity} from '../src/onboarding-v3/identity.js';
import {identityLabel,personLabel} from '../public/onboarding-v3/identity.js';
test('Missing or technical display names are explicit without exposing IDs; fixture profiles remain usable',()=>{
 assert.deepEqual(displayIdentity({id:'USR-AZ-SYNTHETIC',name:'USR-AZ-SYNTHETIC'}),{name:'Nombre no disponible',email:'Correo no disponible'});
 assert.equal(displayIdentity({id:'fixture',name:'Mapped Person'},{name:'USR-AZ-OTHER'}).name,'Mapped Person');
 assert.equal(personLabel('unknown',[]),'Nombre no disponible · Correo no disponible');
 assert.equal(identityLabel({name:'Synthetic',email:'<test@example.test>'}),'Synthetic · <test@example.test>');
});
const secret='synthetic-identity-session-secret';
const sign=claims=>{const b=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+600,...claims})).toString('base64url');return 'ma_ct_session='+b+'.'+createHmac('sha256',secret).update(b).digest('base64url');};
test('V3 signed identity name/email is consistent across private endpoints without granting email-based access',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'v3-identity-'));
 const users=[{id:'USR-AZ-SYNTHETIC',tid:'fixture-tenant',oid:'fixture-oid',name:'Mapped Synthetic Person',email:'mapped@example.test',roles:['editor']}];
 const server=createV3Server({dataFile:path.join(dir,'state.json'),users,sessionSecret:secret,staffingRequired:false});
 const socket=path.join(dir,'http.sock');await new Promise(r=>server.listen(socket,r));
 const get=(route,claims)=>new Promise((resolve,reject)=>{const req=http.get({socketPath:socket,path:'/dashboard/onboarding-v3/api/'+route,headers:claims?{cookie:sign(claims)}:{}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(b)}));});req.on('error',reject);});
 try{
 const claims={tid:'fixture-tenant',oid:'fixture-oid',name:'Synthetic <img src=x onerror=alert(1)> & Person',email:'signed@example.test'};
 for(const route of ['state','classifications','staffing','access']){
  const r=await get(route,claims);assert.equal(r.status,200);assert.equal(r.data.actor.name,claims.name,route);assert.equal(r.data.actor.email,claims.email,route);assert.equal(r.data.actor.id,users[0].id);assert.deepEqual(r.data.actor.roles,['editor']);
 }
 const mapped=await get('state',{tid:'fixture-tenant',oid:'fixture-oid'});assert.equal(mapped.data.actor.name,users[0].name);assert.equal(mapped.data.actor.email,users[0].email);assert.equal(mapped.data.identities[0].name,users[0].name);
 assert.equal((await get('state',{tid:'fixture-tenant',oid:'other',email:'mapped@example.test',name:users[0].name})).status,403);
 assert.equal((await get('state')).status,401);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
