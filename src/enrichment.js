import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile, rename, stat, realpath } from 'node:fs/promises';

const active = (run) => run.provider === 'hermes' && ['queued', 'running'].includes(run.status);
const id = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const fail = (status, message) => Object.assign(new Error(message), { status });
export const redact = (value, max = 12000) => String(value ?? '').slice(0, max)
  .replace(/((?:password|client_secret|session_secret|api[_-]?key|access_token|authorization)["']?\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
  .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');

export function validDraft(draft) {
  const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 12000;
  const list = (value) => Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every(text);
  return Boolean(draft && text(draft.summary)
    && text(draft.cp0?.businessNeed) && text(draft.cp0?.expectedOutcome)
    && ['inScope', 'outOfScope', 'actors', 'dependencies', 'risks'].every((key) => list(draft.cp0[key]))
    && text(draft.cp1?.userStory) && text(draft.cp1?.functionalNarrative)
    && ['rules', 'data', 'assumptions'].every((key) => list(draft.cp1[key]))
    && ['repositories', 'acceptanceCriteria', 'testScenarios', 'testData'].every((key) => list(draft[key]))
    && Array.isArray(draft.questions) && draft.questions.length > 0 && draft.questions.length <= 30
    && draft.questions.every((question) => ['role', 'question', 'suggestedAnswer', 'decisionRequired', 'impact'].every((key) => text(question[key])))
    && Array.isArray(draft.traceability) && draft.traceability.length > 0 && draft.traceability.length <= 40
    && draft.traceability.every((row) => ['requirement', 'risk', 'test', 'evidence'].every((key) => text(row[key])))
    && draft.cp2Readiness?.status === 'PENDIENTE' && list(draft.cp2Readiness.blockers));
}

export async function atomicJson(filename, payload) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(payload), { mode: 0o600 });
  await rename(temporary, filename);
}

export class EnrichmentService {
  constructor(store, options = {}) {
    this.store = store;
    this.enabled = options.enabled ?? process.env.ENRICHMENT_ENABLED === 'true';
    this.requireWorker = options.requireWorker ?? process.env.NODE_ENV === 'production';
    this.directory = path.join(path.dirname(store.dataFile), 'enrichment-jobs');
  }

  async snapshot(data, requirement) {
    const sources = [];
    let remaining = 24000;
    for (const source of data.requirementSources.filter((entry) => entry.requirementId === requirement.id).slice(0, 10)) {
      const item = { id: source.id, name: redact(source.name, 200), type: source.type, contentStatus: source.url ? 'PENDIENTE: URL no consultada' : 'PENDIENTE: archivo no extraído' };
      if (source.url) {
        try { const url = new URL(source.url); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; item.url = url.href; } catch { /* Metadata only. */ }
      }
      if (source.storageKey && /\.(txt|md|csv)$/i.test(source.name || '') && remaining > 0) {
        try {
          const base = await realpath(path.join(path.dirname(this.store.dataFile), 'uploads'));
          const requirementDirectory = await realpath(path.join(base, requirement.id));
          const file = await realpath(path.resolve(base, source.storageKey));
          if (!requirementDirectory.startsWith(`${base}${path.sep}`) || !file.startsWith(`${requirementDirectory}${path.sep}`) || !source.storageKey.startsWith(`${requirement.id}/`)) throw new Error('Invalid attachment path');
          const info = await stat(file);
          if (info.size > 50000 || !info.isFile()) throw new Error('Attachment too large');
          const text = await readFile(file, 'utf8');
          if (text.includes('\0')) throw new Error('Binary attachment');
          item.text = redact(text, Math.min(remaining, 12000));
          remaining -= item.text.length;
          item.contentStatus = text.length > item.text.length ? 'TEXTO PARCIAL: límite de contexto' : 'TEXTO EXTRAÍDO';
          item.sha256 = crypto.createHash('sha256').update(text).digest('hex');
        } catch { item.contentStatus = 'PENDIENTE: archivo no disponible o fuera de límites'; }
      }
      sources.push(item);
    }
    const repositories = data.repositories.filter((repo) => {
      try { return new URL(repo.remote).pathname.split('/').map(decodeURIComponent).some((part) => part.toLowerCase() === String(requirement.project).toLowerCase()); }
      catch { return false; }
    }).slice(0, 10).map((repo) => ({ name: redact(repo.name, 200), branch: redact(repo.canonicalBranch, 100), evidence: 'Solo registro de repositorio; código y commit NO inspeccionados' }));
    const approvedAnswers = data.requirementQuestions.filter((item) => item.requirementId === requirement.id && item.answerStatus === 'approved' && item.answer && item.answerHistory?.at(-1)?.action === 'approve' && item.answerHistory.at(-1).hash === crypto.createHash('sha256').update(item.answer).digest('hex')).slice(0, 10).map((item) => {
      const approval = item.answerHistory.at(-1);
      return { question: redact(item.question, 500), answer: redact(item.answer, 1500), contentStatus: item.answer.length > 1500 ? 'TEXTO PARCIAL: límite de contexto; consultar respuesta completa' : 'TEXTO COMPLETO', versionId: item.versionId || null, revision: item.answerRevision, approval: { at: approval.at, actor: redact(approval.actor.name, 150), hash: approval.hash, hashOf: 'Texto aprobado completo, no el extracto' }, evidence: 'Respuesta aprobada para esta pregunta y versión; no aprueba el requerimiento ni un CP. Validar compatibilidad si cambió el contexto.' };
    });
    return { schemaVersion: 1, requirement: { id: requirement.id, title: redact(requirement.title, 500), description: redact(requirement.description), project: redact(requirement.project, 200) }, sources, repositories, approvedAnswers,
      evidenceBoundary: 'Solo requerimiento, texto adjunto permitido y metadatos de su proyecto. Sin consultas ERP, sin acceso a otras memorias/clientes, sin URLs remotas, sin inspección de código. PDF, Office, imágenes y videos pendientes de extracción.' };
  }

  async assertReady() {
    if (!this.enabled) throw fail(503, 'El worker de Hermes no está habilitado. No se generaron resultados simulados.');
    if (this.requireWorker) {
      let heartbeat;
      try { heartbeat = JSON.parse(await readFile(path.join(this.directory, '.heartbeat.json'), 'utf8')); } catch { /* Fail closed. */ }
      if (!heartbeat?.ready || Date.now() / 1000 - heartbeat.lastSeen > 360) throw fail(503, 'El worker de Hermes no está disponible. Intenta más tarde; no se generaron resultados simulados.');
    }
  }

  async queue(requirementId, actor = 'Usuario del dashboard') {
    await this.assertReady();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return this.store.transaction(async (data) => {
      const requirement = data.requirements.find((entry) => entry.id === requirementId);
      if (!requirement) throw fail(404, 'Requirement not found');
      const existing = data.enrichmentRuns.find((run) => run.requirementId === requirementId && active(run));
      if (existing) return { run: existing };
      if (data.enrichmentRuns.filter(active).length >= 5) throw fail(429, 'Hay cinco enriquecimientos pendientes. Espera a que terminen.');
      const today = new Date().toISOString().slice(0, 10);
      if (data.enrichmentRuns.filter((run) => run.provider === 'hermes' && run.createdAt?.startsWith(today)).length >= 40) throw fail(429, 'Se alcanzó el límite diario de 40 enriquecimientos.');
      const now = new Date().toISOString();
      const run = { id: id('ENR'), requirementId, provider: 'hermes', mode: 'draft-only', status: 'queued', resultLabel: 'PENDIENTE', requestedBy: actor, createdAt: now, updatedAt: now };
      const snapshot = await this.snapshot(data, requirement);
      await atomicJson(path.join(this.directory, `${run.id}.request.json`), { ...snapshot, runId: run.id, createdAt: now });
      data.enrichmentRuns.unshift(run);
      requirement.status = 'Enriqueciendo';
      return { run };
    });
  }

  async refresh(requirementId) {
    return this.store.transaction(async (data) => {
      const requirement = data.requirements.find((entry) => entry.id === requirementId);
      if (!requirement) throw fail(404, 'Requirement not found');
      for (const run of data.enrichmentRuns.filter((entry) => entry.requirementId === requirementId && active(entry))) {
        if (!/^ENR-[A-F0-9]{12}$/.test(run.id)) continue;
        let result;
        try {
          const filename = path.join(this.directory, `${run.id}.result.json`);
          if ((await stat(filename)).size > 150000) throw new Error('Invalid worker result');
          result = JSON.parse(await readFile(filename, 'utf8'));
        } catch (error) {
          if (error.code === 'ENOENT' && Date.now() - Date.parse(run.createdAt) < 15 * 60 * 1000) {
            try {
              const progress = JSON.parse(await readFile(path.join(this.directory, `${run.id}.status.json`), 'utf8'));
              if (progress.runId === run.id && ['running', 'queued'].includes(progress.status)) {
                run.status = progress.status;
                run.phase = redact(progress.phase, 100);
              }
            } catch { /* Queued jobs survive worker restarts. */ }
            continue;
          }
          result = { status: 'failed' };
        }
        const now = new Date().toISOString();
        if (result.runId !== run.id || result.status !== 'completed' || !validDraft(result.draft)
          || result.toolsCount !== 0 || !Array.isArray(result.critic?.findings)) {
          Object.assign(run, { status: 'failed', resultLabel: 'ERROR', completedAt: now, error: 'Hermes no produjo un resultado válido o agotó el tiempo. Puedes reintentar; no se crearon artefactos simulados.' });
          requirement.status = 'Error de enriquecimiento';
          continue;
        }
        const requestBytes = await readFile(path.join(this.directory, `${run.id}.request.json`));
        if (crypto.createHash('sha256').update(requestBytes).digest('hex') !== result.inputHash) {
          Object.assign(run, { status: 'failed', resultLabel: 'ERROR', completedAt: now, error: 'No coincide la evidencia de entrada del worker. Requiere revisión técnica.' });
          requirement.status = 'Error de enriquecimiento';
          continue;
        }
        const request = JSON.parse(requestBytes);
        const draft = result.draft;
        const versionNumber = Math.max(0, ...data.requirementVersions.filter((entry) => entry.requirementId === requirementId).map((entry) => Number(entry.version) || 0)) + 1;
        const version = { ...draft, id: id('RV'), requirementId, version: versionNumber, status: 'draft', createdBy: 'Hermes / Ecosistema de IA', enrichmentRunId: run.id, createdAt: now,
          critic: result.critic, model: redact(result.model, 150), inputHash: result.inputHash,
          sources: request.sources, repositoriesContext: request.repositories, evidenceBoundary: request.evidenceBoundary,
          sourceChanged: redact(requirement.title, 500) !== request.requirement.title || redact(requirement.description) !== request.requirement.description || redact(requirement.project, 200) !== request.requirement.project };
        data.requirementVersions.unshift(version);
        for (const question of draft.questions) data.requirementQuestions.unshift({ ...question, id: id('RQ'), requirementId, versionId: version.id, status: 'open', answer: '', createdAt: now });
        const qaPackage = { id: id('QAP'), requirementId, versionId: version.id, status: 'pending', criteriaCount: draft.acceptanceCriteria.length, scenarioCount: draft.testScenarios.length, openQuestions: draft.questions.length, evidenceCount: 0, traceability: draft.traceability, createdAt: now };
        data.qaPackages.unshift(qaPackage);
        data.activities.unshift({ id: id('ACT'), initiativeId: requirement.initiativeId || 'REQ-FLOW', type: 'enrichment', message: `Hermes generó v${versionNumber} de ${requirementId}; propuesta y paquete QA pendientes de revisión humana.`, actor: 'Hermes', createdAt: now });
        Object.assign(run, { status: 'completed', resultLabel: 'PROPUESTO', completedAt: now, versionId: version.id, model: version.model, inputHash: result.inputHash, toolsCount: 0, phase: 'Revisión humana pendiente' });
        Object.assign(requirement, { status: version.sourceChanged ? 'Revisar fuente modificada' : 'Preguntas', currentVersionId: version.id, qaPackageId: qaPackage.id, updatedAt: now });
      }
      const run = data.enrichmentRuns.find((entry) => entry.requirementId === requirementId && entry.provider === 'hermes') || null;
      return { run, version: run?.versionId ? data.requirementVersions.find((entry) => entry.id === run.versionId) : null };
    });
  }

  async reconcile() {
    const data = await this.store.read();
    for (const requirementId of new Set(data.enrichmentRuns.filter(active).map((run) => run.requirementId))) await this.refresh(requirementId);
  }
}
