import test from 'node:test';
import assert from 'node:assert/strict';
import { createAzureSources, azureSourcesMarkup } from '../public/dashboard/requirements/onboarding/azure-sources.js';

test('Azure sources reads cached ticket then explicitly queues and polls metadata only',async()=>{
 const calls=[], paints=[]; let reads=0;
 const c=createAzureSources({id:'R1',render:s=>paints.push(s),request:async(url,init)=>{calls.push({url,method:init?.method||'GET'});if(init?.method==='POST')return {status:'queued',workItem:{id:42}};return ++reads===1?{status:'not_loaded',workItem:{id:42}}:{status:'completed',items:[{name:'source.pdf'}],workItem:{id:42}};}});
 await c.load(); assert.equal(c.state.data.status,'not_loaded'); assert.equal(calls.length,1);
 await c.refresh(); assert.equal(c.state.data.status,'queued');
 await c.load(); assert.equal(c.state.data.status,'completed');
 assert.deepEqual(calls.map(x=>x.method),['GET','POST','GET']);
 assert.ok(calls.every(x=>x.url==='/dashboard/api/requirements/R1/azure-attachments'));
 assert.ok(azureSourcesMarkup().includes('Fuentes de Azure DevOps'));
 assert.ok(azureSourcesMarkup().includes('no significa'));
});

test('Azure source controller isolates late responses and blocks duplicate writes',async()=>{
 let resolve,posts=0; const paints=[];
 const c=createAzureSources({id:'R2',render:s=>paints.push(s),request:async(_,init)=>{if(init?.method==='POST'){posts++; return new Promise(r=>resolve=r);}return {status:'unlinked'};}});
 const work=c.refresh(); await c.refresh(); assert.equal(posts,1);
 c.destroy(); const n=paints.length;resolve({status:'queued'});await work;assert.equal(paints.length,n);
});

test('Azure source errors preserve cached metadata and allow explicit retry',async()=>{
 let fail=false;
 const c=createAzureSources({id:'R3',request:async()=>{if(fail)throw Error('Prueba de conexión fallida');return {status:'completed',items:[{name:'a.pdf'}]};}});
 await c.load();fail=true;await c.refresh();assert.equal(c.state.data.items[0].name,'a.pdf');assert.match(c.state.error,/conexión/);assert.equal(c.state.busy,false);
});
