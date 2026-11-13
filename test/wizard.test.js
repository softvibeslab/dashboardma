import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.js';
import crypto from 'node:crypto';
import { JsonStore } from '../src/store.js';
import { RequirementWorkspace } from '../src/workspace.js';
import { RequirementWizard } from '../src/wizard.js';

async function fixture(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wizard-'));
  const dataFile = path.join(dir, 'state.json');
  await writeFile(dataFile, JSON.stringify({ requirements: [{ id: 'R1', title: 'Requerimiento sintético', description: 'Persistir antes de confirmar' }, { id: 'R2', title: 'Sin enriquecimiento' }], requirementVersions: [{ id: 'V1', requirementId: 'R1', version: 1, summary: 'Fixture documental de prueba unitaria', cp1: { userStory: 'Como vendedor quiero guardar para confirmar' }, acceptanceCriteria: ['AC-01: confirmar después de persistir'], status: 'draft', model: 'unit-test-fixture' }] }));
  const server = createServer({ dataFile, auth: { enabled: false }, enrichment: { enabled: true } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/api/requirements`;
  const get = () => fetch(base + '/R1/wizard').then((r) => r.json());
  const post = (body, requirement = 'R1') => fetch(`${base}/${requirement}/wizard`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await run({ dir, dataFile, get, post, base }); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}

const owner = 'local-qa@example.test';
const configuration = { action: 'configure', versionId: 'V1', tracks: [{ technology: 'Kotlin / Android', area: 'Ventas', ownerEmail: owner }], qaEmail: owner, businessEmail: owner };
const sections = ['Alcance', 'Reglas', 'Datos', 'Integraciones', 'Seguridad', 'Criterios', 'Pruebas', 'Dependencias', 'Pendientes'];
const specText = '# Kotlin / Android · Ventas\nOrigen: V1. Responsable: ' + owner + '\n' + sections.map((section) => `## ${section}\nContenido sintético de prueba unitaria, referencia AC-01; pendiente de implementación.`).join('\n');

async function enterSpecs(get, post) {
  await post({ action: 'next', expectedRevision: (await get()).flow.revision });
  await post({ ...configuration, expectedRevision: (await get()).flow.revision });
  return post({ action: 'next', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
}

async function completeFixtureJob(dir, state, invalid = false) {
  const runId = state.flow.run.id;
  const bytes = await readFile(path.join(dir, 'enrichment-jobs', `${runId}.request.json`));
  await writeFile(path.join(dir, 'enrichment-jobs', `${runId}.result.json`), JSON.stringify({ runId, kind: 'wizard-specs', status: 'completed', specs: [{ trackId: invalid ? 'WRONG-TRACK' : state.flow.tracks[0].id, title: 'Spec sintética para prueba unitaria', content: specText }], inputHash: crypto.createHash('sha256').update(bytes).digest('hex'), model: 'unit-test-fixture', toolsCount: 0 }));
  return JSON.parse(bytes);
}

async function enterEvidence(get, post, dir) {
  await enterSpecs(get, post);
  const queued = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
  await completeFixtureJob(dir, queued);
  await post({ action: 'next', expectedRevision: (await get()).flow.revision });
  await post({ action: 'validate', expectedRevision: (await get()).flow.revision });
  return post({ action: 'next', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
}

test('guided stages require enriched origin and explicit technology-area ownership', async () => {
  await fixture(async ({ get, post }) => {
    let state = await get();
    assert.equal(state.flow.stage, 0);
    assert.equal(state.stages.length, 7);
    assert.equal((await post({ action: 'next', expectedRevision: 0 }, 'R2')).status, 409);
    state = await post({ action: 'next', expectedRevision: 0 }).then((r) => r.json());
    assert.equal(state.flow.stage, 1);
    assert.equal((await post({ action: 'next', expectedRevision: state.flow.revision })).status, 409);
    state = await post({ ...configuration, expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.tracks.length, 1);
    assert.equal(state.flow.tracks[0].ownerEmail, owner);
    assert.equal((await post({ action: 'next', expectedRevision: 0 })).status, 409);
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.stage, 2);
    assert.equal(state.megaPrompt, null);
    assert.equal((await post({ action: 'next', expectedRevision: state.flow.revision })).status, 409);
  });
});

test('specs are queued without fake documents and document validation is a separate gate', async () => {
  await fixture(async ({ get, post, dir }) => {
    await enterSpecs(get, post);
    let state = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    assert.equal(state.flow.run.status, 'queued');
    assert.equal(state.flow.artifact, null);
    const snapshot = await completeFixtureJob(dir, state);
    assert.equal(snapshot.kind, 'wizard-specs');
    assert.equal(snapshot.wizard.version.id, 'V1');
    state = await get();
    assert.equal(state.flow.artifact.specs.length, 1);
    assert.equal(state.flow.validation, null);
    assert.equal(state.megaPrompt, null);
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.stage, 3);
    assert.equal((await post({ action: 'next', expectedRevision: state.flow.revision })).status, 409);
    state = await post({ action: 'validate', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.validation.passed, true);
    assert.match(state.flow.validation.scope, /documental/i);
    assert.equal(state.flow.tests.length, 0);
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.stage, 4);
    assert.equal((await post({ action: 'next', expectedRevision: state.flow.revision })).status, 409);
  });
});

test('changing the enriched source cannot bypass unanswered-question gates', async () => {
  await fixture(async ({ get, post, dataFile }) => {
    const data = JSON.parse(await readFile(dataFile));
    data.requirementVersions.push({ id: 'V2', requirementId: 'R1', version: 2, summary: 'Otra versión de prueba unitaria' });
    data.requirementQuestions = [{ id: 'Q-V2', requirementId: 'R1', versionId: 'V2', question: 'Decisión pendiente', status: 'open' }];
    await writeFile(dataFile, JSON.stringify(data));
    await post({ action: 'configure', versionId: 'V1', tracks: [], expectedRevision: 0 });
    await post({ action: 'next', expectedRevision: (await get()).flow.revision });
    await post({ ...configuration, versionId: 'V2', expectedRevision: (await get()).flow.revision });
    const response = await post({ action: 'next', expectedRevision: (await get()).flow.revision });
    assert.equal(response.status, 409);
    assert.equal((await get()).flow.stage, 1);
  });
});

test('completed unvisited wizard jobs do not exhaust unrelated generation capacity', async () => {
  await fixture(async ({ post, dir, dataFile, base }) => {
    await writeFile(dataFile, JSON.stringify({ requirements: Array.from({ length: 6 }, (_, i) => ({ id: `R${i + 1}`, title: 'Fixture de capacidad' })), requirementVersions: Array.from({ length: 6 }, (_, i) => ({ id: `V${i + 1}`, requirementId: `R${i + 1}`, version: 1, summary: 'Fixture documental de capacidad' })) }));
    for (let i = 1; i <= 6; i++) {
      const requirement = `R${i}`;
      const read = () => fetch(`${base}/${requirement}/wizard`).then((r) => r.json());
      await post({ action: 'next', expectedRevision: 0 }, requirement);
      await post({ ...configuration, versionId: `V${i}`, expectedRevision: (await read()).flow.revision }, requirement);
      await post({ action: 'next', expectedRevision: (await read()).flow.revision }, requirement);
      const response = await post({ action: 'generate', expectedRevision: (await read()).flow.revision }, requirement);
      assert.equal(response.status, 200);
      const queued = await response.json();
      if (i < 6) await completeFixtureJob(dir, queued);
    }
  });
});

test('terminal wizard job retention preserves other queue kinds and durable artifact metadata', async () => {
  await fixture(async ({ get, post, dir, dataFile }) => {
    await enterSpecs(get, post);
    const queued = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    await completeFixtureJob(dir, queued);
    await get();
    const file = path.join(dir, 'requirement-wizards.json');
    const state = JSON.parse(await readFile(file));
    assert.equal(state.jobs[0].status, 'completed');
    state.jobs[0].createdAt = '2000-01-01T00:00:00.000Z';
    state.jobs[0].finishedAt = state.jobs[0].createdAt;
    await writeFile(file, JSON.stringify(state));
    const foreign = path.join(dir, 'enrichment-jobs', 'ENR-AAAAAAAAAAAA.request.json');
    await writeFile(foreign, JSON.stringify({ kind: 'chat', runId: 'ENR-AAAAAAAAAAAA' }));
    const store = new JsonStore(dataFile);
    const wizard = new RequirementWizard(store, new RequirementWorkspace(store, { enabled: true }));
    await wizard.cleanupJobs(true);
    await assert.rejects(readFile(path.join(dir, 'enrichment-jobs', `${queued.flow.run.id}.request.json`)), { code: 'ENOENT' });
    assert.equal(JSON.parse(await readFile(foreign)).kind, 'chat');
    assert.equal((await get()).flow.artifact.specs.length, 1);
  });
});

test('all selected-version approvals reach the generator without older-version displacement', async () => {
  await fixture(async ({ get, post, dir, dataFile }) => {
    const data = JSON.parse(await readFile(dataFile));
    const questions = (versionId, prefix, count) => Array.from({ length: count }, (_, i) => {
      const answer = `${prefix} respuesta de fixture ${i}`;
      return { id: `${prefix}-${i}`, requirementId: 'R1', versionId, question: `${prefix} pregunta ${i}`, answer, answerStatus: 'approved', answerRevision: 1, answerHistory: [{ action: 'approve', hash: crypto.createHash('sha256').update(answer).digest('hex'), actor: { name: 'QA sintético' }, at: '2026-01-01T00:00:00Z' }] };
    });
    data.requirementQuestions = [...questions('V0', 'ANTIGUA', 10), ...questions('V1', 'SELECCIONADA', 12)];
    await writeFile(dataFile, JSON.stringify(data));
    await enterSpecs(get, post);
    const queued = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    const snapshot = JSON.parse(await readFile(path.join(dir, 'enrichment-jobs', `${queued.flow.run.id}.request.json`)));
    assert.equal(snapshot.approvedAnswers.length, 12);
    assert.ok(snapshot.approvedAnswers.every((item) => item.versionId === 'V1'));
    assert.doesNotMatch(JSON.stringify(snapshot), /ANTIGUA respuesta/);
  });
});

test('invalid track results never become successful specs', async () => {
  await fixture(async ({ get, post, dir }) => {
    await enterSpecs(get, post);
    const queued = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    await completeFixtureJob(dir, queued, true);
    const state = await get();
    assert.equal(state.flow.run.status, 'failed');
    assert.equal(state.flow.artifact, null);
    assert.equal(state.megaPrompt, null);
  });
});

test('only assigned session emails can sign and payload identity cannot impersonate another owner', async () => {
  await fixture(async ({ get, post, dir }) => {
    await post({ action: 'next', expectedRevision: 0 });
    await post({ ...configuration, businessEmail: 'other@example.test', expectedRevision: (await get()).flow.revision });
    await post({ action: 'next', expectedRevision: (await get()).flow.revision });
    let state = await post({ action: 'generate', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    await completeFixtureJob(dir, state);
    await post({ action: 'next', expectedRevision: (await get()).flow.revision });
    await post({ action: 'validate', expectedRevision: (await get()).flow.revision });
    state = await post({ action: 'next', expectedRevision: (await get()).flow.revision }).then((r) => r.json());
    state = await post({ action: 'test', expectedRevision: state.flow.revision, trackId: state.flow.tracks[0].id, criterion: 'AC-01', risk: 'Riesgo de prueba', steps: 'Paso sintético', expected: 'Resultado previsto', actual: 'Resultado reportado sintético', outcome: 'passed', attest: true, evidenceUrl: 'https://example.test/evidence' }).then((r) => r.json());
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.canSignRoles.some((role) => role.roleId === 'business'), false);
    assert.equal((await post({ action: 'sign', expectedRevision: state.flow.revision, roleId: 'business', decision: 'approve', packageHash: state.packageHash, email: 'other@example.test' })).status, 403);
    assert.equal((await get()).flow.signatures.length, 0);
  });
});

test('reported tests and all assigned signatures bind the reviewed package before final export', async () => {
  await fixture(async ({ get, post, dir, base }) => {
    let state = await enterEvidence(get, post, dir);
    const testRecord = { action: 'test', trackId: state.flow.tracks[0].id, criterion: 'AC-01', risk: 'Confirmación sin persistir', steps: 'Simular fallo de guardado', expected: 'No confirmar', actual: 'No confirmó en este caso sintético de prueba unitaria', outcome: 'passed', evidenceUrl: 'https://example.test/evidence/one', attest: true };
    assert.equal((await post({ ...testRecord, attest: false, expectedRevision: state.flow.revision })).status, 400);
    assert.equal((await post({ ...testRecord, evidenceUrl: 'javascript:alert(1)', expectedRevision: state.flow.revision })).status, 400);
    state = await post({ ...testRecord, expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.tests[0].reportedBy.email, owner);
    assert.match(state.flow.tests[0].scope, /declarad|reportad/i);
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.stage, 5);
    assert.equal((await post({ action: 'next', expectedRevision: state.flow.revision })).status, 409);
    assert.equal((await fetch(base + '/R1/wizard/export')).status, 409);
    assert.equal((await post({ action: 'sign', roleId: 'qa', decision: 'approve', packageHash: 'wrong', expectedRevision: state.flow.revision })).status, 409);
    const reviewedHash = state.packageHash;
    for (const role of state.canSignRoles) {
      state = await post({ action: 'sign', roleId: role.roleId, decision: 'approve', packageHash: reviewedHash, expectedRevision: state.flow.revision, email: 'forged@example.test', name: 'Forged' }).then((r) => r.json());
      assert.equal(state.flow.signatures.at(-1).email, owner);
      assert.notEqual(state.flow.signatures.at(-1).name, 'Forged');
    }
    const savedPackage = state.flow.reviewPackages.find((item) => item.hash === reviewedHash);
    assert.equal(savedPackage.snapshot.roles.length, 3);
    assert.equal(savedPackage.snapshot.artifact.specs.length, 1);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(savedPackage.snapshot)).digest('hex'), reviewedHash);
    state = await post({ action: 'next', expectedRevision: state.flow.revision }).then((r) => r.json());
    assert.equal(state.flow.stage, 6);
    assert.match(state.megaPrompt, /Kotlin \/ Android/);
    assert.match(state.megaPrompt, /Ventas/);
    assert.ok(state.megaPrompt.includes(reviewedHash));
    assert.equal(state.megaPromptValidation.passed, true);
    const exported = await fetch(base + '/R1/wizard/export');
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition'), /attachment/);
    assert.equal(await exported.text(), state.megaPrompt);
    const response = await fetch(base + '/R1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'Contexto modificado después de la revisión' }) });
    assert.equal(response.status, 200);
    state = await get();
    assert.equal(state.megaPrompt, null);
    assert.equal((await fetch(base + '/R1/wizard/export')).status, 409);
    assert.equal(state.flow.signatures.length, 3);
  });
});
