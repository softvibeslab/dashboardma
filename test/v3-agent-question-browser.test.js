import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {fixture,actor} from '../test-support/documentary-fixture.js';import {nativeQuestionHarness} from '../test-support/native-question-fixture.js';import {createV3Server} from '../src/onboarding-v3/server.js';
test('Chromium real backend/native fixture: named engine, progress, actual tool citations, no automatic answer/approval, desktop/mobile',{timeout:60000},async()=>{
 const state=fixture(),h=await nativeQuestionHarness(state),evidence=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/native-question-browser-');const file=h.directory+'/state.json';await writeFile(file,JSON.stringify(state));
 const server=createV3Server({dataFile:file,authMode:'local-review',staffingRequired:false,users:[{...actor,name:'Synthetic Native Editor',email:'fixture@example.test',token:'synthetic-native-browser-token'}],documentaryAI:h.service});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/dashboard/onboarding-v3`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${evidence}/profile`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});let seq=0,buffer='';const pending=new Map(),errors=[];
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++seq,p=new Promise(r=>pending.set(id,r));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const v=await p;if(v.error)throw Error(JSON.stringify(v.error));return v.result;};
 try{
  const {targetId}=await cdp('Target.createTarget',{url:base+'/'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const wait=async expression=>{for(let i=0;i<400;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+expression+' '+await ev('document.getElementById("message")?.textContent'));};
  await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:base+'/'},sessionId);await wait('!!document.getElementById("loginForm")');
  await ev(`fetch('${base}/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'synthetic-native-browser-token'})})`);await cdp('Page.reload',{},sessionId);await wait('!!document.querySelector("[data-question]")');
  assert.match(await ev('document.getElementById("questions").textContent'),/Hermes nativo.*sintético/);
  const selected=Object.keys(h.service.preview(state).sourceRefs).find(x=>x.endsWith(':title'));
  await ev(`window.confirm=()=>true;document.querySelector('[data-disclosure="assist"]').open=true;document.querySelector('[data-refs]').value=${JSON.stringify(selected)};document.querySelector('[data-q-action="generate"]').click()`);await wait('document.getElementById("aiProgress").textContent.includes("Esperando")');
  await wait('!!document.querySelector("[data-agent-evidence]")');await ev(`document.querySelector('[data-agent-evidence]').open=true`);
  assert.match(await ev('document.querySelector("[data-agent-evidence]").textContent'),/authorized_context.*executed.*call-fixture-context/s);
  assert.match(await ev('document.querySelector("[data-agent-evidence]").textContent'),/alpha-guide.*alpha.*fixture-v1/s);
  assert.equal(await ev('document.querySelector("[data-answer]").value'),'');assert.equal(h.results[0].providerRequests,0);assert.equal(h.results[0].historyMessages,0);
  assert.deepEqual(Object.keys(JSON.parse(h.requests[0].prompt).sourceRefs),[selected]);
  await ev(`document.querySelector('[data-incorporate]').click()`);assert.match(await ev('document.querySelector("[data-answer]").value'),/sintética/);
  let disk=JSON.parse(await readFile(file));assert.equal(disk.phases[1].questions[0].answer,'');assert.equal(disk.questionRecords[state.phases[1].questions[0].id].decisions.length,0);
  for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390},sessionId);await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),label+' overflow');
   await ev(`document.querySelector('[data-agent-evidence]').scrollIntoView({block:'center',behavior:'instant'})`);const image=await cdp('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(evidence+'/'+label+'.png',Buffer.from(image.data,'base64'));
  }
  await cdp('Page.reload',{},sessionId);await wait('!!document.querySelector("[data-agent-evidence]")');assert.equal(await ev('document.querySelector("[data-answer]").value'),'');assert.deepEqual(errors,[]);
  await writeFile(evidence+'/tools.json',JSON.stringify({modelMode:h.results[0].modelMode,providerRequests:h.results[0].providerRequests,tools:h.results[0].tools},null,2));console.log('Native question browser evidence',evidence);
 }finally{browser.kill('SIGTERM');await new Promise(r=>browser.exitCode!==null?r():browser.once('exit',r));await new Promise(r=>server.close(r));await h.close();await rm(evidence+'/profile',{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
