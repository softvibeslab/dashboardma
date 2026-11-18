import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {createV2Server} from '../src/onboarding-v2/server.js';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';

test('Etapa1 browser with real backend: import, provenance, human edit, confirm replacement, versions and mobile',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium not installed');
 const dir=await mkdtemp(path.join(process.env.TMPDIR||'/root/.hermes/cache/scratch','v2-azure-browser-'));
 let reads=0;const connector=new AzureIntake({token:'synthetic-private-token',allowedIds:[17],fetcher:async url=>{reads++;const u=new URL(url);return Response.json(u.pathname.endsWith('/comments')?{comments:[{id:1,version:2,text:'Synthetic comment',modifiedDate:'2026-01-01T00:00:00Z'}]}:{id:17,rev:3,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Synthetic Azure title','System.Description':'Reported issue <img src=x onerror=alert(1)>','Custom.Field':'all-fields-preserved'},relations:[]});}});
 const server=createV2Server({dataFile:path.join(dir,'state.json'),users:[{id:'editor',token:'synthetic-browser-editor',roles:['editor']}],azureIntake:connector,basePath:'/dashboard/onboarding-v2'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v2`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${path.join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let seq=0,buffer='';const pending=new Map(),errors=[];
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++seq;const promise=new Promise(r=>pending.set(id,r));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await promise;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:base});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:base},sessionId);
 for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("message")?.textContent'))break;await new Promise(r=>setTimeout(r,50));}
 const result=await evaluate(`(async()=>{
 const el=id=>document.getElementById(id),q=s=>document.querySelector(s),pause=()=>new Promise(r=>setTimeout(r,30)),check=(v,m)=>{if(!v)throw Error(m);};
 const wait=async fn=>{for(let i=0;i<180;i++){if(fn())return;await pause();}throw Error('Timeout: '+el('message').textContent);};
 el('token').value='synthetic-browser-editor';el('loginForm').requestSubmit();await wait(()=>!el('workspace').hidden);
 window.confirm=()=>true;el('azureId').value='17';el('azureImportForm').requestSubmit();await wait(()=>el('revisionStatus').textContent.includes('Versión 1'));
 check(q('[data-path="title"]').value==='Synthetic Azure title','Imported title');check(el('phase').textContent.includes('all-fields-preserved'),'Full fields visible');check(el('phase').textContent.includes('IA no ejecutada'),'Honest generation');check(!q('#phase img'),'Source must not render as HTML');
 const data=await(await fetch('${base}/api/state')).json();check(data.state.azureIntakes[0].snapshot.root.comments.items[0].version===2,'Comment provenance');
 const input=q('[data-path="context"]');input.value='Human edited proposal';input.dispatchEvent(new Event('input',{bubbles:true}));el('editor').requestSubmit();await wait(()=>el('revisionStatus').textContent.includes('Versión 2'));
 window.confirm=()=>false;el('azureId').value='17';el('azureImportForm').requestSubmit();await pause();check(q('[data-path="context"]').value==='Human edited proposal','Cancel preserves draft');
 window.confirm=()=>true;el('azureImportForm').requestSubmit();await wait(()=>el('revisionStatus').textContent.includes('Versión 3'));
 el('compare').value='2';el('compare').dispatchEvent(new Event('change'));check(el('diff').textContent.includes('Human edited proposal'),'Existing diff/history includes human version');
 check([...document.querySelectorAll('button')].some(b=>b.disabled&&b.textContent.includes('Publicar en Azure')),'Publishing disabled');
 el('reload').click();await wait(()=>q('[data-path="title"]')?.value==='Synthetic Azure title');check(document.documentElement.scrollWidth<=innerWidth,'Desktop overflow');return 'PASS';})()`);
 assert.equal(result,'PASS');assert.equal(reads,4);assert.deepEqual(errors,[]);
 await evaluate('document.getElementById("azureImportForm").scrollIntoView({block:"center"})');
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(dir,'desktop.png'),Buffer.from(r.data,'base64')));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');
 await evaluate('document.getElementById("azureImportForm").scrollIntoView({block:"center"})');
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(dir,'mobile.png'),Buffer.from(r.data,'base64')));
 const persisted=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));assert.equal(persisted.azureIntakes.length,2);assert.equal(persisted.history[2].phases[1].context,'Human edited proposal');
 console.log('Azure intake synthetic browser evidence:',dir);
 }finally{browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});await new Promise(r=>server.close(r));await rm(path.join(dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
