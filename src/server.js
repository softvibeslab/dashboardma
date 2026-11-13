import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAuthConfig, getSession, handleAuthRoute, isAuthRoute, requireAuth } from './auth.js';
import { EnrichmentService } from './enrichment.js';
import { RequirementWorkspace } from './workspace.js';
import { AnswerService } from './answers.js';
import { RequirementWizard } from './wizard.js';
import { TechnologySuggestion } from './technology-suggestion.js';
import { importAzureRequirement } from './azure-import.js';
import { buildCapacity, buildModuleSlice, buildSummary, buildSyncHistory, buildTraceabilityDetails, COLLECTIONS, JsonStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export function createServer({ dataFile = path.join(root, 'data', 'state.json'), staticDir = path.join(root, 'public'), auth = {}, enrichment = {} } = {}) {
  const store = new JsonStore(dataFile);
  const authConfig = buildAuthConfig(process.env, auth);
  const enrichmentService = new EnrichmentService(store, enrichment);
  const workspace = new RequirementWorkspace(store, enrichment);
  const answers = new AnswerService(store, workspace);
  const wizard = new RequirementWizard(store, workspace);
  const technologySuggestion = new TechnologySuggestion(wizard, workspace);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (isAuthRoute(url.pathname)) return handleAuthRoute(req, res, url, authConfig, sendJson);
      if (!requireAuth(req, res, url, authConfig, sendJson)) return;
      const apiPath = url.pathname.startsWith('/dashboard/api/') ? url.pathname.replace('/dashboard/api', '/api') : url.pathname;

      if (apiPath === '/api/health') return sendJson(res, 200, { ok: true, service: 'mobilityapps-control-tower', version: '0.2.0-requirements-mvp' });
      if (apiPath === '/api/summary') return sendJson(res, 200, buildSummary(await store.read()));
      const moduleMatch = apiPath.match(/^\/api\/modules\/([^/]+)$/);
      if (req.method === 'GET' && moduleMatch) return sendJson(res, 200, buildModuleSlice(await store.read(), moduleMatch[1]));
      if (req.method === 'GET' && apiPath === '/api/traceability') return sendJson(res, 200, { items: buildTraceabilityDetails(await store.read()) });
      if (req.method === 'GET' && apiPath === '/api/capacity') return sendJson(res, 200, buildCapacity(await store.read()));
      if (req.method === 'GET' && apiPath === '/api/sync-history') return sendJson(res, 200, { items: buildSyncHistory(await store.read()) });

      if (apiPath === '/api/azure/work-items' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 20);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
          return sendJson(res, 400, { error: 'limit debe ser de 1 a 50 y offset un entero no negativo.' });
        }
        const data = await store.read();
        const all = data.workItems.filter((item) => item.syncSource === 'azure-devops');
        const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const terms = normalize(url.searchParams.get('q')).trim().split(/\s+/).filter(Boolean);
        const project = url.searchParams.get('project');
        const state = url.searchParams.get('state');
        const matches = all.filter((item) => (!project || item.project === project) && (!state || item.state === state)
          && terms.every((term) => normalize([item.id, item.azureId, item.title, item.project, item.assignedTo, item.type, item.state, item.tags].join(' ')).includes(term)));
        return sendJson(res, 200, {
          source: 'azure-sync', syncedAt: data.meta?.azureSync?.syncedAt || null,
          projects: [...new Set(all.map((item) => item.project).filter(Boolean))].sort(),
          states: [...new Set(all.map((item) => item.state).filter(Boolean))].sort(),
          items: matches.slice(offset, offset + limit), total: matches.length, offset, limit, hasMore: offset + limit < matches.length
        });
      }

      if (apiPath === '/api/azure/users' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) return sendJson(res, 400, { error: 'limit debe ser de 1 a 100.' });
        const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const project = url.searchParams.get('project')?.trim() || '';
        const area = normalize(url.searchParams.get('area'));
        const query = normalize(url.searchParams.get('q'));
        const data = await store.read();
        const source = data.users.filter(user => user.syncSource === 'azure-devops' && user.azureIdentityKey && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email || ''));
        const projectUsers = source.filter(user => !project || user.projects?.includes(project));
        const areaMatches = user => (user.areas || []).some(value => normalize(value) === area || normalize(value).endsWith(`\\${area}`) || normalize(value).endsWith(`/${area}`))
          || normalize(user.team) === area || user.projects?.some(value => normalize(value) === area);
        const areaUsers = area ? projectUsers.filter(areaMatches) : projectUsers;
        const candidates = area && !areaUsers.length ? projectUsers : areaUsers;
        const items = candidates.filter(user => !query || normalize([user.name, user.email, user.team, ...(user.projects || []), ...(user.areas || [])].join(' ')).includes(query))
          .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)))
          .slice(0, limit)
          .map(user => ({ id: user.id, name: user.name, email: user.email, team: user.team, projects: user.projects || [], areas: user.areas || [] }));
        return sendJson(res, 200, { source: 'azure-sync', syncedAt: data.meta?.azureSync?.syncedAt || null, project, area: url.searchParams.get('area') || '', areaMatched: !area || Boolean(areaUsers.length), items });
      }

      if (apiPath === '/api/requirements/import-azure') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const session = getSession(req, authConfig);
        if (process.env.NODE_ENV === 'production' && !session) return sendJson(res, 401, { error: 'Inicia sesión para agregar un requerimiento.' });
        const result = await importAzureRequirement(store, await readJson(req), session?.email || session?.name || 'Usuario local QA');
        return sendJson(res, result.created ? 201 : 200, result);
      }

      const technologyMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/technology-suggestion$/);
      if (technologyMatch) {
        const session = getSession(req, authConfig);
        if (process.env.NODE_ENV === 'production' && !session) return sendJson(res, 401, { error: 'Inicia sesión para consultar a Hermes.' });
        const actor = { id: session ? `${session.tid || ''}:${session.oid || session.email}` : 'local-qa' };
        const id = decodeURIComponent(technologyMatch[1]);
        if (req.method === 'GET') return sendJson(res, 200, await technologySuggestion.view(id));
        if (req.method === 'POST') return sendJson(res, 202, await technologySuggestion.queue(id, await readJson(req), actor));
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const wizardMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/wizard(?:\/(export))?$/);
      if (wizardMatch) {
        const requirementId = decodeURIComponent(wizardMatch[1]);
        const session = getSession(req, authConfig);
        if (process.env.NODE_ENV === 'production' && !session) return sendJson(res, 401, { error: 'Inicia sesión para usar la guía y registrar aceptaciones.' });
        if (session && !session.email) return sendJson(res, 403, { error: 'La sesión no contiene un correo verificable para vincular responsables. Vuelve a iniciar sesión.' });
        const actor = { id: session ? `${session.tid || ''}:${session.oid || session.email}` : 'local-qa', name: session?.name || session?.email || 'QA local sin sesión Azure', email: session ? session.email : 'local-qa@example.test' };
        if (!wizardMatch[2] && req.method === 'GET') return sendJson(res, 200, await wizard.view(requirementId, actor));
        if (!wizardMatch[2] && req.method === 'POST') return sendJson(res, 200, await wizard.act(requirementId, await readJson(req), actor));
        if (wizardMatch[2] === 'export' && req.method === 'GET') {
          const result = await wizard.view(requirementId, actor);
          if (!result.megaPrompt || !result.megaPromptValidation.passed) return sendJson(res, 409, { error: 'Completa las validaciones, evidencias y aceptaciones vigentes antes de exportar.' });
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="megaprompt.txt"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
          return res.end(result.megaPrompt);
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const answerMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/(answers|questions)(?:\/([^/]+)\/answer)?$/);
      if (answerMatch) {
        const requirementId = decodeURIComponent(answerMatch[1]);
        const session = getSession(req, authConfig);
        if (process.env.NODE_ENV === 'production' && !session) return sendJson(res, 401, { error: 'Inicia sesión para responder y aprobar.' });
        const actor = { id: session ? `${session.tid || ''}:${session.oid || session.email}` : 'local-qa', name: session?.name || session?.email || 'Usuario local QA' };
        if (answerMatch[2] === 'answers' && !answerMatch[3] && req.method === 'GET') return sendJson(res, 200, await answers.list(requirementId));
        if (answerMatch[2] === 'questions' && req.method === 'POST') {
          const payload = await readJson(req);
          if (!answerMatch[3]) return sendJson(res, 201, await answers.create(requirementId, payload, actor));
          return sendJson(res, payload?.action === 'suggest' ? 202 : 200, await answers.act(requirementId, decodeURIComponent(answerMatch[3]), payload, actor));
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const workspaceMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/(chat|discussion|azure-attachments)$/);
      if (workspaceMatch) {
        const requirementId = decodeURIComponent(workspaceMatch[1]);
        const operation = workspaceMatch[2];
        const session = getSession(req, authConfig);
        if (process.env.NODE_ENV === 'production' && !session) return sendJson(res, 401, { error: 'Inicia sesión para usar el espacio del requerimiento.' });
        const actor = { id: session ? `${session.tid || ''}:${session.oid || session.email}` : 'local-qa', name: session?.name || session?.email || 'Usuario local QA' };
        if (operation === 'discussion' && req.method === 'GET') return sendJson(res, 200, await workspace.discussion(requirementId));
        if (operation === 'discussion' && req.method === 'POST') return sendJson(res, 201, await workspace.addComment(requirementId, await readJson(req), actor));
        if (operation === 'chat' && req.method === 'GET') return sendJson(res, 200, await workspace.chat(requirementId, actor));
        if (operation === 'chat' && req.method === 'POST') return sendJson(res, 202, await workspace.queueChat(requirementId, await readJson(req), actor));
        if (operation === 'chat' && req.method === 'DELETE') return sendJson(res, 200, await workspace.clearChat(requirementId, actor));
        if (operation === 'azure-attachments' && req.method === 'GET') return sendJson(res, 200, await workspace.azureAttachments(requirementId));
        if (operation === 'azure-attachments' && req.method === 'POST') return sendJson(res, 202, await workspace.queueAzureAttachments(requirementId));
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const downloadMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/sources\/([^/]+)\/download$/);
      if (downloadMatch && ['GET', 'HEAD'].includes(req.method)) {
        const requirementId = decodeURIComponent(downloadMatch[1]);
        const sourceId = decodeURIComponent(downloadMatch[2]);
        const data = await store.read();
        const source = data.requirementSources.find((item) => item.id === sourceId && item.requirementId === requirementId);
        if (!data.requirements.some((item) => item.id === requirementId) || !source?.storageKey?.startsWith(`${requirementId}/`)) return sendJson(res, 404, { error: 'Archivo no encontrado en este requerimiento.' });
        let file;
        try {
          const uploads = await realpath(path.join(path.dirname(dataFile), 'uploads'));
          const base = await realpath(path.join(uploads, requirementId));
          file = await realpath(path.resolve(uploads, source.storageKey));
          if (!base.startsWith(`${uploads}${path.sep}`) || !file.startsWith(`${base}${path.sep}`) || !(await stat(file)).isFile()) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
        } catch { return sendJson(res, 404, { error: 'Archivo no disponible.' }); }
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${safeFilename(source.name)}"; filename*=UTF-8''${encodeURIComponent(source.name || 'archivo').replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`)}`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(file).on('error', () => res.destroy()).pipe(res);
      }

      const enrichmentStatus = apiPath.match(/^\/api\/requirements\/([^/]+)\/enrichment$/);
      if (enrichmentStatus && req.method === 'GET') return sendJson(res, 200, await enrichmentService.refresh(decodeURIComponent(enrichmentStatus[1])));
      const enrichMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/enrich$/);
      if (enrichMatch && req.method === 'POST') {
        const requirementId = decodeURIComponent(enrichMatch[1]);
        const session = getSession(req, authConfig);
        const result = await enrichmentService.queue(requirementId, session?.email || session?.name || 'Usuario del dashboard');
        return sendJson(res, 202, result);
      }

      const sourceUrlMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/sources-url$/);
      if (sourceUrlMatch && req.method === 'POST') {
        const requirementId = decodeURIComponent(sourceUrlMatch[1]);
        const requirement = (await store.list('requirements')).find((item) => item.id === requirementId);
        if (!requirement) return sendJson(res, 404, { error: 'Requirement not found' });
        const payload = await readJson(req);
        if (!payload.url || !/^https?:\/\//i.test(payload.url)) return sendJson(res, 400, { error: 'A valid http(s) URL is required' });
        const item = await store.create('requirementSources', { requirementId, type: payload.type || 'other-url', url: payload.url, name: payload.name || payload.url, status: 'registered', demo: requirement.demo === true });
        return sendJson(res, 201, { item });
      }

      const sourceUploadMatch = apiPath.match(/^\/api\/requirements\/([^/]+)\/sources$/);
      if (sourceUploadMatch && req.method === 'POST') {
        const requirementId = decodeURIComponent(sourceUploadMatch[1]);
        const requirement = (await store.list('requirements')).find((item) => item.id === requirementId);
        if (!requirement) return sendJson(res, 404, { error: 'Requirement not found' });
        const contentType = req.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data;')) return sendJson(res, 400, { error: 'Expected multipart/form-data' });
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) return sendJson(res, 400, { error: 'Missing multipart boundary' });
        const parts = parseMultipart(await readRawBody(req, authConfig.enabled ? 50 * 1024 * 1024 : 10 * 1024 * 1024), boundaryMatch[1] || boundaryMatch[2]);
        const files = parts.filter((part) => part.filename);
        if (!files.length) return sendJson(res, 400, { error: 'No files received' });
        const dir = path.join(path.dirname(dataFile), 'uploads', safeSegment(requirementId));
        await mkdir(dir, { recursive: true });
        const items = [];
        for (const file of files) {
          const storageName = `${cryptoRandomId()}-${safeFilename(file.filename)}`;
          const storagePath = path.join(dir, storageName);
          await writeFile(storagePath, file.data, { flag: 'wx' });
          items.push(await store.create('requirementSources', { requirementId, type: 'file', name: file.filename, size: file.data.length, contentType: file.contentType || 'application/octet-stream', storageKey: `${requirementId}/${storageName}`, status: 'uploaded', demo: false }));
        }
        return sendJson(res, 201, { items });
      }

      const apiMatch = apiPath.match(/^\/api\/([^/]+)(?:\/([^/]+))?$/);
      if (apiMatch) {
        const [, collection, id] = apiMatch;
        if (!COLLECTIONS.has(collection)) return sendJson(res, 404, { error: 'Unknown collection' });
        if (collection === 'requirementQuestions' && !['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { error: 'Usa el flujo de preguntas, borradores y aprobación de respuestas.' });
        if (enrichmentService.enabled && ['enrichmentRuns', 'requirementVersions', 'qaPackages'].includes(collection) && !['GET', 'HEAD'].includes(req.method)) {
          return sendJson(res, 405, { error: 'Los artefactos de Hermes se generan mediante el flujo de enriquecimiento; no se editan por CRUD.' });
        }
        if (req.method === 'GET' && !id) return sendJson(res, 200, { collection, items: await store.list(collection) });
        if (req.method === 'GET' && id) {
          const item = (await store.list(collection)).find((entry) => entry.id === id);
          return item ? sendJson(res, 200, { item }) : sendJson(res, 404, { error: 'Not found' });
        }
        if (req.method === 'POST' && !id) {
          const payload = await readJson(req);
          if (collection === 'users' && (payload?.syncSource === 'azure-devops' || payload?.azureIdentityKey !== undefined)) return sendJson(res, 400, { error: 'La identidad Azure solo puede provenir de la sincronización autorizada.' });
          if (collection === 'workItems' && (payload?.syncSource === 'azure-devops' || payload?.azureId !== undefined)) return sendJson(res, 400, { error: 'La identidad Azure solo puede provenir de la sincronización autorizada.' });
          return sendJson(res, 201, { item: await store.create(collection, payload) });
        }
        if (req.method === 'PUT' && id) {
          const payload = await readJson(req);
          if (collection === 'users') {
            const existing = (await store.list(collection)).find((entry) => entry.id === id);
            const changed = ['id', 'syncSource', 'azureIdentityKey', 'email', 'projects', 'team', 'name', 'lastSyncAt'].some(key => payload?.[key] !== undefined && JSON.stringify(payload[key]) !== JSON.stringify(existing?.[key]));
            if ((existing?.syncSource === 'azure-devops' && changed) || (existing?.syncSource !== 'azure-devops' && (payload?.syncSource === 'azure-devops' || payload?.azureIdentityKey !== undefined))) return sendJson(res, 400, { error: 'No se puede falsificar o cambiar la identidad de un usuario sincronizado de Azure.' });
          }
          if (collection === 'workItems') {
            const existing = (await store.list(collection)).find((entry) => entry.id === id);
            const identityChanged = ['id', 'azureId', 'project', 'url', 'syncSource', 'assignedUserId', 'assignedTo', 'title', 'type', 'tags'].some((key) => payload?.[key] !== undefined && payload[key] !== existing?.[key]);
            if ((existing?.syncSource === 'azure-devops' && identityChanged) || (existing?.syncSource !== 'azure-devops' && (payload?.syncSource === 'azure-devops' || payload?.azureId !== undefined))) return sendJson(res, 400, { error: 'No se puede falsificar o cambiar la identidad de un ticket sincronizado de Azure.' });
          }
          const item = await store.update(collection, id, payload);
          return item ? sendJson(res, 200, { item }) : sendJson(res, 404, { error: 'Not found' });
        }
        if (req.method === 'DELETE' && id) {
          const removed = await store.remove(collection, id);
          return sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, url.pathname, staticDir);
    } catch (error) {
      const status = error.status || 500;
      return sendJson(res, status, { error: status === 500 ? 'Internal server error' : error.message });
    }
  });
  if (enrichmentService.enabled) {
    let reconciling = false;
    const timer = setInterval(async () => {
      if (reconciling) return;
      reconciling = true;
      try { await enrichmentService.reconcile(); await workspace.reconcileWorkspace(); await wizard.reconcileAll(); await technologySuggestion.reconcileAll(); }
      catch { console.error('Enrichment reconciliation failed; pending jobs retained.'); }
      finally { reconciling = false; }
    }, 5000);
    timer.unref();
    server.on('close', () => clearInterval(timer));
  }
  return server;
}

function isRequirementMutation(method, apiPath) {
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false;
  return /^\/api\/(requirements|requirementSources|requirementQuestions|requirementVersions|requirementApprovals|requirementHandoffs|enrichmentRuns|qaPackages)(?:\/|$)/.test(apiPath);
}

async function readRawBody(req, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) { const error = new Error('Payload too large'); error.status = 413; throw error; } chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function parseMultipart(body, boundary) {
  const marker = Buffer.from(`--${boundary}`); const parts = [];
  for (const section of body.toString('binary').split(marker).slice(1)) {
    const rawSection = Buffer.from(section, 'binary');
    if (rawSection.length < 4 || rawSection.subarray(0, 2).toString() === '--') continue;
    const start = rawSection.indexOf(Buffer.from('\r\n')); const end = rawSection.lastIndexOf(Buffer.from('\r\n--'));
    const raw = rawSection.subarray(start + 2, end >= 0 ? end : rawSection.length - 2); const separator = raw.indexOf(Buffer.from('\r\n\r\n'));
    if (separator < 0) continue;
    const headers = raw.subarray(0, separator).toString('utf8'); const data = raw.subarray(separator + 4);
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || ''; const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '';
    parts.push({ filename, contentType, data });
  }
  return parts;
}

function safeFilename(value) { return String(value || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'file'; }
function safeSegment(value) { return String(value || 'requirement').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function cryptoRandomId() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }

async function serveStatic(req, res, pathname, staticDir) {
  let relative = decodeURIComponent(pathname);
  if (relative === '/' || relative === '/dashboard') relative = '/dashboard/index.html';
  if (relative === '/dashboard/users') relative = '/dashboard/users/index.html';
  if (relative === '/dashboard/requirements') relative = '/dashboard/requirements/index.html';
  if (relative === '/dashboard/requirements/flow') relative = '/dashboard/requirements/flow/index.html';
  if (relative === '/dashboard/requirements/onboarding') relative = '/dashboard/requirements/onboarding/index.html';
  if (['/dashboard/repositories', '/dashboard/repository-owners', '/dashboard/alerts'].includes(relative)) relative = '/dashboard/repositories/index.html';
  if (/^\/dashboard\/modules\/[^/.]+$/.test(relative)) relative = '/dashboard/modules/index.html';
  if (relative.endsWith('/')) relative += 'index.html';
  const resolved = path.resolve(staticDir, relative.replace(/^\//, ''));
  const staticRoot = path.resolve(staticDir);
  if (!resolved.startsWith(staticRoot)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'content-type': contentType(resolved), 'cache-control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(resolved).pipe(res);
  } catch {
    return sendJson(res, 404, { error: 'Not found' });
  }
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 128) {
      const err = new Error('Payload too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON');
    err.status = 400;
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4189);
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => {
    console.log(`mobilityapps-control-tower listening on ${host}:${port}`);
  });
}
