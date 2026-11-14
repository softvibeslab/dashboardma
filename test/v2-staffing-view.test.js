import test from 'node:test';
import assert from 'node:assert/strict';

import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {join} from 'node:path';
const app = await import('../public/onboarding-v2/app.js');
const staffing = {required:true, token:'current-token', catalogRevision:'r2', directorySyncedAt:'2026-01-01', fronts:[{id:'android',name:'Android'}], projects:['Demo'], candidates:[
 {userId:'azure-dev',name:'Dev Synthetic',frontId:'android',project:'Demo',roles:['developer','reviewer'],level:'principal',canConfirm:true,canReview:true},
 {userId:'azure-review',name:'Review Synthetic',frontId:'android',project:'Demo',roles:['reviewer'],level:'secondary',canConfirm:false,canReview:true},
 {userId:'other-project',name:'Other',frontId:'android',project:'Other',roles:['developer'],canConfirm:true},
 {userId:'other-front',name:'Other',frontId:'web',project:'Demo',roles:['developer'],canConfirm:true}
],warning:null};
test('scope changes reset assignments, update discipline and preserve deliverable fields',()=>{
 assert.equal(typeof app.changeStaffingScope,'function');
 for(const [field,value] of [['project','Other'],['catalogFrontId','web']]){
  const changed=app.changeStaffingScope(front,field,value,staffing);
  assert.equal(changed[field],value);assert.equal(changed.owner,'');assert.equal(changed.reviewer,'');assert.equal(changed.confirmed,false);
  for(const k of ['id','deliverable','repository','area','dependencies','contract'])assert.deepEqual(changed[k],front[k]);
 }
 assert.equal(app.changeStaffingScope(front,'catalogFrontId','android',staffing).discipline,'Android');
 assert.equal(app.changeStaffingScope(front,'catalogFrontId','missing',staffing).discipline,'');
 assert.equal(front.owner,'azure-dev');
});
test('phase two payload sends fresh token without granting candidate permissions',()=>{
 assert.equal(typeof app.phaseSaveData,'function');
 const draft={fronts:[front],catalogToken:'stale',catalogRevision:'old',directorySyncedAt:'old'};
 assert.deepEqual(app.phaseSaveData(2,draft,staffing),{...draft,catalogToken:staffing.token});
 assert.equal(draft.catalogToken,'stale');
 assert.equal(app.phaseSaveData(2,draft,undefined),draft);
 assert.equal(app.phaseSaveData(3,draft,staffing),draft);
 assert.equal(app.phaseSaveData(2,draft,{...staffing,required:false}),draft);
});
test('governed permissions require explicit Azure mapping and RBAC; legacy stays RBAC based',()=>{
 assert.equal(typeof app.canConfirmFront,'function');assert.equal(typeof app.canDecideObject,'function');
 const editor={id:'azure-dev',roles:['editor']};
 assert.equal(app.canConfirmFront(editor,front),false);
 assert.equal(app.canConfirmFront({...editor,azureIdentityKey:'azure-dev'},front),true);
 assert.equal(app.canConfirmFront({...editor,roles:[],azureIdentityKey:'azure-dev'},front),false);
 assert.equal(app.canConfirmFront(editor,{id:'legacy',owner:editor.id}),true);
 const reviewer={id:'rbac-review',azureIdentityKey:'azure-review',roles:['reviewer','qa']};
 assert.equal(app.canDecideObject(reviewer,'front:F1',frontsState()),true);
 assert.equal(app.canDecideObject({...reviewer,azureIdentityKey:undefined,id:'azure-review'},'front:F1',frontsState()),false);
 assert.equal(app.canDecideObject(reviewer,'spec',frontsState()),true);
 assert.equal(app.canDecideObject(reviewer,'tests',frontsState()),true);
 assert.equal(app.canDecideObject({...reviewer,id:'wrong'},'spec',frontsState()),false);
});
function frontsState(){return {2:{fronts:[front]},4:{reviewer:'rbac-review'},5:{reviewer:'rbac-review'}};}
test('governed editor renders named catalog choices, stale values, empty recovery and identity warning',()=>{
 assert.equal(typeof app.renderEditor,'function');
 const state={staffing,actor:{id:'rbac',roles:['editor']},identities:[{id:'legacy-rbac'}]};
 const data={fronts:[{...front,confirmed:false}],catalogToken:'stale'};
 const before=structuredClone(data);
 const html=app.renderEditor(2,data,state);
 assert.match(html,/data-path="fronts.0.catalogFrontId"/);assert.match(html,/data-path="fronts.0.project"/);
 assert.match(html,/Dev Synthetic/);assert.match(html,/Review Synthetic/);assert.doesNotMatch(html,/legacy-rbac/);
 assert.doesNotMatch(html,/data-path="fronts.0.discipline"/);
 assert.match(html,/Candidato/);assert.match(html,/catálogo cambió/);assert.match(html,/vínculo de identidad/i);
 assert.match(html,/classifications/);assert.deepEqual(data,before);
 const stale=app.renderEditor(2,{fronts:[{...front,owner:'retired-id'}]},state);
 assert.match(stale,/<option value="retired-id" selected disabled>No vigente/);
 const empty=app.renderEditor(2,{fronts:[front]},{...state,staffing:{...staffing,fronts:[],candidates:[],warning:'Sin catálogo disponible'}});
 assert.match(empty,/Sin catálogo disponible/);assert.match(empty,/No hay frentes activos/);assert.match(empty,/No hay candidatos/);
 const confirmed=app.renderEditor(2,{fronts:[{...front,confirmed:true}],catalogToken:staffing.token},state);assert.match(confirmed,/Confirmado por responsable/);
 const legacy=app.renderEditor(2,{fronts:[front]},{...state,staffing:undefined});
 assert.match(legacy,/data-path="fronts.0.discipline"/);assert.doesNotMatch(legacy,/data-path="fronts.0.catalogFrontId"/);
 assert.match(legacy,/legacy-rbac/);
});
test('catalog drift invalidates historical confirmation and blocks governed decisions until explicit save',()=>{
 const actor={id:'local',azureIdentityKey:'azure-dev',roles:['editor','reviewer']};
 const phaseData={fronts:[{...front,confirmed:true}],catalogToken:'old'};
 assert.equal(app.canConfirmFront(actor,front,staffing,phaseData),false);
 assert.equal(app.canDecideObject({...actor,azureIdentityKey:'azure-review'},'front:F1',{...frontsState(),2:phaseData},staffing),false);
 const html=app.renderEditor(2,phaseData,{staffing,actor,identities:[]});
 assert.match(html,/Confirmación no vigente/);assert.doesNotMatch(html,/Confirmado por responsable/);
 assert.match(html,/vínculo explícito y rol/);
 assert.equal(app.canConfirmFront(actor,front,staffing,{...phaseData,catalogToken:staffing.token}),true);
});
const front = {id:'F1',catalogFrontId:'android',project:'Demo',owner:'azure-dev',reviewer:'azure-review',discipline:'Android',deliverable:'SDK',repository:'example',area:'Sales',dependencies:['F0'],contract:'Interface'};

test('governed candidates match active front, project, role and independent reviewer',()=>{
 assert.equal(typeof app.staffingCandidates,'function');
 assert.deepEqual(app.staffingCandidates(staffing,front,'owner').map(c=>c.userId),['azure-dev']);
 assert.deepEqual(app.staffingCandidates(staffing,front,'reviewer').map(c=>c.userId),['azure-review']);
 assert.deepEqual(app.staffingCandidates(staffing,{...front,catalogFrontId:'retired'},'owner'),[]);
 assert.deepEqual(app.staffingCandidates(staffing,{...front,project:'retired'},'owner'),[]);
});

test('Chromium governed stage two wires filtering, explicit save, permissions and refresh without directory access',{timeout:30000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium unavailable');
 const dir=await mkdtemp('/root/.hermes/cache/scratch/v2-staffing-view-');
 const state={staffing:structuredClone(staffing),actor:{id:'local-editor',roles:['editor']},identities:[{id:'local-editor'}],state:{revision:1,phases:{1:{owner:'local-editor'},2:{fronts:[{...front}],catalogToken:'old-token'},3:{sections:[]},4:{},5:{},7:{}},history:[],comments:[],receipts:[],decisions:[]},hash:'synthetic-hash',objects:[],blockers:Object.fromEntries([1,2,3,4,5,6,7].map(p=>[p,[]]))};
 state.staffing.projects.push('Other');state.staffing.fronts.push({id:'web',name:'Web'});
 const actions=[],requests=[];
 const server=createServer(async(req,res)=>{
  requests.push(req.url);res.setHeader('Content-Type','application/json');
  if(req.url.endsWith('/api/config'))return res.end(JSON.stringify({authMode:'local-review'}));
  if(req.url.endsWith('/api/state'))return res.end(JSON.stringify(state));
  if(req.url.endsWith('/api/action')){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);actions.push(body);if(body.type==='save')state.state.phases[body.phase]=body.data;state.state.revision++;return res.end(JSON.stringify(state));}
  const name=req.url.endsWith('/app.js')?'app.js':req.url.endsWith('/styles.css')?'styles.css':'index.html';
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');const file=await readFile(new URL('../public/onboarding-v2/'+name,import.meta.url),'utf8');res.end(name==='index.html'?file.replaceAll('="/','="/dashboard/onboarding-v2/'):file);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v2`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map();browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  await cdp('Page.navigate',{url:base},sessionId);
  for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('[data-phase="2"]')`))break;await new Promise(r=>setTimeout(r,30));}
  await evaluate(`document.querySelector('[data-phase="2"]').click()`);
  assert.equal(await evaluate('document.querySelector("[data-confirm]").disabled'),true,'Missing Azure mapping must block confirmation');
  assert.equal(await evaluate(`document.querySelector('#phase a[href$="/classifications"]').pathname`),'/dashboard/onboarding-v2/classifications');
  assert.equal(await evaluate('document.querySelector("#phase").textContent.includes("catálogo cambió")'),true);
  await evaluate(`document.querySelector('[data-path="fronts.0.project"]').value='Other';document.querySelector('[data-path="fronts.0.project"]').dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.deepEqual(await evaluate(`['owner','reviewer'].map(k=>document.querySelector('[data-path="fronts.0.'+k+'"]').value)`),['','']);
  assert.equal(await evaluate(`document.querySelector('[data-path="fronts.0.owner"]').textContent.includes('Other')`),true);
  assert.equal(await evaluate('document.querySelector("[data-confirm]").disabled'),true,'Rerender must preserve RBAC restriction');
  await evaluate(`document.querySelector('[data-path="fronts.0.project"]').value='Demo';document.querySelector('[data-path="fronts.0.project"]').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`for(const [k,v] of [['owner','azure-dev'],['reviewer','azure-review']]){const el=document.querySelector('[data-path="fronts.0.'+k+'"]');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#editor').requestSubmit();`);
  for(let i=0;i<100&&!actions.length;i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(actions.length,1);assert.equal(actions[0].data.catalogToken,'current-token');assert.equal(actions[0].data.fronts[0].owner,'azure-dev');
  for(const k of ['id','deliverable','repository','area','dependencies','contract'])assert.deepEqual(actions[0].data.fronts[0][k],front[k]);
  assert.equal(actions[0].data.fronts[0].discipline,'Android');assert.equal(actions[0].data.fronts[0].canConfirm,undefined);
  state.actor.azureIdentityKey='azure-dev';state.staffing.token='new-token';state.staffing.candidates=state.staffing.candidates.filter(c=>c.userId!=='azure-review');
  await evaluate('document.getElementById("reload").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!document.querySelector("option[disabled][selected]")'))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(await evaluate(`document.querySelector('[data-path="fronts.0.reviewer"]').value`),'azure-review','Refresh preserves retired selection');
  assert.equal(actions.length,1,'Refresh never auto-saves');assert.equal(await evaluate('document.querySelector("[data-confirm]").disabled'),true,'Catalog drift requires explicit save even with Azure mapping');
  for(const width of [1440,390]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390},sessionId);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  assert.equal(requests.some(p=>p.includes('/api/directory')),false);
 }finally{browser.kill('SIGKILL');await new Promise(r=>browser.once('exit',r));server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
