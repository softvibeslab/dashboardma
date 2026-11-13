import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const view = await import('../public/dashboard/requirements/collaboration.js').catch(() => ({}));
test('workspace exposes scoped sections without raw requirement HTML', () => {
  assert.equal(typeof view.renderWorkspace, 'function');
  const html = view.renderWorkspace({ id: 'REQ-7', title: '<script>evil</script>' });
  assert.match(html, /requirement-discussion/);
  assert.match(html, /requirement-azure-attachments/);
  assert.match(html, /data-collab-action="open-chat"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /maxlength="4000"/);
  assert.equal(view.initializeCollaboration({}), null);
});

test('initialization mounts one persistent labelled dialog and binds delegated handlers once', () => {
  const handlers = new Map();
  const children = [];
  const fakeDocument = {
    body: { append(node) { children.push(node); } },
    getElementById() { return null; },
    createElement(tag) { return { tagName: tag, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() { children.splice(children.indexOf(this), 1); } }; },
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); }
  };
  globalThis.document = fakeDocument;
  try {
    const options = { api: async () => ({}), getSelectedRequirement: () => null };
    const controller = view.initializeCollaboration(options);
    assert.ok(controller);
    assert.equal(view.initializeCollaboration(options), controller);
    assert.equal(children.length, 1);
    assert.equal(children[0].tagName, 'dialog');
    assert.match(children[0].innerHTML, /maxlength="2000"/);
    assert.ok(handlers.has('click'));
    assert.ok(handlers.has('submit'));
    assert.ok(handlers.has('requirement-workspace-change'));
    controller.destroy();
    assert.equal(children.length, 0);
    assert.equal(handlers.size, 0);
  } finally { delete globalThis.document; }
});

test('Azure URLs permit only HTTPS dev.azure.com without credentials', () => {
  assert.equal(typeof view.safeAzureUrl, 'function');
  assert.equal(view.safeAzureUrl('https://dev.azure.com/org/project/_apis/wit/attachments/7'), 'https://dev.azure.com/org/project/_apis/wit/attachments/7');
  for (const url of ['javascript:alert(1)', 'https://dev.azure.com.evil.test/a', 'http://dev.azure.com/a', 'https://user:pass@dev.azure.com/a', 'https://dev.azure.com:8443/a', '/relative', 'https://other.visualstudio.com/a']) assert.equal(view.safeAzureUrl(url), '');
});

test('Azure states are actionable and attachment links are validated', () => {
  assert.equal(typeof view.renderAzureAttachments, 'function');
  assert.match(view.renderAzureAttachments({ status: 'unlinked' }), /URL del ticket/);
  assert.match(view.renderAzureAttachments({ status: 'not_loaded' }), /Consultar\/Actualizar/);
  const html = view.renderAzureAttachments({ status: 'completed', workItem: { id: 72, project: '<unsafe>', url: 'https://dev.azure.com/org/p/_workitems/edit/72' }, items: [{ name: '<script>bad</script>', url: 'javascript:alert(1)' }, { name: 'anexo.pdf', url: 'https://dev.azure.com/org/a' }], fetchedAt: 'hoy' });
  assert.doesNotMatch(html, /<script>|javascript:/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Abrir ticket en Azure/);
  assert.match(html, /hoy/);
});

test('chat and forum escape raw messages, expose provenance, and cap history', () => {
  assert.equal(typeof view.renderChatTurns, 'function');
  const chat = view.renderChatTurns({ items: [{ message: '<img onerror=evil>', answer: '<script>x</script>', status: 'completed', model: 'Hermes', contextVersion: 8 }], context: { version: 9, status: 'running' } });
  assert.doesNotMatch(chat, /<img|<script>/);
  assert.match(chat, /Contexto utilizado: 8/);
  assert.match(chat, /Contexto actual: 9/);
  const html = view.renderDiscussion({ items: Array.from({ length: 110 }, (_, i) => ({ message: `nota-${i}`, authorName: '<script>', createdAt: String(i) })), hasMore: true });
  assert.equal((html.match(/class="collab-note"/g) || []).length, 100);
  assert.match(html, /Historial parcial/);
  assert.doesNotMatch(html, /<script>|>nota-0</);
  assert.match(html, /nota-109/);
});

test('native browser: pinned chat, safe stale responses, idempotent retries and draft retention', async (t) => {
  if (spawnSync('chromium', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('Chromium no está instalado'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'collaboration-browser-'));
  const moduleUrl = new URL('../public/dashboard/requirements/collaboration.js', import.meta.url).href;
  const cssUrl = new URL('../public/dashboard/requirements/collaboration.css', import.meta.url).href;
  const harness = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${cssUrl}"><div id="workspace"></div><pre id="result">RUNNING</pre><script type="module">
import {renderWorkspace, initializeCollaboration} from '${moduleUrl}';
const check=(condition,message)=>{if(!condition)throw Error(message)};
const pause=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const el=id=>document.getElementById(id);
let selected={id:'REQ-A',title:'Requerimiento A'}, calls=[], forumResolve, chatResolve, azureResolve;
let azureBReads=0, azurePending=false;
const originalTimeout=window.setTimeout.bind(window);
window.setTimeout=(callback,delay,...args)=>originalTimeout(callback,delay===5000?50:delay,...args);
let chatFailures=2;
const api=async(path,options)=>{
 calls.push({path,options});
 check(options.headers['content-type']==='application/json','JSON headers');
 if(path.endsWith('/chat')) {
  if(options.method==='POST') {
   if(chatFailures-->0)throw Error('fallo de red de prueba');
   return {turn:{id:'turno',message:JSON.parse(options.body).message,status:'completed',answer:'respuesta segura',contextVersion:3}};
  }
  if(path.includes('REQ-A'))return await new Promise(r=>chatResolve=r);
  return {items:[],context:{version:3,status:'completed'}};
 }
 if(path.endsWith('/discussion')) {
  if(options.method==='POST')return await new Promise(r=>forumResolve=r);
  return {items:[],hasMore:false};
 }
 if(path.includes('REQ-A')) return await new Promise(r=>azureResolve=r);
 azureBReads++;
 return {status:azurePending||azureBReads===1?'queued':'completed',items:[]};
};
function render(req=selected){selected=req;el('workspace').innerHTML=renderWorkspace(req);document.dispatchEvent(new CustomEvent('requirement-workspace-change',{detail:req}));}
function input(id,value){el(id).value=value;el(id).dispatchEvent(new Event('input',{bubbles:true}));}
try {
 render(); const controller=initializeCollaboration({api,getSelectedRequirement:()=>selected}); await pause();
 check(calls.every(c=>c.options.method!=='POST'),'no automatic Azure POST');
 input('requirement-discussion-message','borrador del equipo'); const count=calls.length; render(); await pause();
 check(el('requirement-discussion-message').value==='borrador del equipo','forum draft survives parent rerender');
 check(calls.length===count,'no background fetch on identical rerender');
 document.querySelector('[data-collab-action="open-chat"]').click();
 input('requirement-chat-message','borrador privado');
 render({id:'REQ-B',title:'Requerimiento B'}); await pause();
 azureResolve({status:'completed',items:[]}); await pause(100);
 check(azureBReads>=2,'stale Azure response must not cancel selected requirement polling');
 check(el('requirement-chat-title').textContent.includes('REQ-A'),'popup remains pinned');
 check(el('requirement-chat-message').value==='borrador privado','chat draft survives selection change');
 el('requirement-hermes-dialog').dispatchEvent(new Event('cancel',{cancelable:true})); await pause();
 check(!el('requirement-hermes-dialog').open,'Escape closes dialog');
 document.querySelector('[data-collab-action="open-chat"]').click();
 chatResolve({items:[{message:'LEAK-OLD',answer:'LEAK-OLD',status:'completed'}]}); await pause(350);
 check(!el('requirement-chat-history').textContent.includes('LEAK-OLD'),'stale A response rejected');
 check(document.querySelectorAll('dialog').length===1,'single persistent dialog');
 check(document.activeElement===el('requirement-chat-message'),'focus in message field');
 input('requirement-chat-message','consulta'); el('requirement-chat-form').requestSubmit(); await pause();
 el('requirement-chat-form').requestSubmit(); await pause();
 let posts=calls.filter(c=>c.path.endsWith('/chat')&&c.options.method==='POST');
 check(JSON.parse(posts[0].options.body).clientRequestId===JSON.parse(posts[1].options.body).clientRequestId,'exact retry reuses UUID');
 input('requirement-chat-message','consulta editada'); el('requirement-chat-form').requestSubmit(); await pause();
 posts=calls.filter(c=>c.path.endsWith('/chat')&&c.options.method==='POST');
 check(JSON.parse(posts[2].options.body).clientRequestId!==JSON.parse(posts[1].options.body).clientRequestId,'edit gets new UUID');
 check(posts.every(c=>c.path.includes('REQ-B')),'sending captures pinned requirement');
 document.querySelector('[data-collab-action="close-chat"]').click(); await pause();
 input('requirement-discussion-message','nota publicada'); el('requirement-discussion-form').requestSubmit(); render();
 forumResolve({item:{id:'nota',message:'nota publicada'}}); await pause();
 check(el('requirement-discussion-message').value==='','successful forum POST clears even replacement field');
 const beforeClose=calls.filter(c=>c.path.endsWith('/chat')).length; await pause(2700);
 check(calls.filter(c=>c.path.endsWith('/chat')).length===beforeClose,'no polling after close');
 azurePending=true; document.querySelector('[data-collab-action="refresh-azure"]').click(); await pause();
 const beforeExpiry=azureBReads, realNow=Date.now; Date.now=()=>realNow()+180001; await pause(100); Date.now=realNow;
 check(azureBReads===beforeExpiry,'no Azure request after three-minute polling deadline');
 check(el('requirement-azure-attachments').textContent.includes('3 minutos'),'polling timeout is visible');
 controller.destroy();
 el('result').textContent='BROWSER_PASS';
} catch(error){el('result').textContent='BROWSER_FAIL: '+error.stack;}
</script>`;
  const browser = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--disable-background-networking', '--no-first-run', '--allow-file-access-from-files', '--window-size=390,844', `--user-data-dir=${join(dir, 'profile')}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '';
  const pendingCalls = new Map();
  browser.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\u0000')) >= 0) {
      const packet = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      const resolve = pendingCalls.get(packet.id);
      if (resolve) { pendingCalls.delete(packet.id); resolve(packet); }
    }
  });
  const cdp = async (method, params = {}, sessionId) => {
    const id = ++sequence;
    const reply = new Promise((resolve) => pendingCalls.set(id, resolve));
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\u0000');
    const packet = await Promise.race([reply, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('CDP timeout: ' + method)), 10000); timer.unref(); })]);
    if (packet.error) throw Error(JSON.stringify(packet.error));
    return packet.result;
  };
  try {
    const file = join(dir, 'test.html'); writeFileSync(file, harness);
    const { targetId } = await cdp('Target.createTarget', { url: pathToFileURL(file).href });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    let result = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      const evaluation = await cdp('Runtime.evaluate', { expression: 'document.getElementById("result")?.textContent', returnByValue: true }, sessionId);
      result = evaluation.result?.value || '';
      if (result.startsWith('BROWSER_')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(result, 'BROWSER_PASS');
  } finally {
    browser.kill('SIGKILL');
    await new Promise((resolve) => browser.once('exit', resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
