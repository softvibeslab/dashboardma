import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.js';

async function fixture(run, auth = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'azure-import-'));
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify({workItems:[{id:'ADO-42', azureId:42, project:'Ventas', title:'Confirmar pedido', type:'User Story', state:'Active', assignedTo:'Ana', syncSource:'azure-devops', url:'https://dev.azure.com/MobileappsAmerica/Ventas/_workitems/edit/42'},{id:'WI-LOCAL',title:'Manual'}]}));
  const server = createServer({dataFile:file,auth});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/api`;
  const post = body => fetch(base+'/requirements/import-azure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try { await run({base,post,file}); }
  finally { await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
}

test('one click Azure import atomically creates one requirement and its linked source', async()=>{
 await fixture(async({base,post,file})=>{
  const responses=await Promise.all(Array.from({length:3},()=>post({workItemId:'ADO-42',title:'FORGED',status:'Approved'})));
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,201]);
  assert.equal(new Set(bodies.map(b=>b.item.id)).size,1);
  const item=bodies[0].item;
  assert.equal(item.title,'Confirmar pedido');
  assert.equal(item.status,'Nuevo');
  assert.equal(item.project,'Ventas');
  assert.equal(item.azureWorkItemId,'ADO-42');
  assert.match(item.description,/sincronizad/i);
  const state=JSON.parse(await readFile(file));
  assert.equal(state.requirements.length,1);
  assert.equal(state.requirementSources.length,1);
  assert.equal(state.requirementSources[0].requirementId,item.id);
  assert.equal(state.requirementSources[0].url,state.workItems[0].url);
  assert.equal(state.requirementVersions.length,0);
  assert.equal((await fetch(base+'/requirements').then(r=>r.json())).items[0].id,item.id);
 });
});

test('import rejects unknown/manual items and malformed requests without creating records',async()=>{
 await fixture(async({post,file})=>{
  for(const payload of [null,[],{}, {workItemId:42},{workItemId:'ADO-MISSING'},{workItemId:'WI-LOCAL'}]) {
   const res=await post(payload); assert.ok([400,404].includes(res.status));
  }
  const state=JSON.parse(await readFile(file)); assert.equal((state.requirements||[]).length,0);
 });
});

test('Azure import reuses a previously manually linked requirement without changing its content',async()=>{
 await fixture(async({post,file})=>{
  const state=JSON.parse(await readFile(file));
  state.requirements=[{id:'REQ-EXISTING',title:'Texto revisado',status:'Preguntas'}];
  state.requirementSources=[{id:'SRC-OLD',requirementId:'REQ-EXISTING',url:state.workItems[0].url}];
  await writeFile(file,JSON.stringify(state));
  const res=await post({workItemId:'ADO-42'}); assert.equal(res.status,200);
  const result=await res.json(); assert.equal(result.created,false); assert.equal(result.item.id,'REQ-EXISTING'); assert.equal(result.item.title,'Texto revisado');
 });
});

test('Azure import requires authentication when dashboard authentication is configured',async()=>{
 await fixture(async({post})=>{assert.equal((await post({workItemId:'ADO-42'})).status,401);}, {enabled:true,tenantId:'tenant',clientId:'client',clientSecret:'test',sessionSecret:'test-session'});
});
