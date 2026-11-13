import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { JsonStore } from './store.js';
import { EnrichmentService, atomicJson, redact } from './enrichment.js';

const error = (status, message) => Object.assign(new Error(message), { status });
const newId = () => `ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const pending = (job) => ['queued', 'running'].includes(job.status);
const ownerKey = (actor) => crypto.createHash('sha256').update(String(actor.id)).digest('hex');
const plain = (value, maximum) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw error(400, `El texto es obligatorio y admite hasta ${maximum} caracteres.`);
  return redact(value.trim(), maximum);
};
const requestId = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw error(400, 'clientRequestId inválido.');
  return value;
};
const publicTurn = (turn) => Object.fromEntries(['id', 'requirementId', 'message', 'answer', 'status', 'createdAt', 'model', 'contextVersion', 'error', 'phase'].filter((key) => turn[key] !== undefined).map((key) => [key, turn[key]]));

class WorkspaceStore extends JsonStore {
  async read() {
    let data;
    try { data = JSON.parse(await readFile(this.dataFile, 'utf8')); }
    catch (failure) { if (failure.code !== 'ENOENT') throw failure; data = {}; }
    return { ...data, meta: data.meta || {}, chats: data.chats || [], comments: data.comments || [], azureJobs: data.azureJobs || [], usage: data.usage || {} };
  }
}

export class RequirementWorkspace extends EnrichmentService {
  constructor(store, options = {}) {
    super(store, options);
    this.workspace = new WorkspaceStore(path.join(path.dirname(store.dataFile), 'requirement-workspace.json'));
  }

  async context(requirementId) {
    const data = await this.store.read();
    const requirement = data.requirements.find((item) => item.id === requirementId);
    if (!requirement) throw error(404, 'Requirement not found');
    const version = [...data.requirementVersions.filter((item) => item.requirementId === requirementId)].sort((a, b) => Number(b.version) - Number(a.version))[0];
    return { data, requirement, version };
  }

  async discussion(requirementId) {
    await this.context(requirementId);
    const items = (await this.workspace.read()).comments.filter((item) => item.requirementId === requirementId);
    return { items: items.slice(-100).map(({ owner, clientRequestId, ...item }) => item), hasMore: items.length > 100 };
  }

  async addComment(requirementId, payload, actor) {
    await this.context(requirementId);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error(400, 'Se esperaba un objeto JSON.');
    const message = plain(payload.message, 4000); const clientRequestId = requestId(payload.clientRequestId); const owner = ownerKey(actor);
    return this.workspace.transaction((data) => {
      const duplicate = data.comments.find((item) => item.requirementId === requirementId && item.owner === owner && item.clientRequestId === clientRequestId);
      if (duplicate) {
        if (duplicate.message !== message) throw error(409, 'Ese identificador ya se usó para otro comentario.');
        const { owner: ignoredOwner, clientRequestId: ignoredRequest, ...item } = duplicate;
        return { item };
      }
      if (payload.parentId && !data.comments.some((item) => item.id === payload.parentId && item.requirementId === requirementId)) throw error(400, 'El comentario al que respondes no pertenece al requerimiento.');
      if (data.comments.filter((item) => item.owner === owner && Date.now() - Date.parse(item.createdAt) < 60000).length >= 20) throw error(429, 'Espera un minuto antes de publicar más comentarios.');
      if (data.comments.filter((item) => item.requirementId === requirementId).length >= 500 || data.comments.length >= 5000) throw error(429, 'Se alcanzó el límite de comentarios del piloto.');
      const item = { id: `DISC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`, requirementId, message, authorName: redact(actor.name || 'Usuario del dashboard', 150), createdAt: new Date().toISOString(), ...(payload.parentId ? { parentId: payload.parentId } : {}) };
      data.comments.push({ ...item, owner, clientRequestId });
      return { item };
    });
  }

  async chat(requirementId, actor) {
    const { requirement, version } = await this.context(requirementId);
    await this.reconcileWorkspace();
    const owner = ownerKey(actor);
    const items = (await this.workspace.read()).chats.filter((item) => item.requirementId === requirementId && item.owner === owner).slice(-40).map(publicTurn);
    return { items, context: { requirementId, title: requirement.title, version: version?.version || null, status: requirement.status || 'Nuevo' } };
  }

  async queueChat(requirementId, payload, actor, answerAssistance = null) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error(400, 'Se esperaba un objeto JSON.');
    const message = plain(payload.message, 2000); const clientRequestId = requestId(payload.clientRequestId); const owner = ownerKey(actor);
    const { data: projectData, requirement, version } = await this.context(requirementId);
    await this.assertReady();
    await this.reconcileWorkspace();
    const response = await this.workspace.transaction(async (data) => {
      const own = data.chats.filter((item) => item.requirementId === requirementId && item.owner === owner);
      const duplicate = own.find((item) => item.clientRequestId === clientRequestId);
      if (duplicate) {
        if (duplicate.message !== message) throw error(409, 'Ese identificador ya se usó para otra pregunta.');
        return { turn: publicTurn(duplicate) };
      }
      if (own.some(pending)) throw error(409, 'Hermes todavía está respondiendo en este requerimiento.');
      if (data.chats.filter(pending).length >= 5 || data.chats.length >= 1000) throw error(429, 'La capacidad del chat está ocupada. Espera o limpia un historial terminado.');
      const day = new Date().toISOString().slice(0, 10);
      const usage = data.usage[day] ||= { chatTotal: 0, chatOwners: {}, azureTotal: 0 };
      if (usage.chatTotal >= 200 || (usage.chatOwners[owner] || 0) >= 40) throw error(429, 'Se alcanzó el límite diario del chat.');
      usage.chatTotal++; usage.chatOwners[owner] = (usage.chatOwners[owner] || 0) + 1;
      for (const previous of Object.keys(data.usage).sort().slice(0, -3)) delete data.usage[previous];
      const now = new Date().toISOString();
      const turn = { id: newId(), requirementId, owner, clientRequestId, message, status: 'queued', createdAt: now, contextVersion: version?.version || null };
      const snapshot = await this.snapshot(projectData, requirement);
      snapshot.kind = 'chat';
      if (answerAssistance) snapshot.answerAssistance = Object.fromEntries(Object.entries(answerAssistance).map(([key, value]) => [key, redact(value, 8000)]));
      snapshot.currentEnrichment = { status: requirement.status, version: version?.version || null, summary: redact(version?.summary, 3500), userStory: redact(version?.cp1?.userStory, 2000), criteria: (version?.acceptanceCriteria || []).slice(0, 8).map((item) => redact(item, 600)), questions: (version?.questions || []).slice(0, 8).map((item) => redact(item.question, 400)), critic: (version?.critic?.findings || []).slice(0, 8).map((item) => redact(item, 400)) };
      const run = projectData.enrichmentRuns.find((item) => item.requirementId === requirementId);
      if (run) snapshot.currentEnrichment.run = { id: run.id, status: run.status, phase: redact(run.phase, 200) };
      const questions = projectData.requirementQuestions.filter((item) => item.requirementId === requirementId && (!version || item.versionId === version.id));
      if (questions.length) snapshot.currentEnrichment.questions = questions.slice(0, 8).map((item) => ({ question: redact(item.question, 400), answer: redact(item.answer, 600), status: redact(item.status, 50), evidence: 'Respuesta registrada, no aprobación del requerimiento' }));
      snapshot.chat = { message, history: own.filter((item) => item.status === 'completed').slice(-6).map((item) => ({ question: redact(item.message, 1000), answer: redact(item.answer, 1800) })) };
      snapshot.discussion = data.comments.filter((item) => item.requirementId === requirementId).slice(-6).map((item) => ({ message: redact(item.message, 1200), author: item.authorName, status: 'Comentario del equipo, no aprobación' }));
      snapshot.runId = turn.id; snapshot.createdAt = now;
      const remove = new Set(own.filter((item) => !pending(item)).slice(0, Math.max(0, own.length - 39)).map((item) => item.id));
      data.chats = data.chats.filter((item) => !remove.has(item.id));
      data.chats.push(turn);
      return { turn: publicTurn(turn), request: snapshot };
    });
    if (response.request) {
      try { await this.publish(response.request); }
      catch { await this.workspace.transaction((data) => { Object.assign(data.chats.find((item) => item.id === response.turn.id), { status: 'failed', error: 'No se pudo publicar la pregunta. Intenta con una solicitud nueva.' }); }); throw error(503, 'No se pudo encolar la pregunta de Hermes.'); }
    }
    return { turn: response.turn };
  }

  async clearChat(requirementId, actor) {
    await this.context(requirementId);
    const owner = ownerKey(actor);
    const removed = await this.workspace.transaction((data) => {
      const own = data.chats.filter((item) => item.requirementId === requirementId && item.owner === owner);
      if (own.some(pending)) throw error(409, 'Espera a que termine la respuesta antes de limpiar el historial.');
      data.chats = data.chats.filter((item) => item.requirementId !== requirementId || item.owner !== owner);
      return own.map((item) => item.id);
    });
    for (const jobId of removed) for (const suffix of ['request', 'result', 'status']) await unlink(path.join(this.directory, `${jobId}.${suffix}.json`)).catch(() => {});
    return { ok: true };
  }

  linkedWorkItem(data, requirementId) {
    const links = data.requirementSources.filter((item) => item.requirementId === requirementId && item.url).map((item) => {
      try { const url = new URL(item.url); if (url.protocol !== 'https:' || url.hostname !== 'dev.azure.com' || url.username || url.password) return ''; return decodeURIComponent(url.pathname).replace(/\/$/, ''); }
      catch { return ''; }
    });
    const matches = data.workItems.filter((item) => item.syncSource === 'azure-devops' && Number.isSafeInteger(Number(item.azureId)) && Number(item.azureId) > 0
      && links.includes(`/MobileappsAmerica/${item.project}/_workitems/edit/${item.azureId}`));
    if (matches.length !== 1) return null;
    const item = matches[0];
    return { organization: 'MobileappsAmerica', id: Number(item.azureId), project: item.project, url: `https://dev.azure.com/MobileappsAmerica/${encodeURIComponent(item.project)}/_workitems/edit/${item.azureId}` };
  }

  async azureAttachments(requirementId) {
    const { data } = await this.context(requirementId);
    const workItem = this.linkedWorkItem(data, requirementId);
    if (!workItem) return { status: 'unlinked', workItem: null, items: [], error: 'Asocia una única URL de ticket del backlog sincronizado. Los archivos cargados aquí no se suben a Azure.' };
    await this.reconcileWorkspace();
    const job = (await this.workspace.read()).azureJobs.filter((item) => item.requirementId === requirementId && item.workItem.id === workItem.id && item.workItem.project === workItem.project).at(-1);
    return { status: job?.status || 'not_loaded', workItem, items: job?.items || [], fetchedAt: job?.fetchedAt, error: job?.error, jobId: job?.id, truncated: job?.truncated || false, total: job?.total };
  }

  async queueAzureAttachments(requirementId) {
    const current = await this.azureAttachments(requirementId);
    if (!current.workItem) throw error(409, current.error);
    await this.assertReady();
    const response = await this.workspace.transaction((data) => {
      const previous = data.azureJobs.filter((item) => item.requirementId === requirementId && item.workItem.id === current.workItem.id && item.workItem.project === current.workItem.project).at(-1);
      if (previous && (pending(previous) || Date.now() - Date.parse(previous.createdAt) < 60000)) return { ...current, jobId: previous.id };
      if (data.azureJobs.filter(pending).length >= 5) throw error(429, 'Hay consultas de adjuntos pendientes. Espera un momento.');
      const day = new Date().toISOString().slice(0, 10);
      const usage = data.usage[day] ||= { chatTotal: 0, chatOwners: {}, azureTotal: 0 };
      if (usage.azureTotal >= 400) throw error(429, 'Se alcanzó el límite diario de consultas de adjuntos.');
      usage.azureTotal++;
      const now = new Date().toISOString();
      const job = { id: newId(), requirementId, workItem: current.workItem, status: 'queued', createdAt: now };
      data.azureJobs = data.azureJobs.filter((item) => pending(item) || Date.now() - Date.parse(item.createdAt) < 30 * 86400000).slice(-399);
      data.azureJobs.push(job);
      return { status: 'queued', workItem: current.workItem, items: [], jobId: job.id, request: { kind: 'azure-attachments', schemaVersion: 1, runId: job.id, createdAt: now, workItem: current.workItem } };
    });
    if (response.request) {
      try { await this.publish(response.request); }
      catch {
        await this.workspace.transaction((data) => { Object.assign(data.azureJobs.find((item) => item.id === response.jobId), { status: 'failed', error: 'No se pudo encolar la consulta de adjuntos.' }); });
        throw error(503, 'No se pudo encolar la consulta de adjuntos.');
      }
    }
    const { request, ...publicResult } = response;
    return publicResult;
  }

  async publish(request) {
    const bytes = JSON.stringify(request);
    if (Buffer.byteLength(bytes) > 100000) throw error(413, 'El contexto excede el límite del worker.');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await atomicJson(path.join(this.directory, `${request.runId}.request.json`), request);
  }

  async outcome(job) {
    if (!/^ENR-[A-F0-9]{12}$/.test(job.id)) return { status: 'failed' };
    try {
      const file = path.join(this.directory, `${job.id}.result.json`);
      if ((await stat(file)).size > 150000) return { status: 'failed' };
      const result = JSON.parse(await readFile(file, 'utf8'));
      if (result.runId !== job.id || result.status !== 'completed') return { status: 'failed', errorCode: result.errorCode };
      const request = await readFile(path.join(this.directory, `${job.id}.request.json`));
      if (result.inputHash !== crypto.createHash('sha256').update(request).digest('hex')) return { status: 'failed' };
      return result;
    } catch (failure) {
      if (failure.code !== 'ENOENT' || Date.now() - Date.parse(job.createdAt) > 15 * 60000) return { status: 'failed' };
      try { const value = JSON.parse(await readFile(path.join(this.directory, `${job.id}.status.json`), 'utf8')); if (value.runId === job.id && value.status === 'running') job.status = 'running'; } catch { /* Still queued. */ }
      return null;
    }
  }

  async reconcileWorkspace() {
    const current = await this.workspace.read();
    if (![...current.chats, ...current.azureJobs].some(pending)) return;
    await this.workspace.transaction(async (data) => {
      for (const turn of data.chats.filter(pending)) {
        const result = await this.outcome(turn);
        if (!result) continue;
        if (result.status === 'completed' && result.kind === 'chat' && result.toolsCount === 0 && typeof result.answer === 'string' && result.answer.trim() && result.answer.length <= 8000) Object.assign(turn, { status: 'completed', answer: redact(result.answer, 8000), model: redact(result.model, 150) });
        else Object.assign(turn, { status: 'failed', error: 'Hermes no completó una respuesta válida. Puedes enviar una pregunta nueva.' });
      }
      for (const job of data.azureJobs.filter(pending)) {
        const result = await this.outcome(job);
        if (!result) continue;
        const safe = (item) => {
          try { const url = new URL(item.url); return typeof item.name === 'string' && item.name.length <= 250 && url.protocol === 'https:' && url.hostname === 'dev.azure.com' && !url.username && !url.password && /^\/MobileappsAmerica\/_apis\/wit\/attachments\/[a-f0-9-]{36}$/i.test(url.pathname); }
          catch { return false; }
        };
        if (result.status === 'completed' && result.kind === 'azure-attachments' && Array.isArray(result.items) && result.items.length <= 100 && result.items.every(safe)) Object.assign(job, { status: 'completed', items: result.items, fetchedAt: result.fetchedAt, truncated: result.truncated === true, total: result.total });
        else Object.assign(job, { status: 'failed', error: ['AZURE_HTTP_401', 'AZURE_HTTP_403'].includes(result.errorCode) ? 'Azure no autorizó la lectura de adjuntos. Revisa el acceso del conector.' : 'No se pudieron consultar los adjuntos de Azure. Abre el ticket original o vuelve a intentar.' });
      }
    });
  }
}
