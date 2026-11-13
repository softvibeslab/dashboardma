import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { createV2Server } from '../src/onboarding-v2/server.js';
test('isolated HTTP auth, CSRF, role controls, optimistic serialization, persistence and private routes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'v2-http-'));
 const options={dataFile:path.join(dir,'v2.json'),users:[{id:'owner',roles:['editor','coordinator'],token:'test-only-owner-token'},{id:'viewer',roles:['reader'],token:'test-only-viewer-token'}]};
 const srv=createV2Server(options);await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${srv.address().port}`;
 const request=(url,body,cookie,origin=base)=>fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
 assert.equal((await request('/api/state')).status,401);
 const login=await request('/api/login',{token:'test-only-owner-token'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const view=await (await request('/api/state',null,cookie)).json();assert.equal(view.state.revision,0);assert.equal(view.actor.mode,'local-review');
 const a={type:'save',phase:1,revision:0,data:{title:'TEST',owner:'owner',context:'test'}};
 assert.equal((await request('/api/action',a,cookie,'https://evil.test')).status,403);
 const results=await Promise.all([request('/api/action',a,cookie),request('/api/action',a,cookie)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(JSON.parse(await readFile(options.dataFile,'utf8')).revision,1);
 const other=await request('/api/login',{token:'test-only-viewer-token'});const vc=other.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/action',{...a,revision:1},vc)).status,403);
 assert.equal((await request('/api/package',null,cookie)).status,409);
 assert.equal((await request('/dashboard')).status,404);
 assert.equal((await request('/')).status,200);
 assert.equal((await request('/api/login',{token:'bad'})).status,401);
 }finally{await new Promise(r=>srv.close(r));await rm(dir,{recursive:true,force:true});}
});
