import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
test('V3 catalog adapter rereads approved read-only source, omits research/audit and rejects writes',async()=>{
 const {ReadOnlyCatalogAdapter}=await import('../src/onboarding-v3/catalog-adapter.js');
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'v3-catalog-')),file=path.join(dir,'source.json');
 const original=JSON.stringify({revision:4,fronts:[{id:'C1',name:'Android',active:true,evidence:'private'}],participations:[{userId:'az-1',frontId:'C1',roles:['developer'],projects:['agileNestCorp'],level:'principal',enabled:true,reason:'private'}],audit:[{secret:'private'}],review:{proposals:['private']},directory:{users:['private']}});await writeFile(file,original);
 try{const c=new ReadOnlyCatalogAdapter(file);const v=await c.view();assert.equal(v.revision,4);assert.doesNotMatch(JSON.stringify(v),/private/);assert.equal(v.participations[0].enabled,true);
 await assert.rejects(()=>c.act({},{}),e=>e.status===403);assert.equal(await readFile(file,'utf8'),original);
 await writeFile(file,JSON.stringify({revision:5,fronts:[],participations:[]}));assert.equal((await c.withSnapshot(s=>s)).revision,5);
 }finally{await rm(dir,{recursive:true,force:true});}
});
