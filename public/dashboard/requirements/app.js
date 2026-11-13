import { renderEnrichedVersion } from './enrichment-view.js';
import { renderWorkspace, initializeCollaboration } from './collaboration.js';
import { renderAnswersSection, initializeAnswers } from './answers.js';

const state = { requirements: [], sources: [], runs: [], questions: [], versions: [], qaPackages: [], selected: null, authConfigured: false, user: null };
const azureSearch = { items: [], offset: 0, hasMore: false, busy: false, filters: { q: '', project: '', state: '' } };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonHeaders = { 'content-type': 'application/json' };
initializeCollaboration({ api, getSelectedRequirement: () => state.requirements.find((item) => item.id === state.selected) || null });
initializeAnswers({ api, getSelectedRequirement: () => state.requirements.find((item) => item.id === state.selected) || null });

async function api(path, options) {
  const response = await fetch(`/dashboard/api/${path}`, options);
  if (response.status === 401) throw new Error('Tu sesión terminó. Usa Entrar con Azure para continuar.');
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function updateSourceInput() {
  const type = $('sourceType')?.value;
  const needsFile = ['document', 'transcription', 'image', 'video'].includes(type);
  const wrapper = $('sourceFileWrap');
  if (wrapper) wrapper.hidden = !needsFile;
  if ($('sourceFile')) $('sourceFile').required = needsFile;
}

document.addEventListener('change', (event) => {
  if (event.target.id === 'sourceType') updateSourceInput();
});

async function load() {
  const [requirements, sources, runs, questions, versions, qaPackages, auth] = await Promise.all(
    [...['requirements', 'requirementSources', 'enrichmentRuns', 'requirementQuestions', 'requirementVersions', 'qaPackages'].map((collection) => api(collection)), api('auth/status')]
  );
  Object.assign(state, {
    requirements: requirements.items,
    sources: sources.items,
    runs: runs.items,
    questions: questions.items,
    versions: versions.items,
    qaPackages: qaPackages.items,
    authConfigured: auth.configured === true,
    user: auth.user
  });
  render();
  updateSourceInput();
}

function render() {
  const counts = {
    total: state.requirements.length,
    questions: state.questions.filter((question) => question.status === 'open').length,
    qa: state.qaPackages.filter((item) => item.status !== 'approved').length,
    enriched: state.runs.length
  };
  $('reqKpis').innerHTML = [
    ['Requerimientos', counts.total, 'capturados', ''],
    ['Enriquecimientos', counts.enriched, 'historial de ejecuciones', 'purple'],
    ['Preguntas abiertas', counts.questions, 'requieren respuesta', 'warning'],
    ['Paquetes QA pendientes', counts.qa, 'sin aprobación humana', 'critical']
  ].map(([label, value, hint, tone]) => `<article class="kpi ${tone}"><span class="label">${label}</span><span class="value">${value}</span><span class="hint">${hint}</span></article>`).join('');
  $('reqCount').textContent = `${counts.total} registros`;

  $('reqList').innerHTML = state.requirements.length
    ? state.requirements.map((requirement) => `<article class="req-card ${state.selected === requirement.id ? 'active' : ''}" data-id="${esc(requirement.id)}"><h3>${esc(requirement.id)} · ${esc(requirement.title)}</h3><p>${esc(requirement.project)} · ${esc(requirement.owner || 'Sin owner')}</p><div class="req-meta"><span class="req-pill">${esc(requirement.status || 'Nuevo')}</span><span class="req-pill">${esc(requirement.priority || 'Media')}</span></div></article>`).join('')
    : '<div class="empty">Aún no hay requerimientos. Crea el primero.</div>';
  if (state.selected) renderDetail(state.requirements.find((requirement) => requirement.id === state.selected));
}

function renderDetail(requirement) {
  if (!requirement) {
    $('detailPanel').innerHTML = '<div class="empty">Selecciona un requerimiento.</div>';
    return;
  }
  const sources = state.sources.filter((source) => source.requirementId === requirement.id);
  const questions = state.questions.filter((question) => question.requirementId === requirement.id);
  const versions = state.versions.filter((version) => version.requirementId === requirement.id);
  const run = state.runs.find((item) => item.requirementId === requirement.id);
  const qa = state.qaPackages.find((item) => item.requirementId === requirement.id);
  const latest = [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0];
  const busy = run?.provider === 'hermes' && ['queued', 'running'].includes(run.status);
  $('detailPanel').innerHTML = `
    <div class="status-line"><div><h2>${esc(requirement.id)} · ${esc(requirement.title)}</h2><p class="muted">${esc(requirement.project)} · creado ${esc(requirement.createdAt || '')}</p></div><span class="req-pill ${requirement.status === 'Preguntas' ? 'pending' : 'good'}">${esc(requirement.status || 'Nuevo')}</span></div>
    <div class="req-actions"><button class="primary-button" data-action="enrich" data-id="${esc(requirement.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Hermes está trabajando…' : run?.status === 'failed' ? 'Reintentar con Hermes' : 'Enriquecer con Hermes'}</button><span id="enrichmentProgress" class="muted" role="status" aria-live="polite">${esc(busy ? `${run.status === 'queued' ? 'En cola' : 'En ejecución'} · ${run.phase || 'Esperando worker'}` : run?.error || `Resultado: ${run?.resultLabel || 'PENDIENTE'}`)}</span></div>
    <p class="muted">Hermes propone con el contexto de este requerimiento y el método CP0/CP1 del Ecosistema de IA. No aprueba, no despliega y no modifica Azure. Las fuentes no extraídas quedan pendientes.</p>
    <p><a class="ghost-link" href="/dashboard/requirements/onboarding?requirementId=${encodeURIComponent(requirement.id)}">Abrir guía paso a paso: specs, evidencias y responsables →</a></p>
    <div class="detail-block"><h3>Contexto</h3><p>${esc(requirement.description || 'Sin descripción')}</p></div>
    ${renderWorkspace(requirement)}
    <div class="detail-block"><h3>Fuentes y anexos del dashboard (${sources.length})</h3><p class="muted">Los archivos cargados aquí son locales: no se suben a Azure. Para los originales del ticket, consulta la sección Adjuntos en Azure DevOps.</p>
      <div class="source-box"><form id="sourceForm" data-requirement-id="${esc(requirement.id)}"><label><strong>Subir archivos</strong><span class="muted"> Cualquier formato · múltiples archivos · hasta 50 MB por envío</span><input id="sourceFiles" name="files" type="file" multiple /></label><button class="secondary" type="submit">Agregar archivos</button><span id="sourceMsg" class="muted"></span></form></div>
      <div class="source-box"><form id="urlForm" data-requirement-id="${esc(requirement.id)}"><label><strong>Agregar URL</strong><span class="muted"> Teams, nube, video, documento o página pública/protegida</span><div class="url-row"><input name="url" type="url" required placeholder="https://..." /><select name="type"><option value="teams-url">Teams</option><option value="document">Documento</option><option value="transcription">Transcripción</option><option value="video">Video</option><option value="other-url">Otra URL</option></select><button class="secondary" type="submit">Agregar URL</button></div></label><span id="urlMsg" class="muted"></span></form></div>
      ${sources.length ? `<ul>${sources.map((source) => `<li><strong>${esc(source.name || source.url || 'fuente')}</strong> · ${esc(source.type)} · ${source.size ? esc(formatBytes(source.size)) : ''} · ${esc(source.status || 'registrada')}${sourceLink(source.url) ? ` · <a href="${esc(sourceLink(source.url))}" target="_blank" rel="noopener noreferrer">Abrir URL</a>` : ''}${source.storageKey ? ` · <a href="/dashboard/api/requirements/${encodeURIComponent(requirement.id)}/sources/${encodeURIComponent(source.id)}/download">Descargar archivo local</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Todavía no hay fuentes agregadas.</p>'}
    </div>
    ${renderAnswersSection(requirement)}
    <div class="detail-block"><h3>Versiones y QA</h3><p>${latest ? `Última versión: ${esc(latest.version)} · criterios: ${latest.acceptanceCriteria?.length || 0} · escenarios: ${latest.testScenarios?.length || 0}` : 'Sin versión enriquecida.'}</p><p>${qa ? `Paquete QA: ${esc(qa.status)} · preguntas abiertas: ${esc(qa.openQuestions)} · las pruebas aún NO se han ejecutado.` : 'Paquete QA aún no generado.'}</p></div>
    ${renderEnrichedVersion(latest)}`;
  document.dispatchEvent(new CustomEvent('requirement-workspace-change', { detail: { id: requirement.id, title: requirement.title } }));
}

function sourceLink(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}

function azureLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'dev.azure.com' || url.hostname.endsWith('.visualstudio.com')) ? url.href : ''; }
  catch { return ''; }
}

async function searchAzure(offset = 0) {
  if (azureSearch.busy) return;
  azureSearch.busy = true;
  $('azureSearchButton').disabled = true;
  $('azurePrevious').disabled = true;
  $('azureNext').disabled = true;
  $('azureSearchStatus').textContent = 'Buscando en los datos sincronizados de Azure…';
  $('azureResults').replaceChildren();
  $('azurePageInfo').textContent = '';
  try {
    const params = new URLSearchParams({ ...azureSearch.filters, offset, limit: 20 });
    const result = await api(`azure/work-items?${params}`);
    Object.assign(azureSearch, { items: result.items, offset: result.offset, hasMore: result.hasMore });
    for (const [id, values, label] of [['azureProject', result.projects, 'Todos los proyectos'], ['azureState', result.states, 'Todos los estados']]) {
      const value = $(id).value;
      $(id).innerHTML = `<option value="">${label}</option>` + values.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join('');
      $(id).value = value;
    }
    $('azureSyncInfo').textContent = result.syncedAt
      ? `Última sincronización: ${new Date(result.syncedAt).toLocaleString('es')}. Consulta de solo lectura; no es una búsqueda en tiempo real.`
      : 'Aún no hay una sincronización de Azure registrada. No es una búsqueda en tiempo real.';
    $('azureSearchStatus').textContent = result.total ? `${result.total} resultado(s).` : 'Sin resultados. Prueba otro ID, título, responsable o filtro.';
    $('azureResults').innerHTML = result.items.map((item) => {
      const url = azureLink(item.url);
      return `<article class="azure-result"><h3>#${esc(item.azureId)} · ${esc(item.title)}</h3><p class="muted">${esc(item.project)} · ${esc(item.type)} · ${esc(item.state)} · ${esc(item.assignedTo || 'Sin responsable')}</p><div class="req-actions">${url ? `<a class="ghost-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir en Azure</a>` : ''}<button class="secondary" type="button" data-use-azure="${esc(item.id)}">Usar como requerimiento</button></div></article>`;
    }).join('');
    $('azurePageInfo').textContent = result.total ? `${result.offset + 1}–${result.offset + result.items.length} de ${result.total}` : '0 resultados';
    $('azurePrevious').disabled = result.offset === 0;
    $('azureNext').disabled = !result.hasMore;
  } catch (error) {
    azureSearch.items = [];
    $('azureSearchStatus').textContent = `No se pudo buscar: ${error.message}`;
  } finally {
    azureSearch.busy = false;
    $('azureSearchButton').disabled = false;
  }
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('#azurePrevious')) { await searchAzure(Math.max(0, azureSearch.offset - 20)); return; }
  if (event.target.closest('#azureNext')) { await searchAzure(azureSearch.offset + 20); return; }
  const useAzure = event.target.closest('[data-use-azure]');
  if (useAzure) {
    const item = azureSearch.items.find((entry) => entry.id === useAzure.dataset.useAzure);
    if (!item) return;
    const form = $('reqForm');
    if ([...form.querySelectorAll('input:not([type=file]), textarea')].some((field) => field.value.trim()) && !confirm('¿Reemplazar los datos del formulario con este registro de Azure?')) return;
    form.reset();
    form.elements.namedItem('title').value = item.title || '';
    form.elements.namedItem('project').value = item.project || '';
    form.elements.namedItem('description').value = `Origen Azure DevOps #${item.azureId}\nTipo: ${item.type}\nEstado: ${item.state}\nResponsable: ${item.assignedTo || 'Sin responsable'}\n${item.title}`;
    form.elements.namedItem('sourceUrl').value = azureLink(item.url);
    $('sourceType').value = 'other-url';
    updateSourceInput();
    $('formMsg').textContent = `Datos de Azure #${item.azureId} preparados. Revisa y pulsa Crear requerimiento; aún no se ha guardado.`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.namedItem('title').focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('[data-action="open-demo"]')) { state.selected = 'REQ-DEMO-001'; render(); document.getElementById('detailPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const card = event.target.closest('.req-card');
  if (card) { state.selected = card.dataset.id; render(); return; }
  const button = event.target.closest('[data-action="enrich"]');
  if (!button) return;
  button.disabled = true;
  try { await api(`requirements/${encodeURIComponent(button.dataset.id)}/enrich`, { method: 'POST', headers: jsonHeaders }); await load(); }
  catch (error) { alert(`No se pudo enriquecer: ${error.message}`); button.disabled = false; }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'azureSearchForm') {
    event.preventDefault();
    if (azureSearch.busy) return;
    azureSearch.filters = { q: $('azureQuery').value.trim(), project: $('azureProject').value, state: $('azureState').value };
    await searchAzure();
    return;
  }
  if (event.target.id === 'sourceForm') {
    event.preventDefault();
    const form = event.target; const files = $('sourceFiles').files;
    if (!files.length) { $('sourceMsg').textContent = 'Selecciona al menos un archivo.'; return; }
    const payload = new FormData(); for (const file of files) payload.append('files', file, file.name);
    $('sourceMsg').textContent = 'Subiendo archivos...';
    try { const result = await api(`requirements/${encodeURIComponent(form.dataset.requirementId)}/sources`, { method: 'POST', body: payload }); $('sourceMsg').textContent = `${result.items.length} archivo(s) agregado(s)`; await load(); }
    catch (error) { $('sourceMsg').textContent = `No disponible: ${error.message}`; }
  }
  if (event.target.id === 'urlForm') {
    event.preventDefault();
    const form = event.target; const data = new FormData(form); $('urlMsg').textContent = 'Registrando URL...';
    try { await api(`requirements/${encodeURIComponent(form.dataset.requirementId)}/sources-url`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ requirementId: form.dataset.requirementId, type: data.get('type'), url: data.get('url'), name: data.get('url'), status: 'registered' }) }); $('urlMsg').textContent = 'URL agregada'; form.reset(); await load(); }
    catch (error) { $('urlMsg').textContent = `No disponible: ${error.message}`; }
  }
  if (event.target.id === 'reqForm') {
    event.preventDefault(); const form = event.target; const data = new FormData(form); const selectedFile = $('sourceFile')?.files?.[0];
    try {
      const result = await api('requirements', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ title: data.get('title'), project: data.get('project'), priority: data.get('priority'), description: data.get('description'), status: 'Nuevo', owner: state.user?.name || state.user?.email || 'Sin owner', initiativeId: 'REQ-FLOW' }) });
      const sourceUrl = data.get('sourceUrl'); const sourceType = data.get('sourceType');
      if (sourceUrl) await api('requirementSources', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ requirementId: result.item.id, type: sourceType, url: sourceUrl, name: sourceUrl, status: 'registered' }) });
      if (selectedFile) { const payload = new FormData(); payload.append('files', selectedFile, selectedFile.name); await api(`requirements/${encodeURIComponent(result.item.id)}/sources`, { method: 'POST', body: payload }); }
      state.selected = result.item.id; form.reset(); updateSourceInput(); $('formMsg').textContent = `Creado ${result.item.id}`; await load();
    } catch (error) { $('formMsg').textContent = `No disponible: ${error.message}`; }
  }
});

load().catch((error) => { $('detailPanel').innerHTML = `<div class="empty">Error API: ${esc(error.message)}</div>`; });
searchAzure();

let checkingEnrichment = false;
setInterval(async () => {
  if (checkingEnrichment) return;
  const pending = state.runs.filter((run) => run.provider === 'hermes' && ['queued', 'running'].includes(run.status));
  if (!pending.length) return;
  checkingEnrichment = true;
  try {
    let finished = false;
    for (const previous of pending) {
      const { run } = await api(`requirements/${encodeURIComponent(previous.requirementId)}/enrichment`);
      if (run && !['queued', 'running'].includes(run.status)) finished = true;
      else if (state.selected === previous.requirementId && $('enrichmentProgress')) $('enrichmentProgress').textContent = `${run?.status === 'running' ? 'En ejecución' : 'En cola'} · ${run?.phase || 'Esperando worker'}`;
    }
    if (finished) await load();
  } catch (error) { if ($('enrichmentProgress')) $('enrichmentProgress').textContent = error.message; }
  finally { checkingEnrichment = false; }
}, 5000);
