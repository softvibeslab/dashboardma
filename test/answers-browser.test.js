import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

test('native answer accordion retains independent expansion through polling, edits, approval and requirement remounts', { timeout: 30000 }, async t => {
  if (spawnSync('chromium', ['--version']).status !== 0) return t.skip('Chromium not installed');
  const dir = await mkdtemp('/root/.hermes/cache/scratch/answers-browser-');
  const moduleURL = new URL('../public/dashboard/requirements/answers.js', import.meta.url).href;
  const cssURL = new URL('../public/dashboard/requirements/answers.css', import.meta.url).href;
  const script = `
const {initializeAnswers,renderAnswersSection}=await import('${moduleURL}');
const check=(v,m)=>{if(!v)throw Error(m)};
const pause=()=>new Promise(r=>setTimeout(r,30));
const wait=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await pause()}throw Error('wait timed out')};
let selected={id:'R1'}, callbacks=[], posts=[], reads=0;
let items=[{id:'q1',question:'<Safe question> '+ 'long'.repeat(40),answerStatus:'draft',answerDraft:'draft',answerRevision:0,answerHistory:[{text:'old'}]}, {id:'q2',question:'Already approved',answerStatus:'approved',answer:'Yes'}];
const mount=()=>{document.getElementById('host').innerHTML=renderAnswersSection(selected);document.dispatchEvent(new CustomEvent('requirement-workspace-change',{detail:selected}))};
const card=(id='q1')=>document.querySelector('[data-answer-question-id="'+id+'"]');
const toggle=async(id='q1')=>{card(id).querySelector('summary').click();await pause()};
try {
 mount(); window.confirm=()=>true;
 const controller=initializeAnswers({getSelectedRequirement:()=>selected,onChange:x=>callbacks.push(x),api:async(path,options)=>{
  if(!options){reads++;return {items:structuredClone(items)}}
  const p=JSON.parse(options.body);posts.push(p);const item=items[0]={...items[0],answerRevision:items[0].answerRevision+1,answerDraft:p.text,answer:p.text,answerStatus:p.action==='approve'?'approved':'draft'};return {item};
 }});
 await wait(()=>card());
 check(!card().open&&!card('q2').open,'all questions collapsed initially');
 check(card().querySelector('summary').textContent.includes('Pendiente'),'pending badge');
 check(card('q2').querySelector('summary').textContent.includes('Aprobada'),'approved badge');
 check(!card().querySelector('Safe'),'escaped title');
 await toggle();await toggle('q2');
 const history=card().querySelector('.answers-history');history.open=true;await pause();
 await controller.refresh();check(card().open&&card('q2').open,'independent expansion survives refresh');
 check(card().querySelector('.answers-history').open,'audit expansion survives refresh');
 const input=card().querySelector('[data-answer-field="text"]');input.value=' exact human text ';input.dispatchEvent(new Event('input',{bubbles:true}));
 card().querySelector('[data-answer-action="edit"]').click();await wait(()=>posts.length===1);await pause();
 check(card().open&&card().querySelector('[data-answer-field="text"]').value===' exact human text ','save keeps expansion/text');
 card().querySelector('[data-answer-action="approve"]').click();await wait(()=>callbacks.length===2);await pause();
 check(card().open&&card().querySelector('summary').textContent.includes('Aprobada'),'approval keeps expansion and updates badge');
 check(posts[1].text===' exact human text '&&posts[1].expectedRevision===1,'exact approval/revision');
 await toggle();await controller.refresh();check(!card().open&&card('q2').open,'nested open history does not reopen question');
 // Returning to the same requirement must retain the last independently expanded questions.
 selected={id:'R2'};mount();await wait(()=>card());check(!card().open&&!card('q2').open,'same question IDs isolated by requirement');
 await toggle();selected={id:'R1'};mount();await wait(()=>card());
 check(!card().open&&card('q2').open,'requirement expansion survives remount without leakage');
 await toggle();await pause();
 // Exercise the actual scheduled poll with a pending answer, not only manual refresh.
 items[0].assistance={status:'queued'};await controller.refresh();const before=reads;
 await wait(()=>reads>before);check(card().open&&card('q2').open,'automatic poll preserves expansion');
 check(document.documentElement.scrollWidth<=document.documentElement.clientWidth,'mobile overflow');
 check(getComputedStyle(card().querySelector('summary')).minHeight==='44px','mobile summary touch target');
 controller.destroy();document.body.dataset.testResult='PASS';
} catch(error){document.body.dataset.testResult='FAIL '+error.stack}
`;
  const file = join(dir, 'test.html');
  await writeFile(file, `<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssURL}"><div id="host"></div><script type="module">${script}</script>`);
  const browser = spawn('chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--allow-file-access-from-files','--window-size=390,844',`--user-data-dir=${join(dir,'profile')}`,'--remote-debugging-pipe'], { stdio:['ignore','ignore','ignore','pipe','pipe'] });
  let sequence=0, buffer=''; const pending=new Map();
  browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const p=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(p.id)?.(p);pending.delete(p.id);}});
  const cdp=async(method,params={},sessionId)=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');const p=await response;if(p.error)throw Error(JSON.stringify(p.error));return p.result;};
  try {
    const {targetId}=await cdp('Target.createTarget',{url:pathToFileURL(file).href});
    const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
    let result;
    for(let i=0;i<220;i++){result=(await cdp('Runtime.evaluate',{expression:'document.body?.dataset.testResult',returnByValue:true},sessionId)).result?.value;if(result)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(result,'PASS');
  } finally {browser.kill('SIGKILL');await new Promise(r=>browser.once('exit',r));await rm(dir,{recursive:true,force:true});}
});
