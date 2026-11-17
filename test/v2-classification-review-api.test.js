import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('SSO review uses verified tenant+oid assignment, not name/email or submitted roles',{timeout:10000},async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','review-sso-')),socket=join(dir,'s.sock'),secret='synthetic-session-signing-secret-only';
 const server=createV2Server({dataFile:join(dir,'state.json'),researchDirectory:dir,users:[{id:'approved',tid:'synthetic-tenant',oid:'approved-oid',roles:['coordinator']}],authMode:'sso',sessionSecret:secret,publicOrigin:'https://example.test'});await new Promise(r=>server.listen(socket,r));
 const cookie=(oid,expired=false)=>{const raw=Buffer.from(JSON.stringify({tid:'synthetic-tenant',oid,email:'coordinator@example.test',roles:['coordinator'],exp:Math.floor(Date.now()/1000)+(expired?-60:300)})).toString('base64url');return 'ma_ct_session='+raw+'.'+createHmac('sha256',secret).update(raw).digest('base64url');};
 const request=(cookie,method='GET')=>new Promise(resolve=>{const req=http.request({socketPath:socket,path:'/api/classifications',method,headers:{cookie,origin:'https://example.test'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.end(method==='POST'?JSON.stringify({type:'review.import',revision:0}):undefined);});
 try{assert.equal(await request(cookie('unknown-oid')),403);assert.equal(await request(cookie('approved-oid',true)),401);assert.equal(await request(cookie('approved-oid')+'tampered'),401);assert.equal(await request(cookie('approved-oid')),200);assert.equal(await request(cookie('approved-oid'),'POST'),503);}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('private review API requires assigned session, coordinator, exact origin, trusted source, and no-store',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','review-api-'));const socket=join(dir,'server.sock');
 const users=[{id:'coordinator',roles:['coordinator'],token:'synthetic-coordinator-token'},{id:'reader',roles:['reader'],token:'synthetic-reader-token'}];
 const server=createV2Server({dataFile:join(dir,'state.json'),classificationFile:join(dir,'catalog.json'),researchDirectory:dir,users,publicOrigin:'https://example.test'});
 await new Promise(r=>server.listen(socket,r));
 const request=(method,path,payload,cookie='',origin='https://example.test')=>new Promise((resolve,reject)=>{const req=http.request({socketPath:socket,path,method,headers:{origin,cookie,'content-type':'application/json'}},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(raw)}));});req.on('error',reject);req.end(payload===undefined?undefined:JSON.stringify(payload));});
 try{
 const anonymous=await request('GET','/api/classifications');assert.equal(anonymous.status,401);assert.equal(anonymous.headers['cache-control'],'no-store');
 const login=await request('POST','/api/login',{token:users[0].token});const cookie=login.headers['set-cookie'][0].split(';')[0];
 let response=await request('GET','/api/classifications',undefined,cookie);assert.equal(response.data.researchConfigured,true);
 const forged=await request('POST','/api/classifications',{type:'review.import',revision:0,data:{users:[]}},cookie);assert.equal(forged.status,400);
 for(const origin of ['https://evil.test','https://example.test.attacker','null'])assert.equal((await request('POST','/api/classifications',{type:'review.import',revision:0},cookie,origin)).status,403);
 const readerLogin=await request('POST','/api/login',{token:users[1].token});const reader=readerLogin.headers['set-cookie'][0].split(';')[0];assert.equal((await request('POST','/api/classifications',{type:'review.import',revision:0},reader)).status,403);
 await writeFile(join(dir,'classification-proposals.json'),JSON.stringify({schemaVersion:1,mode:'read-only-private-research',window:{start:'2026-11-01',end:'2026-11-17'},users:[]}));await writeFile(join(dir,'evidence.json'),'{}');
 response=await request('POST','/api/classifications',{type:'review.import',revision:0},cookie);assert.equal(response.status,200);assert.equal(response.data.catalog.review.batches.length,1);assert.equal(response.headers['cache-control'],'no-store');
 assert.equal((await request('POST','/api/classifications',{type:'review.import',revision:0},cookie)).status,409);
 assert.equal((await request('GET','/api/classifications',undefined,reader)).status,200);
 await writeFile(join(dir,'catalog.json'),'{"PRIVATE_SECRET_BROKEN":');response=await request('GET','/api/classifications',undefined,cookie);assert.equal(response.status,503);assert.ok(!JSON.stringify(response).includes('PRIVATE_SECRET'));
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
