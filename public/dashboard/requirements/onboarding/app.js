import { intakeMarkup, mountIntake, intakeRequest } from './intake.js';
import { initializeAnswers } from '../answers.js';
import { mountTechnologySuggestion } from './technology-suggestion.js';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const e = escapeHtml;
export async function wizardRequest(url, payload = null, fetcher = globalThis.fetch, signal) {
  const response = await fetcher(url, { method: payload === null ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(payload === null ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === null ? {} : { body: JSON.stringify(payload) }), signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401 ? 'Inicia sesión para continuar. Usa el enlace de sesión de esta página.' : response.status === 409 ? 'Hay un conflicto de revisión. Tus campos se conservan. Recarga la versión del servidor antes de continuar.' : typeof result.error === 'string' ? result.error : 'No se pudo completar la operación. Inténtalo de nuevo.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return result;
}

// Search reads only the local synchronized snapshot, never Azure directly.
export function createAzureSearch({ request = wizardRequest, render = () => {}, canImport = () => true, lock = () => {}, reload = async () => {}, select = async () => {}, notify = () => {} }) {
  let epoch = 0, controller;
  const state = { query: '', offset: 0, result: null, loading: false, error: '', importing: false };
  return {
    get state() { return state; },
    async importItem(id) {
      const item = state.result?.items?.find(item => String(item.id) === String(id));
      if (state.importing || state.loading || !item || !canImport()) return;
      state.importing = true; state.error = ''; lock(true); render(state);
      try {
        const result = await request('/dashboard/api/requirements/import-azure', { workItemId: item.id });
        await reload();
        const selected = await select(result.item.id);
        if (selected !== false) notify(result.created ? 'Requerimiento agregado a la bandeja. Continúa desde su etapa guardada.' : 'El requerimiento ya estaba en la bandeja. Se reutilizó sin duplicarlo.');
      } catch (err) { state.error = err.message || 'No se pudo agregar a la bandeja. Inténtalo de nuevo.'; }
      finally { state.importing = false; lock(false); render(state); }
    },
    async search(query, offset = 0) {
      if (state.importing) return;
      const token = ++epoch;
      controller?.abort(); controller = new AbortController();
      state.query = query.trim(); state.offset = offset; state.result = null; state.error = '';
      if (!state.query) { state.loading = false; render(state); return; }
      state.loading = true; render(state);
      try {
        const result = await request(`/dashboard/api/azure/work-items?${new URLSearchParams({ q: state.query, limit: '10', offset: String(offset) })}`, null, globalThis.fetch, controller.signal);
        if (token === epoch) state.result = result;
      } catch (err) { if (token === epoch && err.name !== 'AbortError') state.error = err.message || 'No se pudo buscar. Inténtalo de nuevo.'; }
      finally { if (token === epoch) { state.loading = false; render(state); } }
    }
  };
}

export function azureSearchMarkup({ query = '', offset = 0, result, loading = false, importing = false, error = '' }) {
  if (loading) return '<p class="hint" role="status">Buscando en los datos sincronizados…</p>';
  const failure = error ? `<p class="message error" role="alert">${e(error)}</p>` : '';
  if (!result) return failure || '<p class="hint">Escribe un ID o texto y pulsa Buscar. No se consulta Azure en vivo.</p>';
  const items = result.items || [], total = result.total || 0;
  const disabled = importing ? ' disabled' : '';
  return `${failure}${importing ? '<p role="status">Agregando a la bandeja…</p>' : ''}<p class="hint">Datos sincronizados · Última sincronización: ${e(result.syncedAt || 'Sin fecha disponible')} · ${items.length ? offset + 1 : 0}–${offset + items.length} de ${e(total)} resultados</p>
    ${items.length ? `<ul class="azure-results-list">${items.map(item => `<li class="record azure-result"><div><strong>${e(item.id)} · ${e(item.title)}</strong><p class="hint">${e(item.project || 'Sin proyecto')} · ${e(item.type || '')} · ${e(item.state || 'Sin estado')}</p>${item.syncedAt ? `<p class="hint">Sincronizado: ${e(item.syncedAt)}</p>` : ''}</div><button type="button" class="secondary" data-import-id="${e(item.id)}"${disabled}>Agregar a bandeja y continuar</button></li>`).join('')}</ul>` : `<p class="empty-state">No hay resultados para «${e(query)}». Prueba otro ID o texto; solo se buscan datos sincronizados.</p>`}
    <nav class="azure-pagination" aria-label="Páginas de resultados Azure">${offset > 0 ? `<button type="button" class="secondary" data-offset="${Math.max(0, offset - 10)}"${disabled}>← Anterior</button>` : ''}${result.hasMore ? `<button type="button" class="secondary" data-offset="${offset + 10}"${disabled}>Siguiente →</button>` : ''}</nav>`;
}

// One poll at a time, even when a new selection interrupts an old request.
export function createPoller({ read, accept, error = () => {}, hidden = () => document.hidden, now = () => Date.now(), schedule = (fn) => setTimeout(fn, 3000), cancel = clearTimeout }) {
  let epoch = 0, timer, inFlight = false, active = false, run, started = 0, controller;
  const queue = () => {
    if (active && !inFlight && shouldPoll(run, hidden(), now() - started)) timer = schedule(tick);
  };
  const tick = async () => {
    timer = undefined;
    if (inFlight || !active || !shouldPoll(run, hidden(), now() - started)) return;
    inFlight = true;
    const token = epoch;
    controller = new AbortController();
    try {
      const result = await read(controller.signal);
      if (active && token === epoch && !hidden()) { run = result.flow?.run; accept(result); }
    } catch (err) {
      if (active && token === epoch && err.name !== 'AbortError') { active = false; error(err); }
    } finally { inFlight = false; controller = undefined; queue(); }
  };
  const stop = () => { active = false; epoch++; if (timer !== undefined) cancel(timer); timer = undefined; controller?.abort(); };
  return { stop, start(nextRun, reset = true) { stop(); run = nextRun; if (reset) started = now(); active = true; queue(); } };
}

export const STAGES = ['Enriquecimiento', 'Tecnologías y áreas', 'Specs', 'Validación documental', 'Pruebas y evidencias', 'Firmas', 'Megaprompt y entrega'];
export const nextGuard = (data, busy = false) => Boolean(data?.flow && data.flow.stage < 6 && Array.isArray(data.blockers) && !data.blockers.length && !busy);
export const shouldPoll = (run, hidden, elapsed) => !hidden && elapsed < 360000 && ['queued', 'running'].includes(run?.status);
const options = (items, selected) => items.map(item => `<option value="${e(item.id)}"${item.id === selected ? ' selected' : ''}>${e(item.label ?? item.title ?? item.name ?? item.id)}</option>`).join('');
const field = (label, name, value = '', type = 'text', extra = '') => `<label>${e(label)}<input name="${e(name)}" type="${type}" value="${e(value)}" ${extra}></label>`;
const text = (label, name, required = true) => `<label>${e(label)}<textarea name="${name}" ${required ? 'required' : ''} rows="3"></textarea></label>`;
const empty = (message) => `<p class="empty-state">${e(message)}</p>`;
export function buildPayload(action, fields, tracks, data) {
  const base = { action, expectedRevision: data.flow.revision };
  if (action === 'configure') return { ...base, versionId: fields.versionId, tracks: data.flow.stage === 0 ? data.flow.tracks || [] : tracks, qaEmail: fields.qaEmail ?? data.flow.qaEmail ?? '', businessEmail: fields.businessEmail ?? data.flow.businessEmail ?? '' };
  if (action === 'sign') return { ...base, roleId: fields.roleId, packageHash: fields.packageHash, decision: fields.decision, comment: fields.comment || '' };
  if (action === 'test') return { ...base, ...Object.fromEntries(['trackId', 'criterion', 'risk', 'steps', 'expected', 'actual', 'outcome'].map(key => [key, fields[key]])), ...(fields.evidenceUrl ? { evidenceUrl: fields.evidenceUrl } : {}), ...(fields.evidenceSourceId ? { evidenceSourceId: fields.evidenceSourceId } : {}), attest: fields.attest === 'on' };
  return base;
}

export function mountWizard(root = document) {
  const $ = (id) => root.getElementById(id);
  if (!$('requirementSelect')) return;
  let selectedId = '', data = null, dirty = false, busy = false, conflict = false, epoch = 0, selectionController, importLocked = false, listEpoch = 0, responsibleEpoch = 0;
  let intake, answers, technologySuggestion, inlineEpoch = 0;
  const hasEdits = () => dirty || Boolean(intake?.isDirty());
  const endpoint = () => `/dashboard/api/requirements/${encodeURIComponent(selectedId)}/wizard`;
  const sourceKey = d => JSON.stringify([d?.flow?.stage, d?.flow?.versionId, d?.flow?.tracks, d?.flow?.qaEmail, d?.flow?.businessEmail, d?.packageHash, d?.context]);
  const tell = (message, isError = false) => {
    $('message').textContent = message;
    $('message').classList.toggle('error', isError);
    $('message').hidden = !message;
  };
  const showError = err => {
    if (err.name === 'AbortError') return;
    tell(err.message || 'No se pudo completar la operación.', true);
    if (err.status === 409) { conflict = true; $('reloadConflict').hidden = false; }
    navigation();
  };
  async function syncAzureResponsibles(area = '') {
    const project = data?.context?.requirement?.project || '';
    const list = $('stageBody').querySelector('#azureResponsibleOptions');
    const status = $('stageBody').querySelector('[data-azure-responsible-status]');
    if (!list || !project) return;
    const token = ++responsibleEpoch;
    if (status) status.textContent = 'Consultando usuarios Azure sincronizados…';
    try {
      const result = await wizardRequest(`/dashboard/api/azure/users?${new URLSearchParams({ project, area, limit: '100' })}`);
      if (token !== responsibleEpoch) return;
      list.innerHTML = (result.items || []).map(user => `<option value="${e(user.email)}">${e(user.name)} · ${e(user.email)}</option>`).join('');
      if (status) status.textContent = result.areaMatched ? `${result.items?.length || 0} responsables Azure disponibles · sync ${e(result.syncedAt || 'sin fecha')}` : `${result.items?.length || 0} usuarios del proyecto disponibles; Azure no reporta esa área en la sincronización actual.`;
    } catch (error) {
      if (token === responsibleEpoch && status) status.textContent = error.message || 'No se pudieron consultar los usuarios Azure sincronizados.';
    }
  }
  const navigation = () => {
    $('backButton').disabled = !data || data.flow.stage === 0 || busy || conflict || importLocked;
    $('nextButton').disabled = !nextGuard(data, busy || hasEdits() || intake?.isBusy() || conflict || importLocked);
    $('nextButton').hidden = data?.flow.stage === 6;
    $('saveHint').textContent = conflict ? 'Revisión en conflicto · recarga para continuar' : hasEdits() ? 'Tienes cambios sin guardar' : busy ? 'Guardando…' : 'Versión guardada en el servidor';
    $('stageBody').querySelectorAll('button').forEach(button => {
      if (!busy && !conflict && !importLocked && button.dataset.wasDisabled !== undefined) { button.disabled = button.dataset.wasDisabled === 'true'; delete button.dataset.wasDisabled; }
      else if ((busy || conflict || importLocked) && button.dataset.wasDisabled === undefined) { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; }
    });
  };
  function updateVersions() {
    const select = $('stageBody').querySelector?.('[name="versionId"]');
    if (!select) return;
    const chosen = select.value;
    const versions = data.context?.versions || [];
    const emptyNotice = $('stageBody').querySelector('[data-version-empty]');
    if (emptyNotice) emptyNotice.hidden = Boolean(versions.length);
    // Never adopt currentVersionId implicitly: this may be a deliberately older choice.
    select.innerHTML = `<option value="">Selecciona una versión</option>${options(versions.map(v => ({ id: v.id, label: `Versión ${v.version} · ${v.createdAt || v.id}` })), chosen)}`;
    select.value = chosen;
    if (chosen !== String(data.flow.versionId || '')) {
      dirty = true;
      const hint = $('stageBody').querySelector('[data-version-hint]');
      if (hint) hint.textContent = 'La selección visible aún no coincide con la versión del servidor. Selecciona y guarda explícitamente la versión de partida antes de continuar.';
    }
    select.closest('form').querySelector('button').disabled = !versions.length || busy || conflict || importLocked;
    navigation();
  }
  async function refreshInline(change = {}) {
    const id = selectedId, token = epoch, turn = ++inlineEpoch;
    try {
      const incoming = await wizardRequest(`/dashboard/api/requirements/${encodeURIComponent(id)}/wizard`);
      if (token !== epoch || turn !== inlineEpoch || id !== selectedId || !data) return;
      if (incoming.flow.stage !== data.flow.stage) { acceptPoll(incoming); return; }
      data = incoming; render(true);
      if (change.reason === 'generation') {
        tell('Nueva versión enriquecida disponible. Tus campos se conservaron; selecciónala y guarda explícitamente la versión de partida.');
        // Refresh once on completion, not on each status poll. The reusable module retains drafts.
        void answers?.refresh();
      }
    } catch (error) { if (token === epoch && turn === inlineEpoch) showError(error); }
  }
  function mountInline() {
    const panel = $('stageBody').querySelector?.('[data-onboarding-intake]');
    if (!panel) return;
    intake = mountIntake(panel, { id: selectedId, onDirty: navigation, onChange: refreshInline });
    answers ||= initializeAnswers({
      api: (path, init) => intakeRequest(`/dashboard/api/${path}`, init),
      getSelectedRequirement: () => data?.flow.stage === 0 ? data.context?.requirement : null,
      onChange(change) {
        if (change.requirementId !== selectedId || data?.flow.stage !== 0) return;
        intake?.answersSaved(change);
        return refreshInline({ reason: 'answers' });
      }
    });
    document.dispatchEvent(new CustomEvent('requirement-workspace-change', { detail: { id: selectedId } }));
  }
  const render = (keepEditor = false) => {
    if (!data) return;
    const stage = data.flow.stage;
    $('wizard').hidden = false;
    $('emptyPrompt').hidden = true;
    $('stageList').innerHTML = (data.stages || STAGES).map((title, i) => `<li ${i === stage ? 'aria-current="step"' : ''} class="${i < stage ? 'past' : ''}">${e(title)}</li>`).join('');
    $('stageNumber').textContent = String(stage + 1).padStart(2, '0');
    $('stageProgress').textContent = `ETAPA ${stage + 1} DE 7 · REVISIÓN ${data.flow.revision}`;
    $('stageTitle').textContent = (data.stages || STAGES)[stage];
    $('requirementMeta').textContent = `${data.context?.requirement?.id || selectedId} · ${data.context?.requirement?.title || ''} · ${data.context?.requirement?.status || ''}`;
    const existingIntake = $('stageBody').querySelector?.('[data-onboarding-intake]');
    if (!keepEditor && !(stage === 0 && existingIntake)) {
      intake?.destroy(); intake = null;
      technologySuggestion?.destroy(); technologySuggestion = null;
      $('stageBody').innerHTML = stageMarkup(data);
      if (stage === 1) technologySuggestion = mountTechnologySuggestion($('stageBody').querySelector('[data-technology-suggestion]'), {
        request: wizardRequest,
        getBinding: () => ({ id: selectedId, revision: data?.flow.revision, stage: data?.flow.stage, versionId: $('stageBody').querySelector('[name="versionId"]')?.value, blocked: busy || conflict || importLocked }),
        applyEditor: tracks => {
          if (data?.flow.stage !== 1 || busy || conflict || importLocked) return;
          $('tracks').innerHTML = tracks.map(trackMarkup).join(''); dirty = true; navigation();
          tell('Propuesta aplicada al editor, sin guardar. Revisa responsables pendientes y pulsa Guardar tecnologías y responsables.');
          void syncAzureResponsibles($('stageBody').querySelector('[data-azure-area]')?.value || '');
        }
      });
      if (stage === 1) void syncAzureResponsibles($('stageBody').querySelector('[data-azure-area]')?.value || '');
      if (stage === 0) mountInline();
    }
    if (stage === 0 && existingIntake) updateVersions();
    $('blockers').hidden = !data.blockers?.length;
    $('blockers').innerHTML = data.blockers?.length ? `<h3>Antes de continuar</h3><ul>${data.blockers.map(b => `<li>${e(b)}</li>`).join('')}</ul><p>Revisa los datos de esta etapa${stage === 0 ? ', las fuentes y las respuestas en este mismo panel' : ''}.</p>` : '';
    navigation();
  };
  const acceptPoll = incoming => {
    if (dirty && sourceKey(incoming) !== sourceKey(data)) {
      poller.stop(); conflict = true; $('reloadConflict').hidden = false;
      tell('El origen o paquete cambió mientras editabas. Tus campos siguen intactos. Revisa y recarga la versión del servidor.', true);
      navigation(); return;
    }
    data = incoming; render(dirty);
  };
  const poller = createPoller({ read: signal => wizardRequest(endpoint(), null, globalThis.fetch, signal), accept: acceptPoll, error: showError });
  async function select(id, discardApproved = false) {
    if ((importLocked || intake?.isBusy()) && !discardApproved) { $('requirementSelect').value = selectedId; return; }
    if (hasEdits() && !discardApproved && !globalThis.confirm('Tienes cambios sin guardar. ¿Descartarlos y cambiar de requerimiento?')) { $('requirementSelect').value = selectedId; return; }
    intake?.destroy(); intake = null; technologySuggestion?.destroy(); technologySuggestion = null; inlineEpoch++;
    epoch++; const token = epoch;
    poller.stop(); selectionController?.abort(); selectionController = new AbortController();
    selectedId = id; data = null; dirty = false; conflict = false; busy = false;
    $('reloadConflict').hidden = true; $('wizard').hidden = true; $('emptyPrompt').hidden = false;
    tell('');
    const url = new URL(location.href);
    if (id) url.searchParams.set('requirementId', id); else url.searchParams.delete('requirementId');
    history.replaceState(null, '', url);
    if (!id) return;
    $('emptyPrompt').textContent = 'Cargando la etapa guardada…';
    try {
      const incoming = await wizardRequest(endpoint(), null, globalThis.fetch, selectionController.signal);
      if (token !== epoch) return false;
      data = incoming; render(); poller.start(data.flow.run); return true;
    } catch (err) { if (token === epoch) { $('emptyPrompt').textContent = 'No se pudo cargar el requerimiento. Vuelve a seleccionarlo o inicia sesión.'; showError(err); } return false; }
  }
  async function send(payload) {
    if (busy || intake?.isBusy() || conflict || importLocked || !data) return;
    busy = true; const token = epoch, url = endpoint();
    poller.stop(); navigation(); tell('');
    try {
      const incoming = await wizardRequest(url, payload);
      if (token !== epoch) return;
      data = incoming; dirty = false; busy = false; render();
      tell('Cambios guardados. La etapa y sus bloqueos están actualizados.');
      $('stageTitle').focus(); poller.start(data.flow.run);
    } catch (err) { if (token === epoch) { busy = false; showError(err); } }
    finally { if (token === epoch) { busy = false; navigation(); } }
  }
  async function loadRequirements() {
    const token = ++listEpoch;
    const result = await wizardRequest('/dashboard/api/requirements');
    if (token !== listEpoch) return null;
    const items = Array.isArray(result) ? result : result.items || result.requirements || [];
    $('requirementSelect').innerHTML = `<option value="">Selecciona un requerimiento</option>${options(items.map(r => ({ id: r.id, label: `${r.id} · ${r.title}` })))}`;
    $('requirementSelect').value = selectedId;
    return items;
  }
  const azure = createAzureSearch({
    canImport: () => !busy && !intake?.isBusy() && (!hasEdits() || globalThis.confirm('Tienes cambios sin guardar. ¿Descartarlos al agregar y continuar con este requerimiento?')),
    lock(locked) {
      importLocked = locked;
      if (locked) { epoch++; poller.stop(); selectionController?.abort(); }
      $('requirementSelect').disabled = locked;
      $('stageBody').inert = locked;
      $('reloadConflict').disabled = locked;
      navigation();
      if (!locked && data && !busy && !conflict) poller.start(data.flow.run, false);
    },
    reload: loadRequirements,
    select: id => { $('requirementSelect').value = id; return select(id, true); },
    notify: tell,
    render(state) {
      if (!$('azureResults')) return;
      $('azureResults').innerHTML = azureSearchMarkup(state);
      $('azureResults').setAttribute('aria-busy', String(state.loading || state.importing));
      $('azureQuery').disabled = state.importing;
      $('azureSearchButton').disabled = state.loading || state.importing;
    }
  });
  $('azureSearchForm')?.addEventListener('submit', event => { event.preventDefault(); return azure.search($('azureQuery').value); });
  $('azureQuery')?.addEventListener('input', () => { if (!$('azureQuery').value.trim()) return azure.search(''); });
  $('azureResults')?.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || importLocked) return;
    if (button.dataset.importId !== undefined) return azure.importItem(button.dataset.importId);
    if (button.dataset.offset !== undefined) return azure.search(azure.state.query, Number(button.dataset.offset));
  });
  $('requirementSelect').addEventListener('change', event => select(event.target.value));
  const editorChanged = event => { if (!event.target.closest?.('[data-onboarding-intake]')) dirty = true; if (event.target.matches?.('[data-azure-area]')) void syncAzureResponsibles(event.target.value.trim()); navigation(); };
  $('stageBody').addEventListener('input', editorChanged);
  $('stageBody').addEventListener('change', editorChanged);
  $('stageBody').addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const tracks = [...form.querySelectorAll('[data-track-id]')].map(row => ({ ...(row.dataset.trackId ? { id: row.dataset.trackId } : {}), ...Object.fromEntries(['technology', 'area', 'ownerEmail'].map(name => [name, row.querySelector(`[name="${name}"]`).value.trim()])) }));
    send(buildPayload(form.dataset.form, fields, tracks, data));
  });
  $('stageBody').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || busy || conflict || importLocked) return;
    if (button.hasAttribute('data-add-track')) {
      const rows = $('tracks').querySelectorAll('[data-track-id]');
      if (rows.length >= 8) { tell('Ya hay 8 frentes. Revisa o quita uno para añadir otro.'); return; }
      $('tracks').insertAdjacentHTML('beforeend', trackMarkup({}, rows.length)); dirty = true; navigation();
      $('tracks').lastElementChild.querySelector('input').focus();
    } else if (button.hasAttribute('data-remove-track')) {
      const rows = $('tracks').querySelectorAll('[data-track-id]');
      if (rows.length <= 1) { tell('Mantén al menos un frente. Puedes corregir su tecnología y responsable.'); return; }
      button.closest('[data-track-id]').remove();
      $('tracks').querySelectorAll('legend').forEach((legend, i) => { legend.textContent = `Frente ${i + 1}`; });
      dirty = true; navigation();
    } else if (button.dataset.action) {
      if (button.dataset.action === 'generate' && data.flow.artifact && !globalThis.confirm('Regenerar invalida la revisión, pruebas y firmas posteriores. ¿Continuar?')) return;
      send(buildPayload(button.dataset.action, {}, [], data));
    } else if (button.hasAttribute('data-copy')) {
      try { await navigator.clipboard.writeText($('megaPrompt').value); tell('Megaprompt copiado. No se ejecutó código.'); }
      catch { $('megaPrompt').focus(); $('megaPrompt').select(); tell('No se pudo acceder al portapapeles. El texto está seleccionado: cópialo con tu teclado.', true); }
    }
  });
  $('backButton').addEventListener('click', () => {
    if (busy || conflict || importLocked || !data || data.flow.stage === 0) return;
    if (dirty && !globalThis.confirm('Volver descartará los cambios sin guardar de esta etapa. ¿Continuar?')) return;
    send(buildPayload('back', {}, [], data));
  });
  $('nextButton').addEventListener('click', () => { if (nextGuard(data, busy || hasEdits() || intake?.isBusy() || conflict || importLocked)) send(buildPayload('next', {}, [], data)); });
  $('reloadConflict').addEventListener('click', () => {
    if (!importLocked && globalThis.confirm('La recarga descartará los campos no guardados. ¿Cargar la versión actual del servidor?')) { dirty = false; select(selectedId); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) poller.stop(); else if (data && !busy && !conflict && !importLocked) poller.start(data.flow.run, false); });
  globalThis.addEventListener('beforeunload', event => { if (hasEdits()) { event.preventDefault(); event.returnValue = ''; } });
  globalThis.addEventListener('pagehide', () => { poller.stop(); selectionController?.abort(); intake?.destroy(); answers?.destroy(); technologySuggestion?.destroy(); });
  (async () => {
    try {
      const items = await loadRequirements();
      if (!items) return;
      if (!items.length) { $('emptyPrompt').textContent = 'No hay requerimientos. Crea y enriquece uno en la bandeja para comenzar.'; return; }
      const prefill = new URLSearchParams(location.search).get('requirementId');
      if (prefill && items.some(r => r.id === prefill)) { $('requirementSelect').value = prefill; await select(prefill); }
      else if (prefill) tell('El requerimiento de la URL no está en tu bandeja. Selecciona uno disponible.', true);
    } catch (err) { $('requirementSelect').innerHTML = '<option value="">No se pudo cargar la bandeja</option>'; showError(err); }
  })();
}

if (typeof document !== 'undefined') mountWizard();

export function trackMarkup(track = {}, index = 0) {
  return `<fieldset class="track-row" data-track-id="${e(track.id || '')}"><legend>Frente ${index + 1}</legend>${field('Tecnología', 'technology', track.technology, 'text', 'required list="technologyOptions" placeholder="Selecciona o escribe"')}${field('Área', 'area', track.area, 'text', 'required list="areaOptions" placeholder="Área responsable" data-azure-area')}${field('Correo del responsable · Azure sincronizado', 'ownerEmail', track.ownerEmail, 'email', 'required list="azureResponsibleOptions" data-azure-responsible autocomplete="email"')}<button type="button" class="secondary remove-track" data-remove-track>Quitar frente</button></fieldset>`;
}
export function stageMarkup(data) {
  const { flow: f, context: c = {} } = data;
  const tracks = f.tracks || [], sources = c.sources || [], signatures = f.signatures || [];
  const versions = (c.versions || []).map(v => ({ ...v, label: `Versión ${v.version} · ${v.createdAt || v.id}` }));
  if (f.stage === 0) return `${!versions.length ? '<div class="notice" data-version-empty><strong>Este requerimiento aún no tiene una versión enriquecida.</strong><p>Completa el contexto y las fuentes aquí; después solicita el enriquecimiento explícitamente.</p></div>' : '<p>Selecciona una versión y revisa las preguntas antes de definir los frentes.</p>'}<form data-form="configure" class="editor"><label>Versión de partida<select name="versionId" required><option value="">Selecciona una versión</option>${options(versions, f.versionId)}</select></label><p class="hint" data-version-hint>Las nuevas versiones se añaden a esta lista. Selecciona y guarda explícitamente la que quieres usar.</p><button class="primary-button" ${!versions.length ? 'disabled' : ''}>Guardar versión de partida</button></form>${intakeMarkup(c.requirement)}`;
  if (f.stage === 1) return `<p>Separa cada tecnología de su área de trabajo y de la persona que revisará sus specs. Los responsables se consultan desde la última sincronización read-only de Azure DevOps al seleccionar un área; el guardado sigue siendo explícito y humano.</p><section class="technology-suggestion notice" data-technology-suggestion aria-label="Propuesta de tecnologías y responsables"></section><form data-form="configure" class="editor"><label>Versión seleccionada<select name="versionId" required>${options(versions, f.versionId)}</select></label><div id="tracks">${(tracks.length ? tracks : [{}]).map(trackMarkup).join('')}</div><p class="hint" data-azure-responsible-status>Selecciona un área para consultar responsables Azure sincronizados.</p><button type="button" class="secondary" data-add-track>Añadir frente (máximo 8)</button><div class="field-grid">${field('Responsable QA · correo', 'qaEmail', f.qaEmail, 'email', 'required')}${field('Responsable de negocio · correo', 'businessEmail', f.businessEmail, 'email', 'required')}</div><p class="hint">Guardar cambios de origen invalida revisiones y aceptaciones posteriores.</p><button class="primary-button">Guardar tecnologías y responsables</button></form><datalist id="technologyOptions"><option>Android</option><option>Web</option><option>Backend</option><option>iOS</option><option>.NET MAUI</option></datalist><datalist id="areaOptions"><option>Comercial</option><option>Operaciones</option><option>Logística</option><option>Integraciones</option></datalist><datalist id="azureResponsibleOptions"></datalist>`;
  if (f.stage === 2) {
    const artifact = f.artifact;
    const documents = (artifact?.specs || []).map(s => {
      const track = tracks.find(t => t.id === s.trackId);
      return `<details class="spec" open><summary>${e(track?.technology || s.trackId)} · ${e(track?.area || 'Área pendiente')}<span> · Responsable: ${e(track?.ownerEmail || 'Pendiente')}</span></summary><h4>${e(s.title || s.trackId)}</h4><pre>${e(s.content)}</pre></details>`;
    }).join('');
    return `<p>Hermes genera las specs reales de todos los frentes a partir del contexto guardado. <strong>IA propone; las personas aprueban.</strong> Los documentos generados no son software implementado.</p><div class="notice">Generar es una acción explícita. Regenerar invalida validaciones, pruebas y firmas posteriores.</div><button class="primary-button" data-action="generate" ${['queued', 'running'].includes(f.run?.status) ? 'disabled' : ''}>${artifact ? 'Regenerar todas las specs' : 'Generar todas las specs con Hermes'}</button><div class="record" role="status"><strong>Generación: ${e(f.run?.status || 'No iniciada')}</strong>${f.run?.error ? `<p>${e(f.run.error)}</p>` : ''}</div>${artifact ? `<p class="hint">Propuesta · Modelo: ${e(artifact.model)} · ${e(artifact.createdAt || '')}</p><p class="hash">Hash del artefacto: ${e(artifact.hash || artifact.id || 'Pendiente')}</p>${documents}` : empty('Aún no hay specs generadas. Inicia la generación para obtener una propuesta revisable.')}`;
  }
  if (f.stage === 3) return `<p>Comprueba automáticamente la estructura y trazabilidad documental mínima. La pertinencia de las reglas requiere revisión humana. Esta validación <strong>no ejecuta pruebas de software</strong> ni acredita que la funcionalidad esté implementada.</p><button class="primary-button" data-action="validate">Validar documentos</button>${f.validation ? `<article class="record"><h3>${f.validation.passed ? 'Validación documental superada' : 'Documentos por corregir'}</h3><p>Alcance: ${e(f.validation.scope)}</p><p class="hint">${e(f.validation.at)}</p><details ${f.validation.passed ? '' : 'open'}><summary>Ver ${(f.validation.checks || []).length} comprobaciones documentales</summary>${(f.validation.checks || []).map(check => `<p><strong>${check.passed ? '✓ Conforme' : '✕ Revisar'} · ${e(check.name)}</strong><br>${e(check.details)}</p>`).join('')}</details></article>` : empty('Todavía no se ha validado este paquete.')}`;
  if (f.stage === 4) return `<div class="notice"><strong>Reporte humano, no ejecución automática.</strong> Aquí no se ejecuta código. La persona reporta las pruebas realizadas; la evidencia no se verifica de forma independiente. Para avanzar, el servidor exige una prueba aprobada por cada frente.</div><form data-form="test" class="editor"><div class="field-grid"><label>Frente<select name="trackId" required>${options(tracks.map(t => ({ id: t.id, label: `${t.technology} · ${t.area}` })))}</select></label><label>Resultado reportado<select name="outcome"><option value="passed">Aprobada</option><option value="failed">Fallida</option><option value="blocked">Bloqueada</option></select></label></div>${text('Criterio de aceptación comprobado', 'criterion')}${text('Riesgo cubierto', 'risk')}${text('Pasos realizados', 'steps')}${text('Resultado esperado', 'expected')}${text('Resultado observado', 'actual')}<div class="field-grid">${field('Enlace de evidencia HTTPS (opcional)', 'evidenceUrl', '', 'url', 'pattern="https://.*" placeholder="https://…"')}<label>Fuente adjunta como evidencia (opcional)<select name="evidenceSourceId"><option value="">Sin fuente adjunta</option>${options(sources)}</select></label></div><label class="check"><input type="checkbox" name="attest" required>Confirmo que he realizado o revisado esta prueba y que el resultado y la evidencia que reporto son fieles a lo observado.</label><button class="primary-button">Registrar prueba reportada</button></form><h3>Reportes registrados</h3>${(f.tests || []).map(t => `<article class="record"><strong>${e(t.criterion)} · ${e(t.outcome)}</strong><p>Frente: ${e(t.trackId)} · Riesgo: ${e(t.risk)}</p><p>Pasos: ${e(t.steps)}</p><p>Esperado: ${e(t.expected)}</p><p>Observado: ${e(t.actual)}</p><p>Evidencia: ${e(t.evidenceUrl || t.evidenceSourceId || 'No adjunta')}</p><p class="hint">Reportado por ${e(t.reportedBy?.name)} · ${e(t.reportedBy?.email)} · ${e(t.reportedAt)}</p></article>`).join('') || empty('No hay reportes. Registra resultados por cada frente.')}`;
  if (f.stage === 5) {
    const owners = [...tracks.map(t => ({ roleId: `track:${t.id}`, label: `${t.technology} · ${t.area}`, email: t.ownerEmail })), { roleId: 'qa', label: 'QA', email: f.qaEmail }, { roleId: 'business', label: 'Negocio', email: f.businessEmail }];
    const ownerRows = owners.map(o => {
      const latest = signatures.filter(s => s.packageHash === data.packageHash && s.roleId === o.roleId && s.email?.toLowerCase() === o.email?.toLowerCase()).at(-1);
      return `<div class="record"><strong>${e(o.label)}</strong> · ${e(o.email || 'Sin asignar')}<p class="hint">${latest?.decision === 'approve' ? `Aceptaciones del hash actual: ${e(o.roleId)}` : 'Sin aceptación del hash actual'}</p></div>`;
    }).join('');
    return `<p>Aceptación interna de responsables autenticados. <strong>No es una firma digital cualificada ni un certificado legal.</strong> Se vincula al paquete exacto, su versión y las evidencias reportadas.</p><p class="hash">Hash actual: ${e(data.packageHash)}</p><h3>Responsables requeridos</h3>${ownerRows}
      <details class="spec"><summary>Revisar specs y evidencias antes de decidir</summary>${(f.artifact?.specs || []).map(s => `<h4>${e(s.title)}</h4><pre>${e(s.content)}</pre>`).join('')}<h4>Pruebas reportadas, no verificadas automáticamente</h4>${(f.tests || []).map(t => `<article class="record"><strong>${e(t.criterion)} · ${e(t.outcome)}</strong><p>${e(t.steps)}</p><p>Esperado: ${e(t.expected)}</p><p>Observado: ${e(t.actual)}</p><p>Evidencia: ${e(t.evidenceUrl || t.evidenceSourceId)}</p><p>${e(t.reportedBy?.name)} · ${e(t.reportedAt)}</p></article>`).join('')}</details>
      <p class="hint">Todos los roles requeridos deben aprobar el hash actual. Una aceptación de otro hash no es vigente. El servidor verifica cada rol y su aceptación.</p>${data.canSignRoles?.length ? `<form data-form="sign" class="editor"><input type="hidden" name="packageHash" value="${e(data.packageHash)}"><label>Rol autorizado de tu sesión<select name="roleId" required>${options(data.canSignRoles.map(r => ({ id: r.roleId, label: `${r.label} · ${r.email}` })))}</select></label><p>Sesión: ${e(data.user?.name)} · ${e(data.user?.email)}</p><label>Decisión<select name="decision"><option value="approve">Aceptar paquete</option><option value="return">Devolver para corrección</option></select></label>${text('Comentario', 'comment', false)}<label class="check"><input name="confirmSignature" type="checkbox" required>Confirmo mi decisión sobre esta versión, specs y evidencias con el hash indicado. Entiendo que es una aceptación interna autenticada, no una certificación legal.</label><button class="primary-button">Registrar mi decisión</button></form>` : empty('Tu sesión no tiene roles autorizados para firmar este paquete. Inicia sesión con el correo responsable.')}<h3>Historial de decisiones</h3>${signatures.map(s => `<article class="record"><strong>${s.packageHash === data.packageHash ? 'Vigente' : 'No vigente'} · ${e(s.decision === 'approve' ? 'Aceptación' : 'Devolución')}</strong><p>${e(s.roleId)} · ${e(s.name)} · ${e(s.email)}</p><p class="hash">${e(s.packageHash)}</p><p>${e(s.comment)}</p><p class="hint">${e(s.at)} · ${e(s.type || 'Aceptación interna')}</p></article>`).join('') || empty('Todavía no hay decisiones registradas.')}`;
  }
  const canDeliver = Boolean(data.megaPrompt) && data.megaPromptValidation?.passed !== false;
  return `<div class="notice"><strong>Entrega documental.</strong> Este paquete reúne specs y revisión de pruebas reportadas por usuarios. No acredita implementación, no aprueba CP automáticamente ni ejecuta código o despliegues.</div>
    ${data.megaPromptValidation ? `<article class="record"><h3>${data.megaPromptValidation.passed ? 'Megaprompt validado documentalmente' : 'Megaprompt pendiente de validación'}</h3><p>${e(data.megaPromptValidation.scope)}</p>${(data.megaPromptValidation.checks || []).map(check => `<p>${check.passed ? '✓' : '✕'} ${e(check.name)}</p>`).join('')}<p class="hash">SHA-256 del texto: ${e(data.megaPromptHash || 'pendiente')}</p></article>` : ''}
    <label>Megaprompt para entrega<textarea id="megaPrompt" readonly rows="18">${e(data.megaPrompt || '')}</textarea></label><div class="button-row"><button class="primary-button" data-copy ${!canDeliver ? 'disabled' : ''}>Copiar megaprompt</button>${canDeliver ? `<a class="ghost-link" href="/dashboard/api/requirements/${encodeURIComponent(c.requirement?.id || '')}/wizard/export" download>Descargar paquete de texto</a>` : '<span class="hint">Completa los controles vigentes para habilitar la descarga.</span>'}</div>`;
}
