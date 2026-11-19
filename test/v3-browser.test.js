import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {staffingFixture} from '../test-support/staffing-fixture.js';
import {createV3Server} from '../src/onboarding-v3/server.js';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';
import {HermesEnrichment} from '../src/onboarding-v2/hermes-enrichment.js';

test('V3 V1 journey: search select import, visible questions, answer save reload diff, filters desktop mobile',{timeout:60000},async t=>{
 assert.equal(spawnSync('chromium',['--version']).status,0,'Chromium required');
 const f=await staffingFixture();let reads=0;
 const connector=new AzureIntake({token:'synthetic-only',importPolicy:'project',allowedProject:'agileNestCorp',fetcher:async url=>{
 reads++;const u=new URL(url);if(u.pathname.endsWith('/wiql'))return Response.json({workItems:[{id:17}]});
 if(u.pathname.endsWith('/workitems'))return Response.json({value:[{id:17,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Synthetic V3 title','System.WorkItemType':'User Story','System.State':'New'}}]});
 if(u.pathname.endsWith('/comments'))return Response.json({comments:[{id:1,version:2,text:'Synthetic comment'}]});
 return Response.json({id:17,rev:3,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Synthetic V3 title','System.Description':'Original <img src=x onerror=alert(1)>'+('long context '.repeat(500)),'Custom.Field':'preserved'},relations:[]});
 }});
 const enrichment=new HermesEnrichment();
 const server=createV3Server({authMode:'local-review',dataFile:path.join(f.dir,'state.json'),catalogSourceFile:f.file,directoryFile:f.source,users:f.identities.map(u=>({...u,token:'synthetic-v3-'+u.id+'-token'})),azureIntake:connector,hermesEnrichment:enrichment});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v3`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${path.join(f.dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let seq=0,buffer='';const pending=new Map(),errors=[];
 browser.stdio[4].on('data',c=>{buffer+=c;let i;while((i=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++seq,p=new Promise(r=>pending.set(id,r));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const r=await p;if(r.error)throw Error(JSON.stringify(r.error));return r.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:base});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:base+'/'},sessionId);
 for(let i=0;i<100;i++){if(await ev('!!document.getElementById("loginForm")&&!document.getElementById("loginForm").hidden'))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`(async()=>{
 const el=id=>document.getElementById(id),q=s=>document.querySelector(s),pause=()=>new Promise(r=>setTimeout(r,30)),check=(v,m)=>{if(!v)throw Error(m);};
 const wait=async fn=>{for(let i=0;i<180;i++){if(fn())return;await pause();}throw Error('Timeout: '+el('message').textContent);};
 el('token').value='synthetic-v3-owner-token';el('loginForm').requestSubmit();await wait(()=>!el('workspace').hidden);
 el('intake').open=true;el('azureQuery').value='Synthetic';el('azureSearchForm').requestSubmit();await wait(()=>q('[data-select]'));check(el('requirementMeta').textContent.includes('v0'),'Search must not import');
 q('[data-select]').click();check(q('[data-import]'),'Explicit selection before import');window.confirm=()=>true;q('[data-import]').click();await wait(()=>el('requirementMeta').textContent.includes('v1'));
 check(!el('intake').open,'Intake collapses after import');check(el('enrich').textContent==='Enriquecer con Hermes','Explicit user action');check(el('importedContext').textContent.includes('#17'),'Imported context visible');check(el('contextResources').textContent.includes('Comentarios'),'Resources visible');check(el('importedContext').compareDocumentPosition(el('questions'))&Node.DOCUMENT_POSITION_FOLLOWING,'Context before questions');check(el('importedContext').getBoundingClientRect().top<innerHeight,'Imported context in viewport');check(!el('enrich').hidden,'Disabled button remains visible');check(el('ecosystemRail').textContent.includes('CP3'),'Ecosystem rail');check(q('[data-answer]'),'Questions visible');check(!q('#original img'),'Source escaped');check(el('original').textContent.includes('preserved'),'Original preserved');check(el('enrich').disabled,'No broker fails closed');
 q('[data-answer]').value='Synthetic QA environment';q('[data-rationale]').value='Synthetic source only';el('draftForm').requestSubmit();await wait(()=>el('requirementMeta').textContent.includes('v2'));
 el('reload').click();await wait(()=>q('[data-answer]').value==='Synthetic QA environment');check(el('versions').textContent.includes('questions'),'Diff contains changed questions');
 el('peopleFilter').value='responsable';el('peopleFilter').dispatchEvent(new Event('input'));check(el('candidates').textContent.includes('Responsable de prueba'),'Name filter');check(!el('candidates').textContent.includes('Revisor de prueba'),'Filter excludes mismatch');
 el('peopleFilter').value='';el('peopleFilter').dispatchEvent(new Event('input'));el('capability').value='reviewer';el('capability').dispatchEvent(new Event('change'));check(!el('candidates').textContent.includes('Responsable de prueba'),'Capability filter');el('projectFilter').value='P2';el('projectFilter').dispatchEvent(new Event('change'));check(el('candidates').textContent.includes('Sin resultados'),'Project filter');
 check(document.documentElement.scrollWidth<=innerWidth,'Desktop overflow');window.scrollTo(0,0);return 'PASS';})()`),'PASS');
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(f.dir,'desktop.png'),Buffer.from(r.data,'base64')));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
 assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');
 await ev(`document.documentElement.style.scrollBehavior='auto';document.getElementById('questions').scrollIntoView({block:'start',behavior:'instant'})`);
 console.log('Mobile question bounds',await ev(`JSON.stringify({height:innerHeight,top:document.querySelector('[data-answer]').getBoundingClientRect().top,bottom:document.querySelector('[data-answer]').getBoundingClientRect().bottom})`));
 assert.ok(await ev(`document.querySelector('[data-answer]').getBoundingClientRect().bottom<=innerHeight`),'Mobile answers visible without giant source');
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(f.dir,'mobile.png'),Buffer.from(r.data,'base64')));
 await cdp('Page.reload',{},sessionId);for(let i=0;i<150;i++){if(await ev(`document.querySelector('[data-answer]')?.value==='Synthetic QA environment'`))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`document.querySelector('[data-answer]')?.value`),'Synthetic QA environment');
 const persisted=JSON.parse(await readFile(path.join(f.dir,'state.json'),'utf8'));assert.equal(persisted.revision,2);assert.equal(persisted.azureIntakes[0].snapshot.root.rev,3);assert.equal(persisted.history.length,2);assert.equal(reads,4);assert.deepEqual(errors,[]);
 // Fixture-only inference checks browser result labels, NOT real provider execution.
 enrichment.model='synthetic-browser-model';enrichment.transport=async()=>({context:'Propuesta sintética de contexto',constraints:'Pendiente revisión humana',questions:['¿Qué validación falta?']});
 await ev(`document.getElementById('reload').click()`);
 for(let i=0;i<100;i++){if(await ev(`!document.getElementById('enrich').disabled`))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`(async()=>{window.confirm=()=>true;const e=document.getElementById('enrich');if(e.disabled)throw Error('Ready action disabled');e.scrollIntoView({block:'center',behavior:'instant'});e.click();return e.textContent;})()`),'Enriquecer con Hermes');
 for(let i=0;i<150;i++){if(await ev(`document.getElementById('aiResult').textContent.includes('Propuesta LLM v3')`))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`document.getElementById('aiResult').textContent.includes('Propuesta LLM v3')`),true);
 await cdp('Page.reload',{},sessionId);for(let i=0;i<100;i++){if(await ev(`document.getElementById('aiResult')?.textContent.includes('Propuesta LLM v3')`))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`document.getElementById('aiResult').textContent.includes('Propuesta LLM v3')`),true);
 const generated=JSON.parse(await readFile(path.join(f.dir,'state.json'),'utf8'));assert.equal(generated.revision,3);assert.deepEqual(generated.azureIntakes,persisted.azureIntakes);assert.equal(generated.phases[1].questions[0].answer,'Synthetic QA environment');
 await ev(`document.getElementById('importedContext').scrollIntoView({block:'start',behavior:'instant'})`);
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(f.dir,'mobile-enrichment-context.png'),Buffer.from(r.data,'base64')));
 enrichment.transport=async()=>{throw Error('synthetic-provider-unavailable');};
 await ev(`window.confirm=()=>true;document.getElementById('enrich').click()`);
 for(let i=0;i<100;i++){if(await ev(`document.getElementById('aiResult').textContent.includes('Generación fallida')`))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await ev(`document.getElementById('aiResult').textContent.includes('Generación fallida')`),true,'Failure visible even when older proposal exists');
 assert.equal(JSON.parse(await readFile(path.join(f.dir,'state.json'),'utf8')).revision,3,'Failed generation leaves draft unchanged');
 console.log('V3 synthetic real-backend Chromium evidence:',f.dir);
 }finally{browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});await new Promise(r=>server.close(r));await rm(path.join(f.dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
