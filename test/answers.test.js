import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';

async function fixture(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'answers-'));
  const dataFile = path.join(dir, 'state.json');
  await writeFile(dataFile, JSON.stringify({ requirements: [{ id: 'R1', title: 'Caso sintético', description: 'Validar persistencia antes de confirmar' }, { id: 'R2', title: 'Otro requerimiento' }], requirementQuestions: [{ id: 'Q1', requirementId: 'R1', question: '¿Cómo se confirma?', suggestedAnswer: 'Confirmar después de guardar', status: 'open' }] }));
  const server = createServer({ dataFile, auth: { enabled: false }, enrichment: { enabled: true } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/api`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await run({ base, post, dir, dataFile }); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}

test('response drafts require explicit version-bound human approval with immutable evidence', async () => {
  await fixture(async ({ base, post, dir }) => {
    const endpoint = '/requirements/R1/questions/Q1/answer';
    const edit = await post(endpoint, { action: 'edit', expectedRevision: 0, text: 'Primero persistir; después confirmar.' });
    assert.equal(edit.status, 200);
    let { item } = await edit.json();
    assert.equal(item.answerStatus, 'draft');
    assert.equal(item.answer || '', '');
    assert.equal(item.answerRevision, 1);
    assert.equal((await post(endpoint, { action: 'approve', expectedRevision: 0, text: item.answerDraft })).status, 409);
    const approved = await post(endpoint, { action: 'approve', expectedRevision: 1, text: item.answerDraft, actor: { name: 'Forged' } });
    assert.equal(approved.status, 200);
    item = (await approved.json()).item;
    assert.equal(item.answerStatus, 'approved');
    assert.equal(item.status, 'answered');
    assert.equal(item.answer, 'Primero persistir; después confirmar.');
    const record = item.answerHistory.at(-1);
    assert.equal(record.action, 'approve');
    assert.notEqual(record.actor.name, 'Forged');
    assert.equal(record.hash, crypto.createHash('sha256').update(item.answer).digest('hex'));
    const enrichment = await post('/requirements/R1/enrich', {}).then((r) => r.json());
    const snapshot = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${enrichment.run.id}.request.json`)));
    assert.equal(snapshot.approvedAnswers[0].answer, item.answer);
    assert.equal(snapshot.approvedAnswers[0].approval.hash, record.hash);
    assert.equal((await fetch(base + '/requirementQuestions/Q1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'forged', answerStatus: 'approved' }) })).status, 405);
    assert.equal((await post('/requirements/R2/questions/Q1/answer', { action: 'approve', expectedRevision: 2, text: item.answer })).status, 404);
    const changed = await post(endpoint, { action: 'edit', expectedRevision: 2, text: 'Nueva propuesta pendiente' }).then((r) => r.json());
    assert.equal(changed.item.answerStatus, 'draft');
    assert.equal(changed.item.answer || '', '');
    assert.equal(changed.item.answerHistory.filter((event) => event.action === 'approve').length, 1);
  });
});

test('manual questions support rejection and cannot approve a rejected proposal', async () => {
  await fixture(async ({ base, post }) => {
    const result = await post('/requirements/R1/questions', { question: '¿Cuándo reintentar?', role: 'QA' });
    assert.equal(result.status, 201);
    let item = (await result.json()).item;
    assert.equal(item.status, 'open');
    const route = `/requirements/R1/questions/${item.id}/answer`;
    item = (await post(route, { action: 'edit', expectedRevision: 0, text: 'Propuesta por revisar' }).then((r) => r.json())).item;
    item = (await post(route, { action: 'reject', expectedRevision: item.answerRevision }).then((r) => r.json())).item;
    assert.equal(item.answerStatus, 'rejected');
    assert.equal(item.answer, '');
    assert.equal((await post(route, { action: 'approve', expectedRevision: item.answerRevision, text: item.answerDraft })).status, 409);
    assert.equal((await fetch(base + '/requirements/R2/answers').then((r) => r.json())).items.length, 0);
    assert.equal((await post(route, { action: 'suggest', expectedRevision: item.answerRevision, text: 42 })).status, 400);
  });
});

test('assistance redacts common credential patterns from full draft context', async () => {
  await fixture(async ({ post, dir }) => {
    const response = await post('/requirements/R1/questions/Q1/answer', { action: 'suggest', expectedRevision: 0, text: 'Borrador sintético client_secret=TEST-NOT-A-SECRET' });
    assert.equal(response.status, 202);
    const { item } = await response.json();
    const snapshot = await readFile(path.join(dir, 'enrichment-jobs', `${item.assistance.id}.request.json`), 'utf8');
    assert.doesNotMatch(snapshot, /TEST-NOT-A-SECRET/);
  });
});

test('Hermes assistance remains unapproved and cannot overwrite a newer human draft', async () => {
  for (const concurrentEdit of [false, true]) await fixture(async ({ base, post, dir }) => {
    const endpoint = '/requirements/R1/questions/Q1/answer';
    const response = await post(endpoint, { action: 'suggest', expectedRevision: 0, text: 'Borrador visible de prueba', instruction: 'Explica las excepciones' });
    assert.equal(response.status, 202);
    const queued = (await response.json()).item;
    assert.equal(queued.assistance.status, 'queued');
    const job = queued.assistance.id;
    const bytes = await readFile(path.join(dir, 'enrichment-jobs', `${job}.request.json`));
    const snapshot = JSON.parse(bytes);
    assert.match(snapshot.chat.message, /¿Cómo se confirma\?/);
    assert.match(snapshot.chat.message, /Borrador visible de prueba/);
    assert.match(snapshot.chat.message, /Explica las excepciones/);
    assert.equal((await fetch(base + '/requirements/R1/chat').then((r) => r.json())).items.length, 0);
    if (concurrentEdit) await post(endpoint, { action: 'edit', expectedRevision: 0, text: 'Nueva decisión humana pendiente' });
    await writeFile(path.join(dir, 'enrichment-jobs', `${job}.result.json`), JSON.stringify({ status: 'completed', runId: job, kind: 'chat', answer: 'Propuesta sintética de prueba unitaria', toolsCount: 0, model: 'unit-test-fixture', inputHash: crypto.createHash('sha256').update(bytes).digest('hex') }));
    const current = (await fetch(base + '/requirements/R1/answers').then((r) => r.json())).items[0];
    assert.equal(current.answer || '', '');
    assert.notEqual(current.answerStatus, 'approved');
    if (concurrentEdit) {
      assert.equal(current.assistance.status, 'stale');
      assert.equal(current.answerDraft, 'Nueva decisión humana pendiente');
    } else {
      assert.equal(current.answerStatus, 'suggested');
      assert.equal(current.answerDraft, 'Propuesta sintética de prueba unitaria');
      assert.equal(current.answerModel, 'unit-test-fixture');
    }
  });
});
