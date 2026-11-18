import test from 'node:test';
import assert from 'node:assert/strict';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';

test('search scopes escaped title WIQL and projects only bounded safe metadata without extending import roots',async()=>{
 const calls=[];const client=new AzureIntake({token:'synthetic',allowedIds:[17],fetcher:async(url,opts)=>{
 calls.push({url:String(url),opts});return Response.json(opts.method==='POST'?{workItems:[{id:17},{id:18}]}:{value:[17,18].map(id=>({id,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Synthetic <title>','System.WorkItemType':'User Story','System.State':'New','System.Description':'private'}}))});}});
 const result=await client.search("O'Brien");
 assert.equal(result.items.length,2);assert.equal(result.items[0].importAllowed,true);assert.equal(result.items[1].importAllowed,false);
 assert.deepEqual(Object.keys(result.items[0]).sort(),['id','title','type','state','project','importAllowed'].sort());
 assert.match(JSON.parse(calls[0].opts.body).query,/O''Brien/);assert.match(JSON.parse(calls[0].opts.body).query,/\[System.TeamProject\] = 'agileNestCorp'/);
 assert.equal(new URL(calls[0].url).searchParams.get('$top'),'20');assert.equal(calls[1].opts.method,'GET');assert.ok(calls.every(c=>c.url.startsWith('https://dev.azure.com/MobileappsAmerica/agileNestCorp/_apis/wit/')&&c.opts.redirect==='error'));
 await assert.rejects(()=>client.read(18),/permitido/);
});

import {createV2Server} from '../src/onboarding-v2/server.js';
import {mkdtemp,rm,access} from 'node:fs/promises';
import path from 'node:path';
test('HTTP search fails closed, validates input and method, never writes state',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'search-http-'));let calls=0;
 const server=createV2Server({dataFile:path.join(dir,'state.json'),users:[{id:'editor',roles:['editor'],token:'synthetic-search-editor'},{id:'reader',roles:[],token:'synthetic-search-reader'}],azureIntake:{configured:()=>true,search:async q=>{calls++;return {items:[{id:17,title:q}],limit:20};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const req=(route,body)=>fetch(base+route,{method:body?'POST':'GET',headers:{cookie,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
 assert.equal((await req('/api/azure/search?q=title')).status,401);
 cookie=(await req('/api/login',{token:'synthetic-search-reader'})).headers.get('set-cookie').split(';')[0];
 assert.equal((await req('/api/azure/search?q=title')).status,403);
 cookie=(await req('/api/login',{token:'synthetic-search-editor'})).headers.get('set-cookie').split(';')[0];
 assert.equal((await req('/api/azure/search?q=title',{})).status,405);
 assert.equal((await req('/api/azure/search?q=title&url=https://evil.test')).status,400);
 const response=await req('/api/azure/search?q=title');assert.equal(response.status,200);assert.equal((await response.json()).items[0].id,17);assert.equal(calls,1);
 await assert.rejects(()=>access(path.join(dir,'state.json')),{code:'ENOENT'});
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('search accepts single digit IDs, rejects malformed inputs, caps sources and sanitizes failures',async()=>{
 let calls=0,mode='empty';const client=new AzureIntake({token:'synthetic',allowedIds:[1],fetcher:async(url,opts)=>{calls++;if(mode==='error')return new Response('private-token',{status:401});if(mode==='oversize')return Response.json({workItems:Array.from({length:21},(_,i)=>({id:i+1}))});return Response.json({workItems:[]});}});
 assert.deepEqual((await client.search('1')).items,[]);
 for(const value of ['', 'x', 'x'.repeat(121), 'a\n', '999999999999999999999'])await assert.rejects(()=>client.search(value),e=>e.status===400);
 assert.equal(calls,1);mode='oversize';await assert.rejects(()=>client.search('title'),e=>e.status===502);
 mode='error';await assert.rejects(()=>client.search('title'),e=>e.status===502&&!e.message.includes('private-token'));
 await assert.rejects(()=>new AzureIntake().search('title'),e=>e.status===503);
});
