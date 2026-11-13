import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
test('native Etapa2 retains edits through polling; reviewed apply requires confirmation then separate save', {timeout:30000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium not installed');
 const dir=await mkdtemp('/root/.hermes/cache/scratch/technology-browser-');
 const base=new URL('../public/dashboard/requirements/onboarding/',import.meta.url);
 let html=await readFile(new URL('index.html',base),'utf8');
 html=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/href="\/dashboard\/([^\"]+\.css)"/g,(_,p)=>`href="${new URL('../public/dashboard/'+p,import.meta.url).href}"`);
 const script=`
const check=(v,m)=>{if(!v)throw Error(m)}, pause=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await pause()}throw Error('wait timed out')};
const el=id=>document.getElementById(id), qs=s=>document.querySelector(s);
let calls=[],ready=false,allow=false,revision=1,stage=1,postCount=0;
let tracks=[{id:'T1',technology:'Web',area:'Ventas',ownerEmail:'owner@example.test'}];
const answer=()=>({run:{id:'job',status:ready?'completed':'queued',model:'offline-test'},context:{hash:'hash',versionId:'V1',expectedRevision:revision,stage},candidates:[],tracks:ready?[{technology:'Android',area:'Venta',ownerEmail:'',confidence:'low',rationale:'PENDIENTE de responsable; sin especialidad verificada.',evidenceIds:[]}]:[]});
window.confirm=()=>allow;
window.fetch=async(path,init={})=>{
 const p=String(path),method=init.method||'GET';calls.push([p,method]);let result={};
 if(p.endsWith('/technology-suggestion')){if(method==='POST')postCount++;result=answer();}
 else if(p.endsWith('/wizard')){if(method==='POST'){const b=JSON.parse(init.body);if(b.action==='configure')tracks=b.tracks;if(b.action==='back')stage=0;revision++;}result={flow:{stage,revision,versionId:'V1',tracks,qaEmail:'qa@example.test',businessEmail:'business@example.test'},context:{requirement:{id:'R1',title:'Synthetic'},versions:[{id:'V1',version:1}]},blockers:[]};}
 else if(p.endsWith('/requirements'))result={items:[{id:'R1',title:'Synthetic'},{id:'R2',title:'Other'}]};
 return {ok:true,status:200,json:async()=>result};
};
const input=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}))};
try{
 await import('${new URL('app.js',base).href}');await pause();el('requirementSelect').value='R1';el('requirementSelect').dispatchEvent(new Event('change'));
 await wait(()=>qs('[data-tech-consult]'));check(postCount===0,'no paid call on mount');
 input(qs('[name="technology"]'),'Unsaved tech');input(qs('[name="qaEmail"]'),'keepqa@example.test');
 qs('[data-tech-consult]').click();await wait(()=>postCount===1);input(qs('[name="area"]'),'keep area while polling');
 ready=true;await wait(()=>qs('[data-tech-apply]'));
 check(qs('[name="technology"]').value==='Unsaved tech','poll retains tech');check(qs('[name="area"]').value==='keep area while polling','poll retains area');
 check(qs('[data-technology-suggestion]').textContent.includes('PENDIENTE de responsable'),'owner rationale visible');
 qs('[data-tech-apply]').click();await pause(80);check(qs('[name="technology"]').value==='Unsaved tech','cancel retains fields');
 allow=true;qs('[data-tech-apply]').click();await wait(()=>qs('[name="technology"]').value==='Android');
 check(qs('[name="qaEmail"]').value==='keepqa@example.test','QA unchanged');check(qs('[name="ownerEmail"]').value==='','owner pending requires human');
 check(!calls.some(([p,m])=>p.endsWith('/wizard')&&m==='POST'),'apply never saves');
 input(qs('[name="ownerEmail"]'),'corrected@example.test');qs('[data-form="configure"]').requestSubmit();await wait(()=>calls.some(([p,m])=>p.endsWith('/wizard')&&m==='POST'));
 await wait(()=>revision===2);check(tracks[0].ownerEmail==='corrected@example.test','explicit save uses correction');
 check(document.documentElement.scrollWidth<=document.documentElement.clientWidth,'mobile overflow');
 document.body.dataset.testResult='PASS';
}catch(error){document.body.dataset.testResult='FAIL '+error.stack}
`;
 const file=join(dir,'test.html');await writeFile(file,html+`<script type="module">${script}</script>`);
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--allow-file-access-from-files',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map();
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:pathToFileURL(file).href});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
 let result;for(let i=0;i<220;i++){result=(await cdp('Runtime.evaluate',{expression:'document.body?.dataset.testResult',returnByValue:true},sessionId)).result?.value;if(result)break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(result,'PASS');
 }finally{browser.kill('SIGKILL');await new Promise(r=>browser.once('exit',r));await rm(dir,{recursive:true,force:true});}
});
