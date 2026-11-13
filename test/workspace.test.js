import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { RequirementWorkspace } from '../src/workspace.js';
import { JsonStore } from '../src/store.js';

async function withWorkspace(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ma-workspace-'));
  const dataFile = path.join(dir, 'state.json');
  const seed = { requirements: [{ id: 'REQ-ONE', title: 'Guardar pedido', project: 'mobileApps', description: 'Confirmar después de persistir' }, { id: 'REQ-TWO', title: 'Otra historia', project: 'Otro cliente' }],
    requirementSources: [{ id: 'SOURCE-ONE', requirementId: 'REQ-ONE', type: 'other-url', url: 'https://dev.azure.com/MobileappsAmerica/mobileApps/_workitems/edit/42' }, { id: 'SOURCE-FILE', requirementId: 'REQ-ONE', name: 'nota.txt', type: 'file', storageKey: 'REQ-ONE/nota.txt' }],
    workItems: [{ id: 'ADO-42', azureId: 42, project: 'mobileApps', syncSource: 'azure-devops', url: 'https://dev.azure.com/MobileappsAmerica/mobileApps/_workitems/edit/42' }] };
  await writeFile(dataFile, JSON.stringify(seed));
  await mkdir(path.join(dir, 'uploads', 'REQ-ONE'), { recursive: true });
  await writeFile(path.join(dir, 'uploads', 'REQ-ONE', 'nota.txt'), 'Nota sintética autorizada');
  const server = createServer({ dataFile, auth: { enabled: false }, enrichment: { enabled: true } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/api/requirements`;
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await fn({ base, dir, dataFile, post }); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}

test('discussion is scoped, append-only and idempotent with server-owned authors', async () => {
  await withWorkspace(async ({ base, post }) => {
    const response = await post(`${base}/REQ-ONE/discussion`, { message: 'Revisar validación offline', clientRequestId: 'comment-0001', authorName: 'Forged administrator' });
    assert.equal(response.status, 201);
    const { item } = await response.json();
    assert.notEqual(item.authorName, 'Forged administrator');
    await post(`${base}/REQ-ONE/discussion`, { message: 'Revisar validación offline', clientRequestId: 'comment-0001' });
    assert.equal((await fetch(`${base}/REQ-ONE/discussion`).then((r) => r.json())).items.length, 1);
    assert.equal((await fetch(`${base}/REQ-TWO/discussion`).then((r) => r.json())).items.length, 0);
    assert.equal((await post(`${base}/REQ-TWO/discussion`, { message: 'Respuesta cruzada', parentId: item.id, clientRequestId: 'comment-0002' })).status, 400);
    assert.equal((await fetch(`${base}/REQ-ONE/discussion`, { method: 'DELETE' })).status, 405);
    assert.equal((await post(`${base}/REQ-NO/discussion`, { message: 'No existe', clientRequestId: 'comment-0003' })).status, 404);
  });
});

test('chat queues only the selected requirement context and does not fabricate answers', async () => {
  await withWorkspace(async ({ base, post, dir }) => {
    const response = await post(`${base}/REQ-ONE/chat`, { message: '¿Qué falta para QA?', clientRequestId: 'chat-00001' });
    assert.equal(response.status, 202);
    const { turn } = await response.json();
    assert.equal(turn.status, 'queued');
    assert.equal(turn.answer, undefined);
    const snapshot = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${turn.id}.request.json`)));
    assert.equal(snapshot.kind, 'chat');
    assert.equal(snapshot.requirement.id, 'REQ-ONE');
    assert.equal(snapshot.chat.message, '¿Qué falta para QA?');
    assert.doesNotMatch(JSON.stringify(snapshot), /Otra historia|Otro cliente/);
    const duplicate = await post(`${base}/REQ-ONE/chat`, { message: '¿Qué falta para QA?', clientRequestId: 'chat-00001' }).then((r) => r.json());
    assert.equal(duplicate.turn.id, turn.id);
    assert.equal((await post(`${base}/REQ-ONE/chat`, { message: 'Otra pregunta', clientRequestId: 'chat-00002' })).status, 409);
    assert.equal((await post(`${base}/REQ-ONE/chat`, { message: 'x'.repeat(2001), clientRequestId: 'chat-00003' })).status, 400);
  });
});

test('chat captures a running enrichment and recorded answers without treating them as approval', async () => {
  await withWorkspace(async ({ base, post, dir, dataFile }) => {
    const store = new JsonStore(dataFile);
    await store.transaction((data) => {
      data.requirements[0].status = 'Enriqueciendo';
      data.requirementVersions = [{ id: 'RV-TEST', requirementId: 'REQ-ONE', version: 1, summary: 'Versión de prueba unitaria' }];
      data.requirementQuestions = [{ requirementId: 'REQ-ONE', versionId: 'RV-TEST', question: '¿Se permite offline?', answer: 'Pendiente de validación del PO', status: 'answered' }];
      data.enrichmentRuns = [{ id: 'ENR-TEST', requirementId: 'REQ-ONE', provider: 'hermes', status: 'running', phase: 'Revisión crítica', createdAt: new Date().toISOString() }];
    });
    const response = await post(`${base}/REQ-ONE/chat`, { message: '¿Ya terminó?', clientRequestId: 'running-chat-01' });
    assert.equal(response.status, 202);
    const { turn } = await response.json();
    const snapshot = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${turn.id}.request.json`)));
    assert.equal(snapshot.currentEnrichment.run.status, 'running');
    assert.equal(snapshot.currentEnrichment.questions[0].answer, 'Pendiente de validación del PO');
    assert.match(snapshot.currentEnrichment.questions[0].evidence, /no aprobación/);
    assert.equal(turn.answer, undefined);
  });
});

test('workspace rejects malformed JSON objects before creating comments or paid jobs', async () => {
  await withWorkspace(async ({ base, post }) => {
    for (const route of ['chat', 'discussion']) {
      for (const body of [null, []]) assert.equal((await post(`${base}/REQ-ONE/${route}`, body)).status, 400);
    }
  });
});

test('Azure attachments resolve only a synchronized work item linked to this requirement', async () => {
  await withWorkspace(async ({ base, post, dir }) => {
    const response = await fetch(`${base}/REQ-ONE/azure-attachments`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).workItem.id, 42);
    assert.equal((await fetch(`${base}/REQ-TWO/azure-attachments`).then((r) => r.json())).status, 'unlinked');
    const queued = await post(`${base}/REQ-ONE/azure-attachments`, {}).then((r) => r.json());
    assert.equal(queued.status, 'queued');
    const snapshot = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${queued.jobId}.request.json`)));
    assert.equal(snapshot.kind, 'azure-attachments');
    assert.equal(snapshot.workItem.organization, 'MobileappsAmerica');
    assert.equal(snapshot.workItem.id, 42);
  });
});

test('local attachment download is scoped to the requirement and forces a safe download', async () => {
  await withWorkspace(async ({ base }) => {
    const response = await fetch(`${base}/REQ-ONE/sources/SOURCE-FILE/download`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await response.text(), 'Nota sintética autorizada');
    assert.equal((await fetch(`${base}/REQ-TWO/sources/SOURCE-FILE/download`)).status, 404);
  });
});

test('chat answers persist privately and other users cannot inherit their conversation', async () => {
  await withWorkspace(async ({ dir, dataFile }) => {
    const workspace = new RequirementWorkspace(new JsonStore(dataFile), { enabled: true });
    const alice = { id: 'alice', name: 'Alice' }; const bob = { id: 'bob', name: 'Bob' };
    const { turn } = await workspace.queueChat('REQ-ONE', { message: 'Pregunta privada Alice', clientRequestId: 'alice-chat-01' }, alice);
    const bytes = await readFile(path.join(dir, 'enrichment-jobs', `${turn.id}.request.json`));
    await writeFile(path.join(dir, 'enrichment-jobs', `${turn.id}.result.json`), JSON.stringify({ runId: turn.id, kind: 'chat', status: 'completed', answer: 'Respuesta privada de prueba unitaria', toolsCount: 0, model: 'unit-test-fixture', inputHash: crypto.createHash('sha256').update(bytes).digest('hex') }));
    const own = await workspace.chat('REQ-ONE', alice);
    assert.equal(own.items[0].status, 'completed');
    assert.equal(own.items[0].answer, 'Respuesta privada de prueba unitaria');
    assert.equal((await workspace.chat('REQ-ONE', bob)).items.length, 0);
    const next = await workspace.queueChat('REQ-ONE', { message: 'Consulta Bob', clientRequestId: 'bob-chat-0001' }, bob);
    const snapshot = await readFile(path.join(dir, 'enrichment-jobs', `${next.turn.id}.request.json`), 'utf8');
    assert.doesNotMatch(snapshot, /Pregunta privada Alice|Respuesta privada/);
    await workspace.clearChat('REQ-ONE', alice);
    assert.equal((await workspace.chat('REQ-ONE', alice)).items.length, 0);
    assert.equal((await workspace.chat('REQ-ONE', bob)).items.length, 1);
  });
});

test('forged attachment metadata cannot download or enrich from another requirement directory', async () => {
  await withWorkspace(async ({ base, post, dir, dataFile }) => {
    await mkdir(path.join(dir, 'uploads', 'REQ-TWO'), { recursive: true });
    await writeFile(path.join(dir, 'uploads', 'REQ-TWO', 'private.txt'), 'OTHER-REQUIREMENT-PRIVATE');
    const data = JSON.parse(await readFile(dataFile));
    data.requirementSources.push({ id: 'FORGED-FILE', requirementId: 'REQ-ONE', type: 'file', name: 'private.txt', storageKey: 'REQ-ONE/../REQ-TWO/private.txt' });
    await writeFile(dataFile, JSON.stringify(data));
    assert.equal((await fetch(`${base}/REQ-ONE/sources/FORGED-FILE/download`)).status, 404);
    const { turn } = await post(`${base}/REQ-ONE/chat`, { message: '¿Qué fuentes hay?', clientRequestId: 'safe-chat-01' }).then((r) => r.json());
    const snapshot = await readFile(path.join(dir, 'enrichment-jobs', `${turn.id}.request.json`), 'utf8');
    assert.doesNotMatch(snapshot, /OTHER-REQUIREMENT-PRIVATE/);
  });
});

test('work item CRUD cannot forge or retarget trusted Azure attachment identities', async () => {
  await withWorkspace(async ({ base, post }) => {
    const root = base.replace(/\/requirements$/, '');
    assert.equal((await post(`${root}/workItems`, { title: 'Forged item', syncSource: 'azure-devops', azureId: 999, project: 'Other' })).status, 400);
    const response = await fetch(`${root}/workItems/ADO-42`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ azureId: 999, project: 'Other' }) });
    assert.equal(response.status, 400);
    assert.equal((await fetch(`${base}/REQ-ONE/azure-attachments`).then((r) => r.json())).workItem.id, 42);
  });
});
