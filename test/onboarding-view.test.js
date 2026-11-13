import test from 'node:test';
import assert from 'node:assert/strict';

const view = () => import('../public/dashboard/requirements/onboarding/app.js');

test('model content and error messages are escaped as text', async () => {
  const { escapeHtml } = await view();
  assert.equal(escapeHtml('<script>"x" & \'y\'</script>'), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
});

const bundle = (stage = 0) => ({ flow: { revision: 3, stage, tracks: [{ id: 'web', technology: 'Web', area: 'Ventas', ownerEmail: 'owner@example.com' }], qaEmail: 'qa@example.com', businessEmail: 'business@example.com', artifact: { specs: [{ trackId: 'web', title: '<img onerror=bad>', content: '<script>bad()</script>' }], model: 'Hermes' }, tests: [], signatures: [] }, context: { requirement: { id: 'REQ-1', title: 'Pedido' }, versions: [{ id: 'v1', version: 1 }], sources: [], questions: [] }, blockers: [], packageHash: 'hash-current', canSignRoles: [{ roleId: 'qa', label: 'QA', email: 'qa@example.com' }], user: { email: 'qa@example.com' }, megaPrompt: '</textarea><script>bad()</script>' });

test('navigation gates use server blockers, not inferred ownership or test rules', async () => {
  const { nextGuard } = await view();
  assert.equal(nextGuard(bundle(5)), true);
  assert.equal(nextGuard({ ...bundle(1), blockers: ['Falta responsable'] }), false);
  assert.equal(nextGuard(bundle(6)), false);
  assert.equal(nextGuard(null), false);
  assert.equal(nextGuard(bundle(2), true), false);
});

test('seven stage views expose concrete actions and do not render model markup', async () => {
  const { stageMarkup } = await view();
  const expected = ['versionId', 'ownerEmail', 'generate', 'validate', 'attest', 'packageHash', 'readonly'];
  for (let i = 0; i < 7; i++) assert.ok(stageMarkup(bundle(i)).includes(expected[i]), `stage ${i}`);
  assert.ok(stageMarkup(bundle(2)).includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!stageMarkup(bundle(2)).includes('<script>'));
  assert.match(stageMarkup(bundle(2)), /Web · Ventas/);
  assert.match(stageMarkup(bundle(2)), /owner@example.com/);
  assert.ok(!stageMarkup(bundle(6)).includes('</textarea><script>'));
  assert.match(stageMarkup(bundle(4)), /no se ejecuta código/i);
  assert.match(stageMarkup(bundle(5)), /no es una firma/i);
  assert.match(stageMarkup(bundle(6)), /no aprueba CP/i);
});

test('signature display is bound to the current hash and authorized role options only', async () => {
  const { stageMarkup } = await view();
  const data = bundle(5);
  data.flow.signatures = [{ email: 'qa@example.com', roleId: 'qa', packageHash: 'old', decision: 'approve', name: 'QA' }];
  assert.match(stageMarkup(data), /No vigente/);
  assert.match(stageMarkup(data), /owner@example.com/);
  assert.match(stageMarkup(data), /business@example.com/);
  assert.ok(!stageMarkup(data).includes('value="owner@example.com"'));
  data.flow.signatures[0].packageHash = data.packageHash;
  assert.match(stageMarkup(data), /Vigente/);
});

test('poll eligibility is limited to active jobs, visible document and six minutes', async () => {
  const { shouldPoll } = await view();
  assert.equal(shouldPoll({ status: 'running' }, false, 0), true);
  assert.equal(shouldPoll({ status: 'queued' }, false, 359999), true);
  assert.equal(shouldPoll({ status: 'running' }, true, 0), false);
  assert.equal(shouldPoll({ status: 'running' }, false, 360000), false);
  assert.equal(shouldPoll({ status: 'done' }, false, 0), false);
});

test('API helper sends explicit revisions and gives login/conflict messages', async () => {
  const { wizardRequest } = await view();
  let sent;
  const success = await wizardRequest('/api', { action: 'next', expectedRevision: 7 }, async (url, init) => {
    sent = { url, init }; return { ok: true, json: async () => bundle(2) };
  });
  assert.equal(success.flow.stage, 2);
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(sent.init.body), { action: 'next', expectedRevision: 7 });
  assert.equal(sent.init.credentials, 'same-origin');
  for (const status of [401, 409]) await assert.rejects(wizardRequest('/api', null, async () => ({ ok: false, status, json: async () => ({ error: '<b>unsafe</b>' }) })), error => error.status === status && (status === 401 ? /sesión/.test(error.message) : /conflicto/i.test(error.message)));
});

test('poller ignores stale selections and never overlaps a request', async () => {
  const { createPoller } = await view();
  let resolve, reads = 0, accepts = 0;
  const timers = [];
  const poller = createPoller({ read: () => { reads++; return new Promise(r => { resolve = r; }); }, accept: () => { accepts++; }, hidden: () => false, schedule: fn => { timers.push(fn); return timers.length; }, cancel: () => {}, now: () => 0 });
  poller.start({ status: 'running' });
  const pending = timers.shift()();
  assert.equal(reads, 1);
  assert.equal(timers.length, 0);
  poller.stop();
  resolve(bundle(2));
  await pending;
  assert.equal(accepts, 0);
  assert.equal(timers.length, 0);
});

test('signature owner summary reports only matching-hash decisions and preserves distinct roles', async () => {
  const { stageMarkup } = await view();
  const data = bundle(5);
  data.flow.signatures = [{ roleId: 'qa', email: 'qa@example.com', packageHash: data.packageHash, decision: 'approve', at: 'now' }];
  assert.match(stageMarkup(data), /Aceptaciones del hash actual: qa/);
  assert.match(stageMarkup(data), /Sin aceptación del hash actual/);
});

test('one email assigned to several roles still needs each distinct role acceptance', async () => {
  const { stageMarkup } = await view();
  const data = bundle(5);
  data.flow.tracks[0].ownerEmail = 'qa@example.com';
  data.flow.businessEmail = 'qa@example.com';
  data.flow.signatures = [{ roleId: 'qa', email: 'qa@example.com', packageHash: data.packageHash, decision: 'approve' }];
  const html = stageMarkup(data);
  assert.equal((html.match(/Aceptaciones del hash actual: qa/g) || []).length, 1);
  assert.equal((html.match(/Sin aceptación del hash actual/g) || []).length, 2);
});

test('final delivery exposes document-only prompt checks and disables invalid export controls', async () => {
  const { stageMarkup } = await view();
  const data = bundle(6);
  data.megaPromptValidation = { passed: false, scope: 'Integridad documental, no ejecución de software', checks: [{ name: 'Tamaño', passed: false }] };
  const html = stageMarkup(data);
  assert.match(html, /Integridad documental, no ejecución de software/);
  assert.match(html, /data-copy disabled/);
  assert.doesNotMatch(html, /href="[^\"]+wizard\/export/);
});

test('poller does not overlap when restarting during an interrupted selection', async () => {
  const { createPoller } = await view();
  let resolve, reads = 0;
  const timers = [];
  const poller = createPoller({ read: () => { reads++; return new Promise(r => { resolve = r; }); }, accept: () => {}, hidden: () => false, schedule: fn => { timers.push(fn); return timers.length; }, cancel: () => {}, now: () => 0 });
  poller.start({ status: 'queued' });
  const pending = timers.shift()();
  poller.start({ status: 'running' });
  assert.equal(reads, 1);
  assert.equal(timers.length, 0);
  resolve(bundle(2)); await pending;
  assert.equal(timers.length, 1);
  poller.stop();
});

test('form payloads retain source tracks in stage zero and bind signatures to displayed hash', async () => {
  const { buildPayload } = await view();
  const data = bundle(0);
  assert.deepEqual(buildPayload('configure', { versionId: 'v1' }, [], data), { action: 'configure', expectedRevision: 3, versionId: 'v1', tracks: data.flow.tracks, qaEmail: 'qa@example.com', businessEmail: 'business@example.com' });
  const signed = buildPayload('sign', { roleId: 'qa', packageHash: 'displayed-hash', decision: 'approve', comment: 'Revisado' }, [], data);
  assert.equal(signed.packageHash, 'displayed-hash');
  assert.equal(signed.expectedRevision, 3);
  const reported = buildPayload('test', { attest: 'on', trackId: 'web', criterion: 'C', risk: 'R', steps: 'S', expected: 'E', actual: 'A', outcome: 'passed', evidenceUrl: '', evidenceSourceId: '' }, [], data);
  assert.equal(reported.attest, true);
  assert.equal(reported.evidenceUrl, undefined);
});

test('page provides semantic navigation, session link and its own responsive stylesheet', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/dashboard/requirements/onboarding/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/dashboard/requirements/onboarding/styles.css', import.meta.url), 'utf8');
  assert.match(html, /lang="es"/);
  assert.match(html, /\/dashboard\/styles.css/);
  assert.match(html, /\/dashboard\/requirements\/flow/);
  assert.match(html, /\/dashboard\/auth\/login/);
  assert.match(html, /id="requirementSelect"/);
  assert.match(html, /id="stageBody"/);
  assert.match(css, /@media/);
});
