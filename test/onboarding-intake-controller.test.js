import test from 'node:test';
import assert from 'node:assert/strict';
import * as intake from '../public/dashboard/requirements/onboarding/intake.js';
test('source intake validates URLs and multipart size, preserves errors, and ignores destroyed async work', async () => {
  const calls = [], renders = [], changes = [], late = deferred();
  const controller = intake.createIntake({ id: 'A', render: s => renders.push(s.error), onChange: x => changes.push(x), request: async (path, init = {}) => {
    calls.push([path, init]);
    if (init.method === 'POST') throw Error('upload offline');
    if (path.endsWith('/A')) return { item: { description: 'original' } };
    return { items: [], configured: false };
  } });
  await controller.load();
  assert.equal(typeof controller.addUrl, 'function');
  assert.equal(await controller.addUrl('javascript:alert(1)', 'document'), false);
  assert.equal(await controller.addUrl('https://user:pass@example.com', 'document'), false);
  assert.equal(calls.filter(([, i]) => i.method === 'POST').length, 0);
  assert.equal(await controller.addUrl('https://example.com/?x=1&y=2', 'document'), false);
  assert.match(controller.state.error, /offline/);
  const form = new FormData(); form.append('files', new Blob(['hello']), 'test.txt');
  assert.equal(await controller.upload(form, 10 * 1024 * 1024 + 1), false);
  assert.match(controller.state.error, /MiB/);
  await controller.upload(form, 500);
  assert.equal(calls.at(-1)[1].body, form);
  assert.equal(calls.at(-1)[1].headers, undefined, 'browser sets multipart boundary');
  const stale = intake.createIntake({ id: 'A', request: () => late.promise, render: () => renders.push('stale'), onChange: x => changes.push(x) });
  const loading = stale.load(); stale.destroy(); late.resolve({ item: {}, run: { status: 'completed', versionId: 'late' }, items: [] }); await loading;
  assert.ok(!renders.includes('stale')); assert.ok(!changes.some(x => x.versionId === 'late'));
  assert.equal(intake.sourceUrl('javascript:bad'), '');
  assert.equal(intake.sourceUrl('https://example.com/a'), 'https://example.com/a');
  const html = intake.sourcesMarkup('A /', [{ id: 'S /', storageKey: 'key', name: '<img>', type: 'file' }, { url: 'javascript:bad', name: 'unsafe' }]);
  assert.match(html, /A%20%2F\/sources\/S%20%2F\/download/); assert.match(html, /&lt;img&gt;/); assert.doesNotMatch(html, /href="javascript/);
  controller.destroy();
});

test('a failed post-write readback reports failure instead of clearing an unverified editor', async () => {
  let written = false;
  const controller = intake.createIntake({ id: 'A', request: async (path, init = {}) => {
    if (init.method === 'PUT') { written = true; return { item: { description: 'saved' } }; }
    if (written) throw Error('readback offline');
    return { item: { description: 'old' }, items: [] };
  } });
  await controller.load();
  assert.equal(await controller.saveContext('saved'), false);
  assert.match(controller.state.error, /readback offline/);
  controller.destroy();
});

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

test('inline intake reads only on open, saves context via PUT, queues explicitly once and reports durable completion', async () => {
  assert.equal(typeof intake.createIntake, 'function');
  const calls = [], changes = [], pending = deferred(); let run = null;
  const controller = intake.createIntake({ id: 'REQ A', onChange: x => changes.push(x), request: async (path, init = {}) => {
    calls.push([path, init]);
    if (path.endsWith('/enrich')) { await pending.promise; run = { id: 'r1', status: 'queued' }; return { run }; }
    if (path.endsWith('/enrichment')) return { run };
    if (path.endsWith('/REQ%20A')) return { item: { id: 'REQ A', description: 'context' } };
    return { items: [{ requirementId: 'other', name: 'private' }, { requirementId: 'REQ A', name: 'own' }], configured: true };
  } });
  assert.equal(calls.length, 0);
  await controller.load();
  assert.ok(calls.every(([, init]) => !init.method || init.method === 'GET'));
  assert.equal(controller.state.sources.length, 1);
  await controller.saveContext('revised');
  assert.equal(calls.find(([, i]) => i.method === 'PUT')[1].body, JSON.stringify({ description: 'revised' }));
  const first = controller.enrich(); await controller.enrich();
  assert.equal(calls.filter(([p]) => p.endsWith('/enrich')).length, 1);
  pending.resolve(); await first;
  assert.equal(controller.state.run.status, 'queued');
  run = { id: 'r1', status: 'completed', versionId: 'v2' };
  await controller.load();
  assert.ok(changes.some(x => x.reason === 'generation' && x.versionId === 'v2'));
  controller.destroy();
});
