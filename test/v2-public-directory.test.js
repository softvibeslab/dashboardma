import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('explicit public directory exposes only names/fronts without session while private APIs stay protected',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','public-directory-'));
 const source=join(dir,'source.json'),catalog=join(dir,'catalog.json');
 await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'azure-private-001',name:'Persona de prueba',email:'private@example.test',projects:['Secret project']},{id:'azure-private-002',name:'fallback@example.test',email:'fallback@example.test',projects:[]}]}));
 const original={revision:7,fronts:[{id:'front-private',name:'Android',active:true}],participations:[{userId:'azure-private-001',frontId:'front-private',enabled:true,notes:'Confidential notes'}],audit:[{actor:'private-user'}]};
 await writeFile(catalog,JSON.stringify(original));
 const options={basePath:'/dashboard/onboarding-v2',authMode:'sso',sessionSecret:'synthetic-public-directory-test',directoryFile:source,classificationFile:catalog,publicOrigin:'https://example.test'};
 const server=createV2Server({...options,publicDirectory:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v2`;
 let disabled;
 try{
  const response=await fetch(base+'/api/directory');assert.equal(response.status,200,'Anonymous directory must work when explicitly enabled');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['source','syncedAt','users']);assert.equal(data.users.length,2);
  assert.ok(data.users.some(u=>u.name==='Persona de prueba'&&u.fronts.includes('Android')));
  assert.ok(data.users.every(u=>Object.keys(u).sort().join(',')==='fronts,name'));
  const serialized=JSON.stringify(data);for(const secret of ['@','azure-private','Secret project','Confidential notes','private-user'])assert.ok(!serialized.includes(secret),'Public response leaked '+secret);
  for(const route of ['/api/classifications','/api/state','/api/access','/api/package'])assert.equal((await fetch(base+route)).status,401,route+' must still require session');
  assert.equal((await fetch(base+'/api/directory',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:'{}'})).status,405);
  assert.equal(await readFile(catalog,'utf8'),JSON.stringify(original),'Anonymous reads do not mutate or import data');
  disabled=createV2Server(options);await new Promise(r=>disabled.listen(0,'127.0.0.1',r));assert.equal((await fetch(`http://127.0.0.1:${disabled.address().port}/dashboard/onboarding-v2/api/directory`)).status,404,'Public directory is opt-in');
  await writeFile(catalog,'{"private":"CONFIDENTIAL-CONTENT", broken');
  const broken=await fetch(base+'/api/directory');assert.equal(broken.status,503,'Corrupt private storage must not leak through public error messages');assert.ok(!(await broken.text()).includes('CONFIDENTIAL-CONTENT'));
 }finally{await new Promise(r=>server.close(r));if(disabled)await new Promise(r=>disabled.close(r));await rm(dir,{recursive:true,force:true});}
});
