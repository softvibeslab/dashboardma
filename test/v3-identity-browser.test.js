import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {staffingFixture} from '../test-support/staffing-fixture.js';
import {createV3Server} from '../src/onboarding-v3/server.js';
import {initial} from '../src/onboarding-v2/model.js';
test('V3 actual-backend Chromium signed synthetic identity across entry, seven phases, catalog/review and public privacy',{timeout:60000},async()=>{
 const f=await staffingFixture(),secret='synthetic-browser-only-secret';
 const name='Synthetic <img src=x onerror=window.identityXss=true> & Person',email='synthetic+identity@example.test';
 const users=[{id:'USR-AZ-SYNTHETIC',tid:'synthetic-tenant',oid:'synthetic-oid',name:'Mapped synthetic',roles:['editor','coordinator']}];
 const state=initial();state.phases[1].owner=users[0].id;await writeFile(path.join(f.dir,'state.json'),JSON.stringify(state));
 const server=createV3Server({users,sessionSecret:secret,dataFile:path.join(f.dir,'state.json'),catalogSourceFile:f.file,directoryFile:f.source,publicDirectory:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/dashboard/onboarding-v3';
 const publicBefore=await(await fetch(base+'/api/directory')).json();
 const browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote',`--user-data-dir=${path.join(f.dir,'profile')}`,'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let seq=0,buffer='';const pending=new Map(),errors=[];
 browser.stdio[4].on('data',c=>{buffer+=c;let i;while((i=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.text);pending.get(p.id)?.(p);pending.delete(p.id);}});
 const cdp=async(method,params={},sessionId)=>{const id=++seq,p=new Promise(r=>pending.set(id,r));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const r=await p;if(r.error)throw Error(JSON.stringify(r.error));return r.result;};
 try{
 const {targetId}=await cdp('Target.createTarget',{url:base+'/'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 const wait=async expr=>{for(let i=0;i<150;i++){if(await ev(expr))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+expr);};
 await cdp('Runtime.enable',{},sessionId);await cdp('Page.enable',{},sessionId);
 const b=Buffer.from(JSON.stringify({tid:users[0].tid,oid:users[0].oid,name,email,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 await cdp('Network.setCookie',{name:'ma_ct_session',value:b+'.'+createHmac('sha256',secret).update(b).digest('base64url'),url:origin,path:'/'},sessionId);
 const check=async(route,selector)=>{await cdp('Page.navigate',{url:base+route},sessionId);await wait(`document.querySelector(${JSON.stringify(selector)})?.textContent.includes(${JSON.stringify(name)})`);const text=await ev(`document.querySelector(${JSON.stringify(selector)}).textContent`);assert.ok(text.includes(email),text);assert.ok(!text.includes(users[0].id),text);assert.equal(await ev('!!window.identityXss'),false);assert.equal(await ev(`document.querySelector(${JSON.stringify(selector)}).querySelector('img')!==null`),false);};
 await check('/','#sessionStatus');assert.ok((await ev(`document.querySelector('#owner').selectedOptions[0].textContent`)).includes(name));
 for(let phase=1;phase<=7;phase++){await ev(`sessionStorage.setItem('v3-phase','${phase}')`);await check('/advanced','#identity');assert.ok(!(await ev(`document.querySelector('#ownerStatus').textContent`)).includes(users[0].id));}
 await check('/classifications','#catalogIdentity');await check('/classifications#reviewSection','#catalogIdentity');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);await check('/','#sessionStatus');
 await cdp('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(f.dir,'identity-mobile.png'),Buffer.from(r.data,'base64')));
 const after=await(await fetch(base+'/api/directory')).json();assert.deepEqual(after,publicBefore);for(const u of after.users)assert.deepEqual(Object.keys(u).sort(),['fronts','name']);assert.ok(!JSON.stringify(after).includes(email));
 assert.deepEqual(errors,[]);console.log('Identity synthetic browser evidence:',f.dir);
 }finally{browser.kill('SIGTERM');await new Promise(r=>{if(browser.exitCode!==null)return r();browser.once('exit',r);});await new Promise(r=>server.close(r));await rm(path.join(f.dir,'profile'),{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
