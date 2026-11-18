import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {staffingFixture} from '../test-support/staffing-fixture.js';
import {initial} from '../src/onboarding-v2/model.js';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('Etapa 2 real browser+backend: filtered candidates, persistence, owner confirmation and catalog invalidation',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium not installed');
 const f=await staffingFixture(),file=join(f.dir,'state.json'),prefix='/dashboard/onboarding-v2';
 const seed=initial();seed.phases[1]={title:'TEST ONLY · Etapa 2',owner:'owner',context:'Caso sintético, no requerimiento real.'};await writeFile(file,JSON.stringify(seed));
 const users=f.identities.map(u=>({...u,token:u.id==='owner'?'synthetic-staffing-owner-only':'synthetic-staffing-reviewer-only'}));
 const server=createV2Server({basePath:prefix,dataFile:file,classificationFile:f.file,directoryFile:f.source,users,staffingRequired:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${join(f.dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map(),exceptions=[];
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params?.exceptionDetails?.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
  const {targetId}=await cdp('Target.createTarget',{url:base});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:base},sessionId);
  for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("message")?.textContent'))break;await new Promise(r=>setTimeout(r,50));}
  const result=await evaluate(`(async()=>{
   const el=id=>document.getElementById(id),q=s=>document.querySelector(s),pause=()=>new Promise(r=>setTimeout(r,30)),check=(v,m)=>{if(!v)throw Error(m);};
   const wait=async fn=>{for(let i=0;i<180;i++){if(fn())return;await pause();}throw Error('Timeout: '+el('message').textContent);};
   const input=(selector,value)=>{const e=q(selector);check(e,'Missing '+selector);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};
   const set=(path,v)=>input('[data-path="'+path+'"]',v);
   input('#token','synthetic-staffing-owner-only');el('loginForm').requestSubmit();await wait(()=>!el('workspace').hidden);
   q('[data-phase="2"]').click();q('[data-add="fronts"]').click();
   set('fronts.0.id','F1');set('fronts.0.deliverable','AAR de prueba');set('fronts.0.repository','https://example.test/repo');set('fronts.0.area','Área de prueba');set('fronts.0.contract','Contrato sintético');
   set('fronts.0.catalogFrontId','C1');set('fronts.0.project','P1');
   check([...q('[data-path="fronts.0.owner"]').options].some(o=>o.value==='az-owner'&&o.textContent.includes('Responsable de prueba')),'Named owner candidate from actual backend');
   check(![...q('[data-path="fronts.0.owner"]').options].some(o=>o.value==='az-disabled'),'Disabled participation excluded');
   set('fronts.0.owner','az-owner');set('fronts.0.reviewer','az-reviewer');
   const before=el('revisionStatus').textContent;el('editor').requestSubmit();await wait(()=>el('revisionStatus').textContent!==before);
   let state=await(await fetch('${base}/api/state')).json();check(state.state.phases[2].catalogRevision==='9','Server catalog provenance');check(!state.state.phases[2].fronts[0].confirmed,'Selection is not confirmation');check(state.state.phases[2].fronts[0].ownerName==='Responsable de prueba','Derived owner name');
   const search=(key,value)=>input('[data-name-search="'+key+'"]',value);
   const selected=()=>['catalogFrontId','owner','reviewer'].map(k=>q('[data-path="fronts.0.'+k+'"]').value).join('|');const saved=selected(),revision=el('revisionStatus').textContent;
   search('fronts.0.catalogFrontId','ANDROID');search('fronts.0.owner','RESPONSABLE');search('fronts.0.reviewer','zz-no-person');
   check(el('phase').textContent.includes('Sin resultados'),'No results feedback');check(selected()===saved,'Search preserves saved choices');
   check(!q('[data-path="fronts.0.reviewer"]').selectedOptions[0].hidden,'Selected reviewer stays visible despite no match');
   search('stage2-fronts','area DE PRUEBA');check(!q('#record-fronts-0').hidden,'Accent insensitive area search');search('stage2-fronts','ZZ-no-front');check(q('#record-fronts-0').hidden,'Nonmatching draft front filtered');
   document.querySelectorAll('[data-clear-search]').forEach(b=>b.click());check(!q('#record-fronts-0').hidden,'Clear restores all fronts');check(selected()===saved,'Clear preserves saved choices');
   check(el('revisionStatus').textContent===revision,'Search never auto writes');const afterSearch=await(await fetch('${base}/api/state')).json();check(afterSearch.state.revision===state.state.revision,'Backend unchanged by filters');
   check(!q('[data-confirm="F1"]').disabled,'Explicitly linked owner can confirm');const rev=el('revisionStatus').textContent;q('[data-confirm="F1"]').click();await wait(()=>el('revisionStatus').textContent!==rev);
   state=await(await fetch('${base}/api/state')).json();check(state.state.phases[2].fronts[0].confirmedBy==='owner','Real server confirmation identity');
   set('fronts.0.project','P2');check(q('[data-path="fronts.0.owner"]').value==='','Project change clears owner');check(q('[data-path="fronts.0.reviewer"]').value==='','Project change clears reviewer');check(q('[data-path="fronts.0.deliverable"]').value==='AAR de prueba','Deliverable preserved');check(el('phase').textContent.includes('No hay candidatos'),'Empty project candidate explanation');
   window.confirm=()=>true;el('reload').click();await wait(()=>q('[data-path="fronts.0.project"]')?.value==='P1');
   check(document.documentElement.scrollWidth<=innerWidth,'Desktop overflow');return 'PASS';
  })()`);assert.equal(result,'PASS');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(f.dir,'desktop.png'),Buffer.from(r.data,'base64')));
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(f.dir,'mobile.png'),Buffer.from(r.data,'base64')));
  await f.store.act({type:'front.update',revision:9,id:'C1',data:{name:'Android',active:false}},{id:'coordinator-test',roles:['coordinator'],authenticated:true});
  const stale=await evaluate(`(async()=>{const el=id=>document.getElementById(id),q=s=>document.querySelector(s);el('reload').click();for(let i=0;i<180;i++){if(el('phase').textContent.includes('Confirmación no vigente'))break;await new Promise(r=>setTimeout(r,30));}if(!q('[data-confirm="F1"]').disabled)throw Error('Stale confirmation enabled');if(!el('phase').textContent.includes('No vigente'))throw Error('Removed selection hidden');const s=await(await fetch('${base}/api/state')).json();const r=await fetch('${base}/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'confirm',revision:s.state.revision,front:'F1'})});if(r.status!==409)throw Error('Server did not reject stale selection');return 'PASS';})()`);assert.equal(stale,'PASS');
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
  console.log('Staffing real backend browser evidence:',f.dir);
 }finally{
  browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});await new Promise(r=>server.close(r));await rm(join(f.dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
