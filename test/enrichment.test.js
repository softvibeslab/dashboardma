import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.js';

async function app(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ma-enrichment-'));
  const dataFile = path.join(dir, 'state.json');
  await writeFile(dataFile, JSON.stringify({ requirements: [{ id: 'REQ-TEST', title: 'Guardar pedido', description: 'Como vendedor quiero guardar el pedido y recibir confirmación.', project: 'Mobile' }], requirementSources: [{ id: 'RSRC-TEST', requirementId: 'REQ-TEST', name: 'Teams', url: 'https://teams.microsoft.com/test', type: 'teams-url' }] }));
  const server = createServer({ dataFile, auth: { enabled: false }, enrichment: { enabled: true } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/api`;
  try { await fn({ base, dir, dataFile }); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}

test('real enrichment queues a durable job without fabricating completed artifacts', async () => {
  await app(async ({ base, dir, dataFile }) => {
    const res = await fetch(`${base}/requirements/REQ-TEST/enrich`, { method: 'POST' });
    assert.equal(res.status, 202);
    const { run } = await res.json();
    assert.equal(run.provider, 'hermes');
    assert.equal(run.status, 'queued');
    const data = JSON.parse(await readFile(dataFile));
    assert.equal(data.requirementVersions.length, 0);
    const request = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${run.id}.request.json`)));
    assert.equal(request.requirement.title, 'Guardar pedido');
    assert.equal(request.sources[0].contentStatus, 'PENDIENTE: URL no consultada');
    const duplicate = await fetch(`${base}/requirements/REQ-TEST/enrich`, { method: 'POST' }).then((r) => r.json());
    assert.equal(duplicate.run.id, run.id);
    assert.equal((await fetch(`${base}/requirements/REQ-NO/enrich`, { method: 'POST' })).status, 404);
  });
});

const draft = {
  summary: 'Propuesta de guardado', cp0: { businessNeed: 'Confirmar guardado', expectedOutcome: 'Evitar incertidumbre', inScope: ['Guardar'], outOfScope: ['Cobros'], actors: ['Vendedor'], dependencies: ['Backend pendiente'], risks: ['Duplicados'] },
  cp1: { userStory: 'Como vendedor quiero guardar para confirmar el pedido', functionalNarrative: 'Confirmar después de persistir', rules: ['No confirmar antes de persistir'], data: ['Pedido'], assumptions: ['Contrato pendiente'] },
  repositories: ['PENDIENTE: identificar repositorio'], acceptanceCriteria: ['Dado un pedido válido, cuando guardo, entonces recibo confirmación después de persistir'], testScenarios: ['Fallo de red no muestra éxito'], testData: ['Pedido válido'],
  questions: [{ role: 'Negocio', question: '¿Se permite guardar sin red?', suggestedAnswer: 'Pendiente confirmar', decisionRequired: 'PO', impact: 'Alcance offline' }],
  traceability: [{ requirement: 'Guardar', risk: 'Falso éxito', test: 'Fallo red', evidence: 'PENDIENTE: captura de ejecución' }], cp2Readiness: { status: 'PENDIENTE', blockers: ['Confirmar offline'] }
};

test('worker result becomes one version and pending QA package, with idempotent reconciliation', async () => {
  await app(async ({ base, dir, dataFile }) => {
    const { run } = await fetch(`${base}/requirements/REQ-TEST/enrich`, { method: 'POST' }).then((r) => r.json());
    const bytes = await readFile(path.join(dir, 'enrichment-jobs', `${run.id}.request.json`));
    const request = JSON.parse(bytes);
    await writeFile(path.join(dir, 'enrichment-jobs', `${run.id}.result.json`), JSON.stringify({ runId: run.id, status: 'completed', model: 'unit-test-fixture', provider: 'test', draft, critic: { status: 'needs_review', findings: ['Validación humana pendiente'] }, inputHash: crypto.createHash('sha256').update(bytes).digest('hex'), sources: request.sources, toolsCount: 0 }));
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/requirements/REQ-TEST/enrichment`);
      assert.equal(res.status, 200);
      const result = await res.json();
      assert.equal(result.run.status, 'completed');
      assert.equal(result.run.resultLabel, 'PROPUESTO');
    }
    const data = JSON.parse(await readFile(dataFile));
    assert.equal(data.requirementVersions.length, 1);
    assert.equal(data.requirementVersions[0].version, 1);
    assert.equal(data.requirementVersions[0].status, 'draft');
    assert.equal(data.requirementQuestions.length, 1);
    assert.equal(data.qaPackages[0].status, 'pending');
    assert.equal(data.requirementApprovals.length, 0);
    assert.equal(data.requirements[0].description, 'Como vendedor quiero guardar el pedido y recibir confirmación.');
    assert.equal(data.requirements[0].status, 'Preguntas');
  });
});

test('failed or invalid worker output cannot create successful artifacts', async () => {
  await app(async ({ base, dir, dataFile }) => {
    const { run } = await fetch(`${base}/requirements/REQ-TEST/enrich`, { method: 'POST' }).then((r) => r.json());
    await writeFile(path.join(dir, 'enrichment-jobs', `${run.id}.result.json`), JSON.stringify({ runId: run.id, status: 'completed', draft: { summary: 'Incomplete' } }));
    const result = await fetch(`${base}/requirements/REQ-TEST/enrichment`).then((r) => r.json());
    assert.equal(result.run.status, 'failed');
    assert.equal(result.run.resultLabel, 'ERROR');
    assert.equal(JSON.parse(await readFile(dataFile)).requirementVersions.length, 0);
  });
});

test('generated artifacts cannot be forged through collection CRUD', async () => {
  await app(async ({ base }) => {
    for (const collection of ['enrichmentRuns', 'requirementVersions', 'qaPackages']) {
      const response = await fetch(`${base}/${collection}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
      assert.equal(response.status, 405);
    }
  });
});
