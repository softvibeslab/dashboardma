import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {ClassificationStore} from '../src/onboarding-v2/classifications.js';
import {StaffingService} from '../src/onboarding-v2/staffing.js';
import {spawnSync} from 'node:child_process';
test('independent Node process cannot bypass an active catalog snapshot lock',async()=>{
 const f=await fixture();try{
 const moduleUrl=new URL('../src/onboarding-v2/classifications.js',import.meta.url).href;
 await f.store.withSnapshot(async()=>{
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import {ClassificationStore} from ${JSON.stringify(moduleUrl)}; const store=new ClassificationStore(process.argv[1],{researchDirectory:process.argv[2]}); try{await store.act({type:'review.import',revision:2},{id:'synthetic-process',authenticated:true,roles:['coordinator']});process.exit(5);}catch(e){process.exit(e.status===503?0:6);}`,f.file,f.dir]);assert.equal(child.status,0,child.stderr.toString());
 });assert.deepEqual(await f.store.view(),f.s);
 }finally{await f.cleanup();}
});
test('reference DTO retains historical caveats and work-item date provenance, never raw text or identities',async()=>{
 const f=await fixture();try{
 await writeFile(join(f.dir,'evidence.json'),JSON.stringify({'wi:1':{type:'workItem',changedDate:'2026-11-15T00:00:00Z',caveat:'Assignment is not authorship',historyPartial:true,descriptionExcerpt:'RAW_SECRET',assignedTo:{email:'private@example.test'}}}));
 const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator),e=s.review.proposals[0].evidence[0];assert.equal(e.date,'2026-11-15T00:00:00Z');assert.equal(e.dateKind,'changedDate');assert.equal(e.caveat,'Assignment is not authorship');assert.equal(e.historyPartial,true);assert.ok(!JSON.stringify(s).includes('RAW_SECRET'));assert.ok(!JSON.stringify(s).includes('private@example.test'));
 }finally{await f.cleanup();}
});
test('competing accept/reject commits one whole decision and catalog remains readable after restart',async()=>{
 const f=await fixture();try{
 const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator),p=s.review.proposals[0];
 const action={type:'review.decide',id:p.id,revision:s.revision,data:{outcome:'accept',reason:'Reviewed',batchHash:p.batchHash,participation:{frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Synthetic project'],enabled:true}}};
 const other=new ClassificationStore(f.file,{directoryFile:f.directoryFile,researchDirectory:f.dir});const results=await Promise.allSettled([f.store.act(action,coordinator),other.act({...action,data:{outcome:'reject',reason:'Competing review',batchHash:p.batchHash}},coordinator)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const next=await new ClassificationStore(f.file).view();assert.equal(next.revision,s.revision+1);assert.equal(next.review.proposals[0].history.length,1);assert.equal(next.participations.length,next.review.proposals[0].status==='accepted'?1:0);
 }finally{await f.cleanup();}
});

test('source schema, exact batch, current directory and required reason fail closed without changes',async()=>{
 const f=await fixture();try{
 await writeFile(join(f.dir,'classification-proposals.json'),JSON.stringify({...research(),schemaVersion:99}));await assert.rejects(()=>f.store.act({type:'review.import',revision:f.s.revision},coordinator),/Esquema/);assert.deepEqual(await f.store.view(),f.s);
 await writeFile(join(f.dir,'classification-proposals.json'),JSON.stringify(research()));const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator),p=s.review.proposals[0];
 const action={type:'review.decide',id:p.id,revision:s.revision,data:{outcome:'accept',reason:'Reviewed',batchHash:p.batchHash,participation:{frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Synthetic project'],enabled:true}}};
 await assert.rejects(()=>f.store.act({...action,data:{...action.data,batchHash:'forged'}},coordinator),/exacta/);await assert.rejects(()=>f.store.act({...action,data:{...action.data,reason:''}},coordinator),/Motivo/);
 await writeFile(f.directoryFile,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-18',users:[]}));await assert.rejects(()=>f.store.act(action,coordinator),/Copia actual/);assert.deepEqual(await f.store.view(),s);
 }finally{await f.cleanup();}
});
test('real research schema includes low-confidence suggestions which stay non-confirmable',async()=>{
 const f=await fixture();try{
 const r=research();r.users[0].proposedFronts[0].confidence='baja';await writeFile(join(f.dir,'classification-proposals.json'),JSON.stringify(r));
 const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator),p=s.review.proposals[0];assert.equal(p.confidence,'baja');
 await assert.rejects(()=>f.store.act({type:'review.decide',revision:s.revision,id:p.id,data:{outcome:'accept',reason:'Try',batchHash:p.batchHash,participation:{frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Synthetic project'],enabled:true}}},coordinator));assert.deepEqual(await f.store.view(),s);
 }finally{await f.cleanup();}
});
test('single-writer file lock fails closed without touching catalog and resumes after operator recovery',async()=>{
 const f=await fixture();try{
 await writeFile(f.file+'.lock','synthetic other process');
 await assert.rejects(()=>f.store.act({type:'review.import',revision:f.s.revision},coordinator),e=>e.status===503);
 assert.deepEqual(await f.store.view(),f.s);
 await rm(f.file+'.lock');const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator);assert.equal(s.review.batches.length,1);
 }finally{await f.cleanup();}
});
test('shared catalog instances serialize competing import and decisions with optimistic revision',async()=>{
 const f=await fixture();try{
 const other=new ClassificationStore(f.file,{directoryFile:f.directoryFile,researchDirectory:f.dir});
 const results=await Promise.allSettled([f.store,other].map(store=>store.act({type:'review.import',revision:f.s.revision},coordinator)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const s=await f.store.view();assert.equal(s.review.batches.length,1);assert.equal(s.revision,f.s.revision+1);
 }finally{await f.cleanup();}
});

test('unknown, absent, insufficient and missing-evidence proposals remain pending and cannot create candidates',async()=>{
 const f=await fixture();try{
 const r=research();r.users.push({azureIdentityKey:'absent',proposedFronts:[{front:'Android',confidence:'media',reason:'Historical',evidenceIds:['missing:1']}]},{azureIdentityKey:'insufficient',proposedFronts:[],insufficientExplanation:'No proof'});await writeFile(join(f.dir,'classification-proposals.json'),JSON.stringify(r));
 const s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator);
 for(const p of s.review.proposals.slice(1))await assert.rejects(()=>f.store.act({type:'review.decide',revision:s.revision,id:p.id,data:{outcome:'accept',reason:'Try',batchHash:p.batchHash,participation:{frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Synthetic project'],enabled:true}}},coordinator));
 assert.deepEqual(await f.store.view(),s);assert.equal(s.participations.length,0);
 }finally{await f.cleanup();}
});

test('exact decision and validated participation commit together; replay and invalid projects leave no decision',async()=>{
 const f=await fixture();try{
 let s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator);const p=s.review.proposals[0];
 const participation={frontId:s.fronts[0].id,level:'principal',roles:['developer'],projects:['Synthetic project'],enabled:true};
 const action={type:'review.decide',revision:s.revision,id:p.id,data:{outcome:'accept',reason:'Reviewed exact historical evidence',batchHash:p.batchHash,participation}};
 for(const altered of [{...participation,projects:['Invented']},{...participation,enabled:undefined},{...participation,roles:[]},{...participation,userId:'forged'}]){
 await assert.rejects(()=>f.store.act({...action,data:{...action.data,participation:altered}},coordinator));
 assert.deepEqual(await f.store.view(),s);
 }
 s=await f.store.act(action,coordinator);assert.equal(s.participations.length,1);assert.equal(s.review.proposals[0].status,'accepted');assert.equal(s.review.proposals[0].history.length,1);assert.equal(s.review.proposals[0].history[0].participationId,s.participations[0].id);
 await assert.rejects(()=>f.store.act({...action,revision:s.revision},coordinator),/decidida|pendiente|revisada/i);
 const staffing=await new StaffingService(f.store,{directoryFile:f.directoryFile}).current();assert.ok(JSON.stringify(staffing).includes('synthetic:a'));
 }finally{await f.cleanup();}
});

test('correct and reject retain reasons, batches and immutable prior decisions without implicit assignments',async()=>{
 const f=await fixture();try{
 let s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator);const p=s.review.proposals[0];
 s=await f.store.act({type:'front.create',revision:s.revision,data:{name:'Web'}},coordinator);
 s=await f.store.act({type:'review.decide',id:p.id,revision:s.revision,data:{outcome:'correct',reason:'Reviewed correction',batchHash:p.batchHash,participation:{frontId:s.fronts[1].id,level:'secondary',roles:['support'],projects:['Synthetic project'],enabled:false}}},coordinator);
 assert.equal(s.review.proposals[0].status,'corrected');assert.equal(s.participations[0].enabled,false);
 const changed=research();changed.users[0].proposedFronts[0].reason='New version';await writeFile(join(f.dir,'classification-proposals.json'),JSON.stringify(changed));
 s=await f.store.act({type:'review.import',revision:s.revision},coordinator);assert.equal(s.review.proposals.length,2);assert.equal(s.review.proposals[0].status,'corrected');const second=s.review.proposals[1];
 s=await f.store.act({type:'review.decide',revision:s.revision,id:second.id,data:{outcome:'reject',reason:'Insufficient evidence',batchHash:second.batchHash}},coordinator);
 assert.equal(s.review.proposals[1].status,'rejected');assert.equal(s.participations.length,1);assert.equal(s.review.batches.length,2);
 }finally{await f.cleanup();}
});
export const coordinator={id:'synthetic-coordinator',authenticated:true,roles:['coordinator']};
export const research=()=>({schemaVersion:1,mode:'read-only-private-research',window:{start:'2026-08-19T00:00:00Z',end:'2026-11-17T00:00:00Z'},users:[{azureIdentityKey:'synthetic:a',proposedFronts:[{front:'Android',confidence:'alta',reason:'Historical code <img src=x onerror=alert(1)>',evidenceIds:['wi:1']}]}]});
export async function fixture(){const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','review-'));const file=join(dir,'catalog.json');const directoryFile=join(dir,'directory.json');await writeFile(directoryFile,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-17T00:00:00Z',users:[{id:'synthetic:a',name:'Synthetic A',projects:['Synthetic project']}]}));await writeFile(join(dir,'classification-proposals.json'),JSON.stringify(research()));await writeFile(join(dir,'evidence.json'),JSON.stringify({'wi:1':{type:'workitem',id:1,date:'2026-11-15T00:00:00Z',raw:'RAW_SECRET_NEVER_COPY',description:'PRIVATE_RAW'}}));const store=new ClassificationStore(file,{directoryFile,researchDirectory:dir});let s=await store.act({type:'directory.sync',revision:0},coordinator);s=await store.act({type:'front.create',revision:s.revision,data:{name:'Android'}},coordinator);return {dir,file,directoryFile,store,s,cleanup:()=>rm(dir,{recursive:true,force:true})};}
test('fixed private source imports deterministically without activating or copying raw operational evidence',async()=>{const f=await fixture();try{let s=await f.store.act({type:'review.import',revision:f.s.revision},coordinator);assert.equal(s.participations.length,0);assert.equal(s.review.proposals.length,1);assert.equal(s.review.proposals[0].status,'pending');assert.match(s.review.batches[0].hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(s).includes('RAW_SECRET'));const again=await f.store.act({type:'review.import',revision:s.revision},coordinator);assert.deepEqual(again,s);await assert.rejects(()=>f.store.act({type:'review.import',revision:s.revision,data:research()},coordinator),/cliente|permitido/i);await assert.rejects(()=>f.store.act({type:'review.import',revision:s.revision},{...coordinator,roles:['reader']}),/coordinator/);}finally{await f.cleanup();}});
