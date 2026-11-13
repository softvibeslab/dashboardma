import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

test('native onboarding: inline sources, generation, retained editors/version, answer approval and mobile', { timeout: 30000 }, async t => {
  if (spawnSync('chromium', ['--version']).status !== 0) return t.skip('Chromium not installed');
  const dir = await mkdtemp('/root/.hermes/cache/scratch/onboarding-browser-');
  const base = new URL('../public/dashboard/requirements/onboarding/', import.meta.url);
  let html = await readFile(new URL('index.html', base), 'utf8');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/href="\/dashboard\/([^\"]+\.css)"/g, (_, p) => `href="${new URL('../public/dashboard/' + p, import.meta.url).href}"`);
  const script = `
const check=(value,message)=>{if(!value)throw Error(message)};
const pause=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause()}throw Error('wait timed out')};
const el=id=>document.getElementById(id), qs=s=>document.querySelector(s);
let calls=[], versions=[{id:'v1',version:1}], sources=[], status=null, revision=1, flowVersion='v1', questionRevision=0, approved=false, description='initial context', failURL=true;
const question=()=>({id:'q1',versionId:'v1',question:'How?',answerDraft:'proposal',answerRevision:questionRevision,answerStatus:approved?'approved':'draft',answer:approved?'human answer':'',answerHistory:[]});
window.confirm=()=>true;
window.fetch=async(path,init={})=>{
 calls.push([String(path),init]); let result={};
 const p=String(path); const method=init.method||'GET';
 if(p.endsWith('/wizard')) { if(method==='POST'){let b=JSON.parse(init.body); if(b.action==='configure')flowVersion=b.versionId;} result={flow:{stage:0,revision:revision++,versionId:flowVersion,tracks:[]},context:{requirement:{id:'REQ-1',title:'Synthetic'},versions,sources,questions:[]},blockers:approved?[]:['Approve questions']}; }
 else if(p.endsWith('/answers'))result={items:[question()]};
 else if(p.endsWith('/answer')){questionRevision++;approved=JSON.parse(init.body).action==='approve';result={item:question()};}
 else if(p.endsWith('/sources-url')){if(failURL){failURL=false;return {ok:false,status:503,json:async()=>({error:'offline URL'})}}sources.push({id:'s1',requirementId:'REQ-1',name:'safe URL',type:'document',url:JSON.parse(init.body).url});result={item:sources.at(-1)};}
 else if(p.endsWith('/sources')&&method==='POST'){sources.push({id:'f1',requirementId:'REQ-1',name:'demo.txt',type:'file',storageKey:'file'});result={items:[sources.at(-1)]};}
 else if(p.endsWith('/enrich')){status={id:'r1',status:'queued'};result={run:status};}
 else if(p.endsWith('/enrichment'))result={run:status};
 else if(p.endsWith('/requirementSources'))result={items:sources};
 else if(p.endsWith('/auth/status'))result={configured:true,authenticated:true};
 else if(p.endsWith('/REQ-1')){if(method==='PUT')description=JSON.parse(init.body).description;result={item:{id:'REQ-1',description}};}
 else if(p.endsWith('/requirements'))result={items:[{id:'REQ-1',title:'Synthetic'}]};
 return {ok:true,status:200,json:async()=>result};
};
const input=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}))};
try {
 await import('${new URL('app.js', base).href}');
 await pause(); el('requirementSelect').value='REQ-1';el('requirementSelect').dispatchEvent(new Event('change'));
 await wait(()=>qs('[data-intake-form="context"] textarea')?.value==='initial context');
 await wait(()=>qs('[data-answer-field="text"]'));
 check(calls.every(([,i])=>!i.method||i.method==='GET'),'opening must not call inference');
 const context=qs('[name="description"]');input(context,'edited context');qs('[data-intake-form="context"]').requestSubmit();
 await wait(()=>description==='edited context'); await pause(60);
 const url=qs('[data-intake-form="url"] input');input(url,'https://example.com/source');qs('[data-intake-form="url"]').requestSubmit();
 await wait(()=>qs('[data-intake-message]').textContent.includes('offline URL'));check(url.value.includes('example.com'),'failed URL retained');
 qs('[data-intake-form="url"]').requestSubmit();await wait(()=>!!qs('[data-intake-sources] a'));await pause(50);
 const transfer=new DataTransfer();transfer.items.add(new File(['synthetic'],'demo.txt'));qs('input[type=file]').files=transfer.files;qs('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}));qs('[data-intake-form="files"]').requestSubmit();
 await wait(()=>!!qs('a[href$="/download"]')); await pause(50);
 const version=qs('[name="versionId"]'), answer=qs('[data-answer-field="text"]');input(answer,'human answer');input(context,'unsaved context');
 qs('[data-intake-enrich]').click();await pause();check(!status,'unsaved context blocks generation');
 qs('[data-intake-form="context"]').requestSubmit();await pause(60);qs('[data-intake-enrich]').click();await wait(()=>status?.status==='queued');
 input(context,'keep me');qs('[data-intake-refresh]').click();await pause(60);
 check(qs('[data-answer-field="text"]')===answer,'active status poll does not remount answer editor');
 status={id:'r1',status:'completed',versionId:'v2'};versions.unshift({id:'v2',version:2});flowVersion='v2';
 qs('[data-intake-refresh]').click();await wait(()=>qs('[name="versionId"]').options.length===3);
 check(qs('[name="versionId"]')===version&&version.value==='v1','older chosen version retained');
 check(qs('[data-answer-field="text"]').value==='human answer','completion refresh retains answer draft');
 check(context.value==='keep me','context draft retained');
 qs('[data-answer-action="approve"]').click();await wait(()=>approved);await wait(()=>el('blockers').hidden);
 check(context.value==='keep me','approval refresh retains context');
 qs('[data-intake-form="context"]').requestSubmit();await pause(80);
 check(el('nextButton').disabled,'server default changed: explicit version selection/save still required');
 input(version,'v2');qs('[data-form="configure"]').requestSubmit();await pause(80);
 check(!el('nextButton').disabled,'explicit selection/save reconciles displayed and server version');
 check(calls.filter(([p,i])=>p.endsWith('/enrich')&&i.method==='POST').length===1,'explicit one enrichment');
 check(document.documentElement.scrollWidth<=document.documentElement.clientWidth,'mobile overflow');
 document.body.dataset.testResult='PASS';
} catch(error){document.body.dataset.testResult='FAIL '+error.stack}
`;
  const file = join(dir, 'test.html'); await writeFile(file, html + `<script type="module">${script}</script>`);
  const browser = spawn('chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--allow-file-access-from-files','--window-size=390,844',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'], { stdio:['ignore','ignore','ignore','pipe','pipe'] });
  let sequence=0, buffer=''; const pending=new Map();
  browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
  const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
  try {
    const {targetId}=await cdp('Target.createTarget',{url:pathToFileURL(file).href});
    const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
    let result;
    for(let i=0;i<160;i++){result=(await cdp('Runtime.evaluate',{expression:'document.body?.dataset.testResult',returnByValue:true},sessionId)).result?.value;if(result)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(result,'PASS');
  } finally {browser.kill('SIGKILL');await new Promise(r=>browser.once('exit',r));await rm(dir,{recursive:true,force:true});}
});
