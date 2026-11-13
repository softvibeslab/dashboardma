import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('V2 accessible seven-phase standalone UI exposes real server actions, version diff and honest integration states',async()=>{
 const html=await readFile(new URL('../public/onboarding-v2/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/onboarding-v2/app.js',import.meta.url),'utf8');
 assert.match(html,/lang="es"/); assert.match(html,/aria-live/);assert.match(html,/<nav/);assert.match(html,/type="password"/);
 for(const action of ['save','confirm','review','decide','receipt','comment'])assert.ok(app.includes(`'${action}'`));
 assert.match(app,/specIndex/);assert.match(app,/applyPermissions/);assert.match(app,/assigned/);
 assert.match(app,/history/);assert.match(app,/not-run|No ejecutada/);assert.match(app,/software/);assert.doesNotMatch(html,/torre ejecutiva/i);
});
