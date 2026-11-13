import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('classifications real Chromium CRUD, filters, persistence and mobile layout',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium not installed');
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','classifications-browser-'));
 const source=join(dir,'directory.json');
 await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'azure-test-only',name:'Persona de prueba',email:'synthetic@example.test',projects:['Proyecto de prueba']}]}));
 const prefix='/dashboard/onboarding-v2';
 const server=createV2Server({basePath:prefix,dataFile:join(dir,'state.json'),directoryFile:source,users:[{id:'coordinator-test',roles:['editor','coordinator'],token:'synthetic-classification-review-only'}]});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map();
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
  const {targetId}=await cdp('Target.createTarget',{url:base});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:base},sessionId);
  for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("message")?.textContent'))break;await new Promise(r=>setTimeout(r,50));}
  const login=await evaluate(`fetch('${base}/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'synthetic-classification-review-only'})}).then(r=>r.status)`);assert.equal(login,200);
  await cdp('Page.navigate',{url:base+'/classifications'},sessionId);
  for(let i=0;i<100;i++){if(await evaluate('document.getElementById("catalogWorkspace")?.hidden===false'))break;await new Promise(r=>setTimeout(r,50));}
  const result=await evaluate(`(async()=>{
   const el=id=>document.getElementById(id),pause=()=>new Promise(r=>setTimeout(r,30));
   const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await pause();}throw Error('Timed out: '+el('catalogMessage').textContent);};
   const check=(v,m)=>{if(!v)throw Error(m);};
   const input=(id,v)=>{el(id).value=v;el(id).dispatchEvent(new Event('input',{bubbles:true}));};
   const saved=async run=>{const before=el('catalogRevision').textContent;run();await wait(()=>el('catalogRevision').textContent!==before);};
   el('newFront').click();input('frontName','Android de prueba');input('frontDescription','Clasificación sintética para QA, no personas reales.');await saved(()=>el('frontForm').requestSubmit());
   await saved(()=>el('syncDirectory').click());check(el('directoryStatus').textContent.includes('1 identidades'),'Synced count');
   el('newParticipation').click();el('participationUser').value='azure-test-only';el('participationUser').dispatchEvent(new Event('change',{bubbles:true}));
   el('participationFront').selectedIndex=1;document.querySelector('[name=participationRole][value=developer]').checked=true;document.querySelector('[name=participationProject]').checked=true;input('participationNotes','Confirmación de prueba');await saved(()=>el('participationForm').requestSubmit());
   check(el('participationList').textContent.includes('Persona de prueba'),'Participant rendered');
   input('filterQuery','no-matches');check(el('resultCount').textContent==='0 de 1 participaciones','Search filter');input('filterQuery','');
   document.querySelector('[data-front-edit]').click();input('frontName','Android validado');await saved(()=>el('frontForm').requestSubmit());check(el('participationList').textContent.includes('Android validado'),'Renamed classification updated');
   check(document.documentElement.scrollWidth<=innerWidth,'Desktop viewport overflow');return 'PASS';
  })()`);assert.equal(result,'PASS');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'desktop.png'),Buffer.from(r.data,'base64')));
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  await evaluate("document.getElementById('peopleSection').scrollIntoView()");assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile viewport overflow');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'mobile.png'),Buffer.from(r.data,'base64')));
  await cdp('Page.navigate',{url:base+'/classifications'},sessionId);
  for(let i=0;i<100;i++){if(await evaluate('document.getElementById("catalogWorkspace")?.hidden===false'))break;await new Promise(r=>setTimeout(r,50));}
  assert.ok(await evaluate("document.getElementById('participationList').textContent.includes('Android validado')"),'Persisted after reload');
  await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T08:00:00Z',users:[]}));
  await evaluate(`(async()=>{const el=id=>document.getElementById(id),before=el('catalogRevision').textContent;el('syncDirectory').click();for(let i=0;i<160;i++){if(el('catalogRevision').textContent!==before)return;await new Promise(r=>setTimeout(r,30));}throw Error('Directory refresh timed out');})()`);
  const deleted=await evaluate(`(async()=>{const el=id=>document.getElementById(id),wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(el('catalogMessage').textContent);};window.confirm=()=>true;document.querySelector('[data-part-edit]').click();el('participationEnabled').checked=false;const revision=el('catalogRevision').textContent;el('participationForm').requestSubmit();await wait(()=>el('catalogRevision').textContent!==revision);document.querySelector('[data-part-delete]').click();await wait(()=>el('resultCount').textContent==='0 de 0 participaciones');document.querySelector('[data-front-delete]').click();await wait(()=>el('frontList').textContent.includes('Aún no hay frentes'));return 'PASS';})()`);assert.equal(deleted,'PASS');
  console.log('Classification browser evidence:',dir);
 }finally{
  browser.kill('SIGTERM');await new Promise(resolve=>{if(browser.exitCode!==null)return resolve();browser.once('exit',resolve);});
  await new Promise(r=>server.close(r));await rm(join(dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
