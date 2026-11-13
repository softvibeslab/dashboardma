import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createV2Server} from '../src/onboarding-v2/server.js';

test('public directory real Chromium works without cookies, filters users and keeps admin hidden',{timeout:60000},async t=>{
 if(spawnSync('chromium',['--version']).status!==0)return t.skip('Chromium not installed');
 const dir=await mkdtemp(join(process.env.TMPDIR||'/root/.hermes/cache/scratch','public-directory-browser-'));
 const source=join(dir,'source.json'),catalog=join(dir,'catalog.json');
 await writeFile(source,JSON.stringify({source:'azure-devops-snapshot',syncedAt:'2026-11-13T07:00:00Z',users:[{id:'test-private-1',name:'Persona de prueba Android',email:'private@example.test',projects:['Private']},{id:'test-private-2',name:'Persona de prueba sin frente',email:'other@example.test',projects:['Private']}]}));
 await writeFile(catalog,JSON.stringify({revision:0,fronts:[{id:'F1',name:'Android',active:true}],participations:[{userId:'test-private-1',frontId:'F1',enabled:true}],audit:[]}));
 const prefix='/dashboard/onboarding-v2';
 const server=createV2Server({basePath:prefix,dataFile:join(dir,'state.json'),classificationFile:catalog,directoryFile:source,publicDirectory:true,authMode:'sso',sessionSecret:'synthetic-public-directory-browser'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let sequence=0,buffer='';const pending=new Map();
 browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
 try{
  const {targetId}=await cdp('Target.createTarget',{url:base+'/classifications'});const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:base+'/classifications'},sessionId);
  for(let i=0;i<120;i++){if(await evaluate('document.getElementById("publicDirectoryCount")?.textContent.includes("2 de 2")'))break;await new Promise(r=>setTimeout(r,50));}
  const result=await evaluate(`(async()=>{
   const el=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);};
   check(el('publicDirectoryCount').textContent==='2 de 2 usuarios sincronizados','All users must be visible without login');
   check(el('catalogWorkspace').hidden,'Admin must stay hidden');check(!document.cookie,'No login cookie');
   check(!el('publicDirectoryList').textContent.includes('@'),'No email in public table');
   check(!document.body.textContent.includes('test-private-'),'No Azure IDs in page');
   el('publicDirectoryQuery').value='Android';el('publicDirectoryQuery').dispatchEvent(new Event('input'));check(el('publicDirectoryCount').textContent.startsWith('1 de 2'),'Name filter');
   el('publicDirectoryQuery').value='';el('publicDirectoryQuery').dispatchEvent(new Event('input'));el('publicDirectoryFront').value='__unclassified';el('publicDirectoryFront').dispatchEvent(new Event('input'));check(el('publicDirectoryCount').textContent.startsWith('1 de 2'),'Unclassified filter');
   el('publicDirectoryFront').value='Android';el('publicDirectoryFront').dispatchEvent(new Event('input'));check(el('publicDirectoryCount').textContent.startsWith('1 de 2'),'Front filter');
   el('publicDirectoryFront').value='';el('publicDirectoryFront').dispatchEvent(new Event('input'));
   check((await fetch('${base}/api/classifications')).status===401,'Admin API protected');
   check(document.documentElement.scrollWidth<=innerWidth,'Desktop horizontal overflow');return 'PASS';
  })()`);assert.equal(result,'PASS');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'desktop.png'),Buffer.from(r.data,'base64')));
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile horizontal overflow');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId).then(r=>writeFile(join(dir,'mobile.png'),Buffer.from(r.data,'base64')));
  console.log('Public directory synthetic browser evidence:',dir);
 }finally{
  browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});
  await new Promise(r=>server.close(r));await rm(join(dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
