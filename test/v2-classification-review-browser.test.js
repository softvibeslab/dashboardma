import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {ClassificationStore} from '../src/onboarding-v2/classifications.js';
import {createV2Server} from '../src/onboarding-v2/server.js';
import {initial} from '../src/onboarding-v2/model.js';

test('private review real browser/backend: import, filters, accept, correct, reject, staffing and public privacy',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium missing');
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','review-browser-')),file=join(dir,'catalog.json'),directoryFile=join(dir,'directory.json');
 const seed=initial();seed.phases[1]={title:'Synthetic review test',owner:'coordinator',context:'Synthetic only'};await writeFile(join(dir,'state.json'),JSON.stringify(seed));
 const people=['a','b','c'].map(id=>({id:'synthetic:'+id,name:'Synthetic '+id,projects:['Synthetic project']}));
 await writeFile(directoryFile,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-17T00:00:00Z',users:people}));
 await writeFile(join(dir,'classification-proposals.json'),JSON.stringify({schemaVersion:1,mode:'read-only-private-research',window:{start:'2026-08-19',end:'2026-11-17'},users:people.map(p=>({azureIdentityKey:p.id,proposedFronts:[{front:'Android',confidence:'alta',reason:'Historical <img src=x onerror="window.pwned=true">',evidenceIds:['wi:1']}]}))}));await writeFile(join(dir,'evidence.json'),JSON.stringify({'wi:1':{type:'workitem',id:1,raw:'RAW_SECRET'}}));
 const actor={id:'coordinator',authenticated:true,roles:['coordinator','editor']},store=new ClassificationStore(file,{directoryFile});let s=await store.act({type:'directory.sync',revision:0},actor);for(const name of ['Android','Web'])s=await store.act({type:'front.create',revision:s.revision,data:{name}},actor);
 const prefix='/dashboard/onboarding-v2',server=createV2Server({basePath:prefix,dataFile:join(dir,'state.json'),classificationFile:file,directoryFile,researchDirectory:dir,users:[{...actor,token:'synthetic-review-coordinator'}],publicDirectory:true,staffingRequired:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});let seq=0,buffer='';const pending=new Map(),exceptions=[];
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params?.exceptionDetails?.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++seq,response=new Promise(r=>pending.set(id,r));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:base+'/classifications'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:base+'/classifications'},sessionId);
 for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("catalogMessage")?.textContent'))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await evaluate(`(async()=>{const check=(v,m)=>{if(!v)throw Error(m);};check(document.getElementById('catalogWorkspace').hidden,'Private workspace hidden anonymously');const response=await fetch('${base}/api/classifications');check(response.status===401,'Anonymous private read');await fetch('${base}/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'synthetic-review-coordinator'})});return 'PASS';})()`),'PASS');
 await cdp('Page.navigate',{url:base+'/classifications#reviewSection'},sessionId);
 for(let i=0;i<100;i++){if(await evaluate('document.getElementById("catalogWorkspace")?.hidden===false'))break;await new Promise(r=>setTimeout(r,30));}
 const result=await evaluate(`(async()=>{
 const el=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);},wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout '+el('catalogMessage').textContent);};
 check(el('reviewSection'),'Private proposal inbox exists');el('importResearch').click();await wait(()=>document.querySelectorAll('[data-review-id]').length===3);
 check(!(await(await fetch('${base}/api/staffing')).json()).candidates.length,'No import activation');
 check(!window.pwned&&!el('reviewList').querySelector('img'),'XSS evidence rendered as text');
 el('reviewQuery').value='Synthetic a';el('reviewQuery').dispatchEvent(new Event('input'));check(document.querySelectorAll('[data-review-id]').length===1,'Person filter');el('reviewQuery').value='';el('reviewQuery').dispatchEvent(new Event('input'));
 const decide=async(outcome,frontName)=>{document.querySelector('[data-review-id]').click();check(el('reviewFront').value===''&&el('reviewLevel').value===''&&el('reviewEnabled').value==='','No auto selection');check(el('reviewExact').scrollWidth<=el('reviewExact').clientWidth,'Exact proposal hash wraps');check(!document.querySelector('[name=reviewRole]:checked')&&!document.querySelector('[name=reviewProject]:checked'),'No auto roles/projects');el('reviewOutcome').value=outcome;el('reviewOutcome').dispatchEvent(new Event('change'));el('reviewReason').value='Synthetic human review '+outcome;
 if(outcome!=='reject'){el('reviewFront').value=[...el('reviewFront').options].find(o=>o.textContent===frontName).value;el('reviewLevel').value='secondary';el('reviewEnabled').value=outcome==='accept'?'true':'false';document.querySelector('[name=reviewRole][value=developer]').checked=true;document.querySelector('[name=reviewProject]').checked=true;}
 const before=document.querySelectorAll('[data-review-id]').length;el('reviewForm').requestSubmit();await wait(()=>document.querySelectorAll('[data-review-id]').length===before-1);};
 await decide('accept','Android');await decide('correct','Web');await decide('reject');
 const privateState=(await(await fetch('${base}/api/classifications')).json()).catalog;check(privateState.review.proposals.map(p=>p.status).join(',')==='accepted,corrected,rejected','All three decisions persisted');check(privateState.participations.length===2,'Rejected not participation');
 const staffing=await(await fetch('${base}/api/staffing')).json();check(staffing.candidates.some(p=>p.userId==='synthetic:a'),'Enabled reviewed candidate in staffing');check(!staffing.candidates.some(p=>p.userId==='synthetic:b'),'Explicit disabled corrected membership excluded');
 const pub=await(await fetch('${base}/api/directory')).json();check(pub.users.every(u=>Object.keys(u).sort().join(',')==='fronts,name'),'Public DTO allowlist');check(!JSON.stringify(pub).includes('Historical')&&!JSON.stringify(pub).includes('rejected')&&!JSON.stringify(pub).includes('confidence'),'No private proposal data public');
 el('reviewStatus').value='';el('reviewStatus').dispatchEvent(new Event('input'));check(el('reviewList').textContent.includes('Synthetic human review reject'),'History reasons visible privately');check(document.documentElement.scrollWidth<=innerWidth,'Desktop overflow');el('reviewSection').scrollIntoView();return 'PASS';})()`);assert.equal(result,'PASS');
 await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'desktop.png'),Buffer.from(r.data,'base64')));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile overflow');await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'mobile.png'),Buffer.from(r.data,'base64')));
 assert.deepEqual(exceptions,[]);console.log('Classification review browser evidence:',dir);
 await cdp('Page.navigate',{url:base+'/'},sessionId);
 for(let i=0;i<100;i++){if(await evaluate('document.getElementById("workspace")?.hidden===false'))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await evaluate(`(()=>{const q=s=>document.querySelector(s);q('[data-phase="2"]').click();if(!q('a[href$="classifications#reviewSection"]'))throw Error('Stage2 inbox link missing');q('[data-add="fronts"]').click();const set=(path,value)=>{const e=q('[data-path="'+path+'"]');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};const front=q('[data-path="fronts.0.catalogFrontId"]');set('fronts.0.catalogFrontId',[...front.options].find(o=>o.textContent==='Android').value);set('fronts.0.project','Synthetic project');if(![...q('[data-path="fronts.0.owner"]').options].some(o=>o.value==='synthetic:a'))throw Error('Reviewed staffing candidate not visible in Stage2');return 'PASS';})()`),'PASS');
 }finally{browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});await new Promise(r=>server.close(r));await rm(join(dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
