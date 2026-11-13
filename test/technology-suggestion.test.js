import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
async function fixture(fn) {
 const dir = await mkdtemp(path.join(tmpdir(), 'technology-'));
 const dataFile = path.join(dir, 'state.json');
 await writeFile(dataFile, JSON.stringify({requirements:[{id:'R1',project:'Pilot',title:'Android venta'}], requirementVersions:[{id:'V1',requirementId:'R1',version:1,summary:'Venta Android',cp1:{userStory:'Registrar venta'}}], users:[{id:'U1',name:'Persona',email:'owner@example.test',projects:['Pilot'],team:'Pilot',syncSource:'azure-devops',azureIdentityKey:'owner@example.test'},{id:'U2',email:'other@example.test',projects:['Other'],syncSource:'azure-devops'}],workItems:[{id:'ADO-1',azureId:1,project:'Pilot',assignedUserId:'U1',syncSource:'azure-devops'}]}));
 const server = createServer({dataFile,auth:{enabled:false},enrichment:{enabled:true,requireWorker:false}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/dashboard/api`;
 const request=async(p,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+p,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,...await r.json()};};
 try {await fn({dir,dataFile,request});}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
test('trusted Azure users cannot be forged or retargeted; manual users remain editable',()=>fixture(async({request})=>{
 assert.equal((await request('/users',{name:'Fake',email:'fake@example.test',projects:['Pilot'],syncSource:'azure-devops'})).status,400);
 assert.equal((await request('/users/U1',{email:'fake@example.test'},'PUT')).status,400);
 assert.equal((await request('/users/U1',{projects:['Other']},'PUT')).status,400);
 assert.equal((await request('/users/U1',{capacity:80},'PUT')).status,200);
 const manual=await request('/users',{name:'Manual',email:'manual@example.test'});
 assert.equal(manual.status,201);
 assert.equal((await request('/users/'+manual.item.id,{email:'edited@example.test'},'PUT')).status,200);
 assert.equal((await request('/users/'+manual.item.id,{syncSource:'azure-devops'},'PUT')).status,400);
 assert.equal((await request('/workItems/ADO-1',{assignedUserId:'U2'},'PUT')).status,400);
}));
test('explicit suggestion queues project-scoped evidence and never saves configuration',()=>fixture(async({request,dir})=>{
 await request('/requirements/R1/wizard',{action:'next',expectedRevision:0});
 const before=await request('/requirements/R1/wizard');
 const context=await request('/requirements/R1/technology-suggestion');
 assert.equal(context.status,200);
 assert.deepEqual(context.candidates.map(c=>c.email),['owner@example.test']);
 const queued=await request('/requirements/R1/technology-suggestion',{expectedRevision:before.flow.revision,versionId:'V1',contextHash:context.context.hash});
 assert.equal(queued.status,202); assert.equal(queued.run.status,'queued'); assert.deepEqual(queued.tracks,[]);
 const bytes=await readFile(path.join(dir,'enrichment-jobs',queued.run.id+'.request.json'));
 const snapshot=JSON.parse(bytes);
 assert.equal(snapshot.kind,'technology-suggestion'); assert.equal(snapshot.selectedVersion.id,'V1');
 assert.equal(bytes.includes('other@example.test'),false);
 assert.equal(snapshot.candidates[0].assignmentIds[0],'ADO-1');
 assert.equal(snapshot.candidates[0].assignments[0].id,'ADO-1');
 assert.equal(snapshot.candidates[0].assignments[0].project,'Pilot');
 await writeFile(path.join(dir,'enrichment-jobs',queued.run.id+'.result.json'),JSON.stringify({runId:queued.run.id,kind:'technology-suggestion',status:'completed',toolsCount:0,inputHash:crypto.createHash('sha256').update(bytes).digest('hex'),tracks:[{technology:'Android',area:'Ventas',ownerEmail:'owner@example.test',confidence:'medium',rationale:'Asignación sincronizada ADO-1 en el proyecto; experiencia no verificada.',evidenceIds:['ADO-1']}],model:'test-boundary'}));
 const completed=await request('/requirements/R1/technology-suggestion');
 assert.equal(completed.run.status,'completed');assert.equal(completed.tracks[0].technology,'Android');
 const after=await request('/requirements/R1/wizard');
 assert.deepEqual(after.flow,before.flow);
 assert.equal((await request('/requirements/R1/technology-suggestion',{expectedRevision:0,versionId:'V1',contextHash:context.context.hash})).status,409);
}));

const proposal = (email='owner@example.test') => ({technology:'Android',area:'Ventas',ownerEmail:email,confidence:email?'medium':'low',rationale:'Asignación de proyecto, sin especialidad verificada. Requiere revisión humana.',evidenceIds:email?['ADO-1']:[]});
async function queueFixture(request) {
 await request('/requirements/R1/wizard',{action:'next',expectedRevision:0});
 const c=await request('/requirements/R1/technology-suggestion');
 const body={expectedRevision:c.context.expectedRevision,versionId:c.context.versionId,contextHash:c.context.hash};
 return {queued:await request('/requirements/R1/technology-suggestion',body),body};
}
async function complete(dir,run,tracks,extra={}) {
 const bytes=await readFile(path.join(dir,'enrichment-jobs',run.id+'.request.json'));
 await writeFile(path.join(dir,'enrichment-jobs',run.id+'.result.json'),JSON.stringify({runId:run.id,kind:'technology-suggestion',status:'completed',toolsCount:0,inputHash:crypto.createHash('sha256').update(bytes).digest('hex'),tracks,model:'offline-fixture',...extra}));
}
for(const [name,tracks,extra] of [
 ['invented email',[proposal('invented@example.test')],{}],
 ['other project email',[proposal('other@example.test')],{}],
 ['wrong assignment',[{...proposal(),evidenceIds:['ADO-OTHER']}],{}],
 ['forged input hash',[proposal()],{inputHash:'wrong'}],
 ['tools used',[proposal()],{toolsCount:1}],
 ['extra track fields',[{...proposal(),approved:true}],{}]
])test('server rejects '+name,()=>fixture(async({request,dir})=>{
 const {queued}=await queueFixture(request);await complete(dir,queued.run,tracks,extra);
 const result=await request('/requirements/R1/technology-suggestion');assert.equal(result.run.status,'failed');assert.deepEqual(result.tracks,[]);
}));
test('no candidates yields pending owner, never fabricated email',()=>fixture(async({request,dir})=>{
 await request('/users/U1',undefined,'DELETE');
 const {queued}=await queueFixture(request);await complete(dir,queued.run,[proposal('')]);
 const result=await request('/requirements/R1/technology-suggestion');assert.equal(result.run.status,'completed');assert.equal(result.tracks[0].ownerEmail,'');assert.deepEqual(result.candidates,[]);
}));
for(const mutation of ['requirement','version','candidate','stage'])test('source invalidation: '+mutation,()=>fixture(async({request,dir,dataFile})=>{
 const {queued}=await queueFixture(request);await complete(dir,queued.run,[proposal()]);
 if(mutation==='requirement')await request('/requirements/R1',{description:'edited'},'PUT');
 if(mutation==='candidate')await request('/users/U1',undefined,'DELETE');
 if(mutation==='stage')await request('/requirements/R1/wizard',{action:'back',expectedRevision:1});
 if(mutation==='version'){const data=JSON.parse(await readFile(dataFile));data.requirementVersions[0].summary='changed';await writeFile(dataFile,JSON.stringify(data));}
 const result=await request('/requirements/R1/technology-suggestion');assert.equal(result.run.status,'stale');assert.deepEqual(result.tracks,[]);
}));
test('concurrent requests share one durable job; daily per actor quota cannot be reset by retries',()=>fixture(async({request,dir})=>{
 const {queued,body}=await queueFixture(request);
 const clicks=await Promise.all(Array.from({length:8},()=>request('/requirements/R1/technology-suggestion',body)));
 assert.ok(clicks.every(c=>c.run.id===queued.run.id));
 let run=queued.run;
 for(let i=1;i<=10;i++){
  await complete(dir,run,[proposal()]);await request('/requirements/R1/technology-suggestion');
  const next=await request('/requirements/R1/technology-suggestion',body);
  if(i===10)assert.equal(next.status,429);else {assert.equal(next.status,202);run=next.run;}
 }
}));
test('stage zero and unsaved selected versions never queue inference',()=>fixture(async({request})=>{
 const c=await request('/requirements/R1/technology-suggestion');
 assert.equal((await request('/requirements/R1/technology-suggestion',{expectedRevision:0,versionId:'V1',contextHash:c.context.hash})).status,409);
 await request('/requirements/R1/wizard',{action:'next',expectedRevision:0});
 assert.equal((await request('/requirements/R1/technology-suggestion',{expectedRevision:1,versionId:'OTHER',contextHash:c.context.hash})).status,409);
}));

test('context edited while reading a worker result is rejected before publishing proposal',()=>fixture(async({request,dataFile})=>{
 const {queued}=await queueFixture(request);
 const {JsonStore}=await import('../src/store.js'); const {RequirementWizard}=await import('../src/wizard.js');
 const {RequirementWorkspace}=await import('../src/workspace.js'); const {TechnologySuggestion}=await import('../src/technology-suggestion.js');
 const store=new JsonStore(dataFile);const workspace=new RequirementWorkspace(store,{enabled:true,requireWorker:false});
 workspace.outcome=async()=>{await store.update('requirements','R1',{description:'source changed during result read'});return {status:'completed',kind:'technology-suggestion',toolsCount:0,inputHash:queued.run.inputHash,tracks:[proposal()]};};
 const service=new TechnologySuggestion(new RequirementWizard(store,workspace),workspace);
 const result=await service.view('R1');assert.equal(result.run.status,'stale');assert.deepEqual(result.tracks,[]);
}));
test('stale pending jobs retain their concurrency slot until the durable worker terminates',()=>fixture(async({request})=>{
 const {queued}=await queueFixture(request);
 await request('/requirements/R1',{description:'changed while queued'},'PUT');
 const current=await request('/requirements/R1/technology-suggestion');assert.equal(current.run.status,'stale');
 const retry=await request('/requirements/R1/technology-suggestion',{expectedRevision:current.context.expectedRevision,versionId:current.context.versionId,contextHash:current.context.hash});
 assert.equal(retry.status,409);assert.notEqual(queued.run.id,undefined);
}));
test('sixth active suggestion is rejected and completed unvisited jobs release capacity',()=>fixture(async({request,dataFile,dir})=>{
 const data=JSON.parse(await readFile(dataFile));
 for(let i=2;i<=6;i++){data.requirements.push({id:'R'+i,project:'Pilot',title:'Synthetic '+i});data.requirementVersions.push({id:'V'+i,requirementId:'R'+i,version:1,summary:'Synthetic'});}
 await writeFile(dataFile,JSON.stringify(data));
 const queued=[];
 for(let i=1;i<=6;i++){
  const id='R'+i;await request('/requirements/'+id+'/wizard',{action:'next',expectedRevision:0});
  const c=await request('/requirements/'+id+'/technology-suggestion');
  const response=await request('/requirements/'+id+'/technology-suggestion',{expectedRevision:c.context.expectedRevision,versionId:c.context.versionId,contextHash:c.context.hash});
  if(i===6)assert.equal(response.status,429);else{assert.equal(response.status,202);queued.push(response);}
 }
 await complete(dir,queued[0].run,[proposal()]);
 const c=await request('/requirements/R6/technology-suggestion');
 assert.equal((await request('/requirements/R6/technology-suggestion',{expectedRevision:c.context.expectedRevision,versionId:c.context.versionId,contextHash:c.context.hash})).status,202);
}));
test('snapshot uses only selected-version approved answers and never browser supplied candidates',()=>fixture(async({request,dataFile,dir})=>{
 const data=JSON.parse(await readFile(dataFile));
 const answer='Approved selected answer';
 data.requirementQuestions=[{id:'Q1',requirementId:'R1',versionId:'V1',question:'What?',answer,answerStatus:'approved',answerHistory:[{action:'approve',hash:crypto.createHash('sha256').update(answer).digest('hex')}]},{id:'Q2',requirementId:'R1',versionId:'OLD',question:'private older answer',answer:'do not use',answerStatus:'approved'},{id:'Q3',requirementId:'OTHER',versionId:'V1',question:'other client',answer:'not allowed'}];
 await writeFile(dataFile,JSON.stringify(data));
 const {queued}=await queueFixture(request);
 const snapshot=JSON.parse(await readFile(path.join(dir,'enrichment-jobs',queued.run.id+'.request.json')));
 assert.deepEqual(snapshot.approvedAnswers.map(q=>q.id),['Q1']);assert.equal(snapshot.approvedAnswers[0].answer,answer);
 assert.equal(JSON.stringify(snapshot).includes('other client'),false);assert.equal(JSON.stringify(snapshot).includes('private older answer'),false);
}));
export { fixture };
