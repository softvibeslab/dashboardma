import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createV2Server} from '../src/onboarding-v2/server.js';
test('V2 real Chromium: seven phases, assignments, human reviews, approvals, package, receipt and responsive persistence',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium unavailable');
 const dir=await mkdtemp('/root/.hermes/cache/scratch/v2-browser-');
 const server=createV2Server({basePath:'/dashboard/onboarding-v2',dataFile:join(dir,'state.json'),users:[{id:'owner',roles:['editor','coordinator'],token:'test-only-owner-token'},{id:'reviewer',roles:['reviewer','qa'],token:'test-only-reviewer-token'}]});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v2`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map();browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:base});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:base},sessionId);
 for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("message")?.textContent'))break;await new Promise(r=>setTimeout(r,50));}
 const result=await evaluate(`(async()=>{
 const pause=()=>new Promise(r=>setTimeout(r,25)); const check=(v,m)=>{if(!v)throw Error(m)};
 const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await pause();}throw Error('UI wait timed out: '+document.getElementById('message').textContent)};
 const el=id=>document.getElementById(id),q=s=>document.querySelector(s);
 const input=(selector,value)=>{const e=q(selector);check(e,'Missing '+selector);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};
 const set=(path,v)=>input('[data-path="'+path+'"]',v);
 const stage=async p=>{q('[data-phase="'+p+'"]').click();await pause();};
 const action=async click=>{const before=el('revisionStatus').textContent;click();await wait(()=>el('revisionStatus').textContent!==before);};
 const save=()=>action(()=>el('editor').requestSubmit());
 const add=k=>q('[data-add="'+k+'"]').click();
 const login=async token=>{input('#token',token);el('loginForm').requestSubmit();await wait(()=>!el('workspace').hidden);};
 await login('test-only-owner-token');await stage(1);set('title','TEST ONLY · Onboarding V2');set('owner','owner');set('context','Contexto sintético para verificar el flujo; no requerimiento productivo.');await save();
 await stage(2);add('fronts');for(const [k,v] of Object.entries({id:'F1',deliverable:'AAR Android',repository:'https://example.test/repo',owner:'owner',reviewer:'reviewer',discipline:'Android',area:'Ventas',contract:'Interfaz de consulta read-only'}))set('fronts.0.'+k,v);await save();await action(()=>q('[data-confirm="F1"]').click());
 await stage(3);add('sections');for(const[k,v]of Object.entries({id:'S1',front:'shared',title:'Funcional compartida',body:'El usuario prepara una solicitud y confirma sus criterios.'}))set('sections.0.'+k,v);add('sections');for(const[k,v]of Object.entries({id:'S2',front:'F1',title:'Contrato Android',body:'El AAR recibe contexto sin ejecutar despliegues.'}))set('sections.1.'+k,v);add('criteria');for(const[k,v]of Object.entries({id:'AC1',section:'S1',text:'La solicitud conserva el contexto.',critical:true}))set('criteria.0.'+k,v);await save();
 await stage(4);add('findings');check(document.querySelectorAll('#review').length===1,'Review action duplicated after editing collection');q('[data-remove="findings:0"]').click();set('reviewer','reviewer');set('notes','Revisar consistencia de IDs y frentes.');await save();
 await stage(5);set('kind','document');set('reviewer','reviewer');set('plan','Revisar diseño y criterios antes de desarrollo.');add('cases');for(const[k,v]of Object.entries({id:'TC1',criterion:'AC1',risk:'R1 pérdida de contexto',steps:'Revisar la sección S1.',expected:'Contexto y criterio consistentes.',status:'planned'}))set('cases.0.'+k,v);await save();
 await stage(7);set('recipient','reviewer');set('instructions','Preparar implementación posterior. No desplegar ni cerrar CP.');await save();check(el('download').disabled,'Unapproved package must remain disabled');
 el('logout').click();await wait(()=>!el('login').hidden);await login('test-only-reviewer-token');await stage(4);await action(()=>el('review').click());await stage(5);await action(()=>el('review').click());await stage(6);
 for(let i=0;i<3;i++)await action(()=>q('[data-decision="'+i+':approve"]').click());
 await stage(7);check(!el('download').disabled,'Approved package enabled');const response=await fetch('${base}/api/package');check(response.ok,'Package actual HTTP export');const p=await response.json();check(p.manifest['specifications.json']&&p.approvals.length===3,'Structured package');await action(()=>el('receipt').click());
 const state=await(await fetch('${base}/api/state')).json();check(state.state.receipts[0].hash===p.hash,'Receipt hash stable after receipt');
 check(document.documentElement.scrollWidth<=innerWidth,'Desktop horizontal overflow');
 return {result:'PASS',hash:p.hash,revision:state.state.revision};
 })()`);
 assert.equal(result.result,'PASS');
 await evaluate(`document.getElementById('phase').scrollIntoView();window.scrollTo(0,0)`);
 const desktop=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);await writeFile(join(dir,'desktop.png'),Buffer.from(desktop.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 const mobile=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);await writeFile(join(dir,'mobile.png'),Buffer.from(mobile.data,'base64'));
 await cdp('Page.reload',{},sessionId);await new Promise(r=>setTimeout(r,350));assert.equal(await evaluate('document.getElementById("workspace").hidden'),false);
 console.log('V2 browser evidence',JSON.stringify({...result,directory:dir,viewports:['1440x1000','390x844']}));
 }finally{browser.kill('SIGKILL');await new Promise(r=>browser.once('exit',r));await new Promise(r=>server.close(r));await rm(join(dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
