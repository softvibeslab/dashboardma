import { escapeAnswerText as e, renderAnswersSection } from '../answers.js';
import { azureSourcesMarkup, mountAzureSources } from './azure-sources.js';

const pending = run => ['queued', 'running'].includes(run?.status);

// Request URLs stay same-origin; only this explicit action queues inference.
export function createIntake({ id, request, render = () => {}, onChange = () => {} }) {
  const base = `/dashboard/api/requirements/${encodeURIComponent(id)}`;
  const state = { requirement: null, sources: [], run: null, busy: false, error: '', loaded: false, maxBytes: 10 * 1024 * 1024 };
  let destroyed = false, generation = 0, completedVersion;
  const paint = () => { if (!destroyed) render(state); };
  async function load() {
    const token = ++generation;
    try {
      const [requirement, sources, status, auth] = await Promise.all([request(base), request('/dashboard/api/requirementSources'), request(`${base}/enrichment`), request('/dashboard/api/auth/status')]);
      if (destroyed || token !== generation) return false;
      state.requirement = requirement.item; state.sources = (sources.items || []).filter(s => s.requirementId === id);
      state.run = status.run; state.maxBytes = (auth.configured ? 50 : 10) * 1024 * 1024; state.loaded = true; state.error = '';
      paint();
      if (status.run?.status === 'completed' && status.run.versionId && completedVersion !== status.run.versionId) {
        completedVersion = status.run.versionId;
        await onChange({ reason: 'generation', versionId: completedVersion });
      }
      return true;
    } catch (error) { if (!destroyed && token === generation) { state.error = error.message; paint(); } return false; }
  }
  async function mutate(resource, init, reason) {
    if (destroyed || state.busy) return false;
    state.busy = true; state.error = ''; ++generation; paint();
    try {
      const result = await request(base + resource, init);
      if (destroyed) return false;
      if (result.run) state.run = result.run;
      if (!await load()) return false;
      if (destroyed) return false;
      await onChange({ reason });
      return true;
    } catch (error) { if (!destroyed) state.error = error.message; return false; }
    finally { state.busy = false; paint(); }
  }
  const json = (method, value) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  return { state, load,
    saveContext(description) { return mutate('', json('PUT', { description }), 'context'); },
    enrich() { return pending(state.run) ? Promise.resolve(false) : mutate('/enrich', { method: 'POST' }, 'queued'); },
    addUrl(url, type = 'other-url') {
      if (!sourceUrl(url)) { state.error = 'Escribe una URL HTTP o HTTPS válida, sin credenciales.'; paint(); return Promise.resolve(false); }
      return mutate('/sources-url', json('POST', { url, name: url, type }), 'sources');
    },
    upload(form, bytes) {
      if (!Number.isFinite(bytes) || bytes > state.maxBytes) { state.error = `El envío supera ${state.maxBytes / 1024 / 1024} MiB. Reduce o divide los archivos.`; paint(); return Promise.resolve(false); }
      return mutate('/sources', { method: 'POST', body: form }, 'sources');
    },
    destroy() { destroyed = true; generation++; }
  };
}

export function sourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function sourcesMarkup(id, sources = []) {
  return sources.length ? `<ul>${sources.map(s => `<li><strong>${e(s.name || s.url || 'Fuente')}</strong> · ${e(s.type)} · ${e(s.status || 'registrada')}${sourceUrl(s.url) ? ` · <a href="${e(sourceUrl(s.url))}" target="_blank" rel="noopener noreferrer">Abrir URL</a>` : ''}${s.storageKey ? ` · <a href="/dashboard/api/requirements/${encodeURIComponent(id)}/sources/${encodeURIComponent(s.id)}/download">Descargar archivo local</a>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Todavía no hay fuentes agregadas.</p>';
}

export async function intakeRequest(path, init = {}, fetcher = globalThis.fetch) {
  const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { Accept: 'application/json', ...init.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Inicia sesión para continuar.' : result.error || 'No se pudo completar la operación.'), { status: response.status });
  return result;
}

// This controller changes only status/list nodes. Editors remain mounted during polling.
export function mountIntake(panel, { id, onChange, onDirty = () => {}, request = intakeRequest } = {}) {
  const $ = selector => panel.querySelector(selector);
  const unsaved = new Set();
  let timer, destroyed = false, loading = false, started = Date.now(), initialized = false;
  const notify = () => onDirty();
  const context = () => $('[name="description"]');
  const azureSources = mountAzureSources($('[data-intake-azure]'), { id, request });
  const controller = createIntake({ id, request, onChange: async change => {
    if (change.reason === 'sources') await azureSources.load();
    return onChange?.(change);
  }, render(state) {
    if (destroyed) return;
    if (state.requirement && !unsaved.has('context')) context().value = state.requirement.description || '';
    initialized ||= state.loaded;
    context().disabled = !initialized;
    for (const button of panel.querySelectorAll('[data-intake-form] button')) button.disabled = state.busy || !initialized;
    $('[data-intake-enrich]').disabled = state.busy || !initialized || pending(state.run) || ['context', 'files', 'url'].some(key => unsaved.has(key));
    $('[data-intake-refresh]').disabled = state.busy || loading;
    $('[data-intake-message]').textContent = state.error || (state.busy ? 'Guardando…' : '');
    $('[data-intake-message]').classList.toggle('answers-error', Boolean(state.error));
    $('[data-intake-sources]').innerHTML = sourcesMarkup(id, state.sources);
    $('[data-upload-limit]').textContent = `Hasta ${state.maxBytes / 1024 / 1024} MiB por envío, incluido el formulario. Cualquier formato; las fuentes no extraídas quedan pendientes.`;
    $('[data-intake-progress]').textContent = state.run ? `${({ queued: 'En cola', running: 'En ejecución', completed: 'Completado — propuesta pendiente de revisión', failed: 'Fallido' })[state.run.status] || state.run.status} · ${state.run.error || state.run.phase || ''}${state.run.versionId ? ' · Nueva versión disponible: selecciónala explícitamente arriba.' : ''}` : 'Sin generación. Guarda contexto y fuentes antes de enriquecer.';
    clearTimeout(timer);
    if (!state.busy && pending(state.run) && !document.hidden) {
      if (Date.now() - started < 360000) timer = setTimeout(refresh, 3000);
      else $('[data-intake-progress]').textContent += ' · Se detuvo la actualización tras 6 minutos. Pulsa Actualizar estado y fuentes.';
    }
    notify();
  } });
  async function refresh() {
    if (destroyed || loading || controller.state.busy) return;
    loading = true;
    try { await controller.load(); } finally { loading = false; if (!destroyed) $('[data-intake-refresh]').disabled = false; }
  }
  function changed(event) {
    const form = event.target.closest('[data-intake-form]');
    if (form) unsaved.add(form.dataset.intakeForm);
    const card = event.target.closest('[data-answer-question-id]');
    if (card) unsaved.add(`answer:${card.dataset.answerQuestionId}`);
    if (event.target.closest('[data-answers-new-question]')) unsaved.add('question');
    $('[data-intake-enrich]').disabled = controller.state.busy || !initialized || pending(controller.state.run) || ['context', 'files', 'url'].some(key => unsaved.has(key));
    notify();
  }
  async function submit(event) {
    const form = event.target.closest('[data-intake-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity() || controller.state.busy || !initialized) return;
    const kind = form.dataset.intakeForm;
    let success = false, snapshot;
    if (kind === 'context') { snapshot = context().value; success = await controller.saveContext(snapshot); }
    if (kind === 'url') { snapshot = form.elements.url.value; success = await controller.addUrl(snapshot, form.elements.type.value); }
    if (kind === 'files') {
      if (!form.elements.files.files.length) return;
      const payload = new FormData(form);
      // Browser-generated boundary and UTF-8 filenames count against the API body limit.
      const bytes = (await new Response(payload).blob()).size;
      if (destroyed || controller.state.busy) return;
      success = await controller.upload(payload, bytes);
    }
    if (destroyed) return;
    if (success) {
      if (kind === 'context' && context().value === snapshot) unsaved.delete(kind);
      else if (kind === 'url' && form.elements.url.value === snapshot) { form.reset(); unsaved.delete(kind); }
      else if (kind === 'files') { form.reset(); unsaved.delete(kind); }
      $('[data-intake-message]').textContent = 'Guardado. Las fuentes y los bloqueos están actualizados.';
    }
    changed({ target: { closest: () => null } });
  }
  function click(event) {
    if (event.target.closest('[data-intake-enrich]') && !event.target.disabled) { started = Date.now(); void controller.enrich(); }
    if (event.target.closest('[data-intake-refresh]') && !event.target.disabled) { started = Date.now(); void refresh(); }
  }
  function visibility() { clearTimeout(timer); if (!document.hidden && pending(controller.state.run)) void refresh(); }
  panel.addEventListener('input', changed); panel.addEventListener('change', changed); panel.addEventListener('submit', submit); panel.addEventListener('click', click);
  document.addEventListener('visibilitychange', visibility);
  void refresh();
  return {
    isDirty: () => unsaved.size > 0,
    isBusy: () => controller.state.busy,
    answersSaved({ questionId, action }) { unsaved.delete(action === 'create' ? 'question' : `answer:${questionId}`); notify(); },
    destroy() { destroyed = true; clearTimeout(timer); azureSources.destroy(); controller.destroy(); document.removeEventListener('visibilitychange', visibility); panel.removeEventListener('input', changed); panel.removeEventListener('change', changed); panel.removeEventListener('submit', submit); panel.removeEventListener('click', click); }
  };
}

export function intakeMarkup(requirement) {
  return `<section data-onboarding-intake class="onboarding-intake" aria-label="Contexto, fuentes y enriquecimiento">
    <h3>Contexto del requerimiento</h3><form data-intake-form="context" class="editor"><label>Descripción y criterios disponibles<textarea name="description" rows="6" disabled></textarea></label><button class="secondary" disabled>Guardar contexto</button></form>
    ${azureSourcesMarkup()}
    <h3>Fuentes y anexos del dashboard</h3><p class="hint">Los archivos son locales; no se suben a Azure. Las URL no se descargan automáticamente y las fuentes no extraídas quedan pendientes.</p>
    <form data-intake-form="files" class="editor"><label>Adjuntar archivos<input name="files" type="file" multiple></label><p class="hint" data-upload-limit>Hasta 50 MiB por envío con sesión (10 MiB sin autenticación), incluido el formulario.</p><button class="secondary">Agregar archivos</button></form>
    <form data-intake-form="url" class="editor"><label>URL de referencia<input name="url" type="url" required placeholder="https://…"></label><label>Tipo de fuente<select name="type"><option value="other-url">Otra URL</option><option value="teams-url">Teams</option><option value="document">Documento</option><option value="transcription">Transcripción</option><option value="video">Video</option></select></label><button class="secondary">Agregar URL</button></form>
    <div data-intake-sources></div><p data-intake-message role="status"></p>
    <div class="notice">No se genera contenido automáticamente al abrir o importar. Hermes propone; las personas aprueban. Aprobar respuestas no aprueba el requerimiento ni un CP.</div>
    <div class="button-row"><button type="button" class="primary-button" data-intake-enrich>Enriquecer con Hermes</button><button type="button" class="secondary" data-intake-refresh>Actualizar estado y fuentes</button></div><p data-intake-progress role="status" aria-live="polite">Consultando estado…</p>
    ${renderAnswersSection(requirement)}
  </section>`;
}
