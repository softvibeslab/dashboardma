const columns = [
  ['new', 'Nuevo ticket', 'Captura inicial'],
  ['media', 'Medios', 'Anexos y URLs'],
  ['questions', 'Preguntas', 'Aclaraciones'],
  ['document', 'Documento enriquecido', 'Versión lista para validar'],
  ['tests', 'Criterios y escenarios', 'Criterios, pruebas y datos'],
  ['qa', 'QA', 'Validación y evidencia'],
  ['done', 'Finalizado', 'Listo para desarrollo']
];
const state = { requirements: [], sources: [], questions: [], versions: [], qaPackages: [], runs: [], selected: null };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonHeaders = { 'content-type': 'application/json' };

async function api(path, options) {
  const response = await fetch(`/dashboard/api/${path}`, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
function stageFor(requirement) {
  if (requirement.status === 'Cerrado' || requirement.status === 'Finalizado') return 'done';
  if (requirement.status === 'QA') return 'qa';
  if (requirement.status === 'Validación 2' || requirement.status === 'Validación 1') return 'tests';
  if (requirement.status === 'Preguntas') return 'questions';
  if (['Enriqueciendo', 'Documento enriquecido'].includes(requirement.status) || requirement.currentVersionId) return 'document';
  if (requirement.status === 'Anexos' || requirement.status === 'Medios') return 'media';
  if (state.sources.some((source) => source.requirementId === requirement.id)) return 'media';
  return 'new';
}
async function load() {
  const responses = await Promise.all(['requirements', 'requirementSources', 'requirementQuestions', 'requirementVersions', 'qaPackages', 'enrichmentRuns'].map((collection) => api(collection)));
  [state.requirements, state.sources, state.questions, state.versions, state.qaPackages, state.runs] = responses.map((response) => response.items);
  renderBoard();
  if (state.selected) openDrawer(state.selected);
}
function renderBoard() {
  const grouped = Object.fromEntries(columns.map(([key]) => [key, []]));
  state.requirements.forEach((requirement) => grouped[stageFor(requirement)].push(requirement));
  $('flowSummary').textContent = `${state.requirements.length} requerimiento(s) · ${state.sources.length} fuente(s)`;
  $('flowBoard').innerHTML = columns.map(([key, label, hint]) => `<section class="flow-col" data-stage="${key}"><header class="flow-col-head"><h2>${label} <span class="flow-count">${grouped[key].length}</span></h2><span>${hint}</span><small class="drop-hint">Suelta aquí</small></header><div class="flow-cards">${grouped[key].length ? grouped[key].map(card).join('') : '<p class="muted" style="padding:12px">Sin tarjetas</p>'}</div></section>`).join('');
}
function card(requirement) {
  const sources = state.sources.filter((source) => source.requirementId === requirement.id).length;
  const questions = state.questions.filter((question) => question.requirementId === requirement.id && question.status === 'open').length;
  return `<article class="flow-card" draggable="true" data-id="${esc(requirement.id)}"><h3>${esc(requirement.id)} · ${esc(requirement.title)}</h3><p>${esc(requirement.project || 'Sin proyecto')}</p><p>${esc(requirement.owner || 'Sin owner')}</p><div class="card-foot"><span class="req-pill">${esc(requirement.status || 'Nuevo')}</span><span class="muted">${sources} fuente(s) · ${questions} pregunta(s)</span></div><small class="drag-label">⋮⋮ Arrastra para mover</small></article>`;
}
function openDrawer(id) {
  const requirement = state.requirements.find((item) => item.id === id); if (!requirement) return;
  state.selected = id; const sources = state.sources.filter((source) => source.requirementId === id); const questions = state.questions.filter((question) => question.requirementId === id); const version = state.versions.find((item) => item.requirementId === id); const qa = state.qaPackages.find((item) => item.requirementId === id); const run = state.runs.find((item) => item.requirementId === id);
  $('drawerContent').innerHTML = `<div class="drawer-top"><div><h2>${esc(requirement.id)}</h2><p class="muted">${esc(requirement.title)}</p></div><button class="close-btn" data-action="close">Cerrar</button></div><div class="drawer-section"><span class="req-pill">${esc(requirement.status || 'Nuevo')}</span><p>${esc(requirement.description || 'Sin descripción')}</p><p class="muted">Owner: ${esc(requirement.owner || 'Sin owner')} · Proyecto: ${esc(requirement.project || 'Sin proyecto')}</p></div><div class="drawer-section"><h3>Adjuntar archivos</h3><div class="attach-box"><div class="notice">Cualquier formato · múltiples archivos · hasta 50 MB por envío. Requiere login Azure para guardar.</div><form id="flowFileForm" data-id="${esc(id)}"><input id="flowFiles" type="file" multiple /><button class="secondary" type="submit">Agregar archivos</button><span id="flowFileMsg" class="muted"></span></form></div></div><div class="drawer-section"><h3>Agregar URL</h3><div class="attach-box"><form id="flowUrlForm" data-id="${esc(id)}"><input name="url" type="url" required placeholder="https://..." /><select name="type"><option value="teams-url">Teams</option><option value="document">Documento</option><option value="transcription">Transcripción</option><option value="video">Video</option><option value="other-url">Otra URL</option></select><button class="secondary" type="submit">Guardar URL</button><span id="flowUrlMsg" class="muted"></span></form></div></div><div class="drawer-section"><h3>Fuentes (${sources.length})</h3>${sources.length ? `<ul class="source-list">${sources.map((source) => `<li><strong>${esc(source.name || source.url || 'fuente')}</strong><br><span class="muted">${esc(source.type)} · ${esc(source.status || 'registrada')}</span>${source.url ? ` · <a href="${esc(source.url)}" target="_blank" rel="noreferrer">abrir</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sin fuentes todavía.</p>'}</div><div class="drawer-section"><h3>Estado del enriquecimiento</h3><p class="muted">Resultado: ${esc(run?.resultLabel || 'pendiente')} · versión: ${esc(version?.version || '—')} · QA: ${esc(qa?.status || 'pendiente')}</p><p>${questions.length ? `${questions.filter((question) => question.status === 'open').length} pregunta(s) pendiente(s)` : 'Sin preguntas registradas'}</p></div>`;
  $('drawerContent').insertAdjacentHTML('beforeend', `<div class="drawer-section"><a class="primary-button" href="/dashboard/requirements/onboarding?requirementId=${encodeURIComponent(id)}">Abrir guía paso a paso →</a><p class="muted">Specs por tecnología y área, validación documental, evidencias y aceptación de responsables.</p></div>`);
  $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); state.selected = null; }
function statusForStage(stage) { return { new: 'Nuevo', media: 'Anexos', questions: 'Preguntas', document: 'Documento enriquecido', tests: 'Validación 1', qa: 'QA', done: 'Cerrado' }[stage] || 'Nuevo'; }
document.addEventListener('dragstart', (event) => { const cardElement = event.target.closest('.flow-card'); if (!cardElement) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', cardElement.dataset.id); cardElement.classList.add('dragging'); });
document.addEventListener('dragend', (event) => { event.target.closest('.flow-card')?.classList.remove('dragging'); document.querySelectorAll('.flow-col.drag-over').forEach((column) => column.classList.remove('drag-over')); });
document.addEventListener('dragover', (event) => { const column = event.target.closest('.flow-col'); if (!column) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('drag-over'); });
document.addEventListener('dragleave', (event) => { const column = event.target.closest('.flow-col'); if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over'); });
document.addEventListener('drop', async (event) => { const column = event.target.closest('.flow-col'); if (!column) return; event.preventDefault(); column.classList.remove('drag-over'); const id = event.dataTransfer.getData('text/plain'); const requirement = state.requirements.find((item) => item.id === id); if (!requirement) return; const nextStatus = statusForStage(column.dataset.stage); if (requirement.status === nextStatus) return; try { await api(`requirements/${encodeURIComponent(id)}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ status: nextStatus }) }); await load(); } catch (error) { alert(`No se pudo mover el requerimiento: ${error.message}`); } });
document.addEventListener('click', (event) => { const cardElement = event.target.closest('.flow-card'); if (cardElement) openDrawer(cardElement.dataset.id); if (event.target.closest('[data-action="close"]') || event.target === $('drawer')) closeDrawer(); });
document.addEventListener('submit', async (event) => {
  if (event.target.id === 'flowFileForm') { event.preventDefault(); const form = event.target; const files = $('flowFiles').files; if (!files.length) return; const payload = new FormData(); for (const file of files) payload.append('files', file, file.name); $('flowFileMsg').textContent = 'Subiendo...'; try { const result = await api(`requirements/${encodeURIComponent(form.dataset.id)}/sources`, { method: 'POST', body: payload }); $('flowFileMsg').textContent = `${result.items.length} archivo(s) agregado(s)`; await load(); } catch (error) { $('flowFileMsg').textContent = `No disponible: ${error.message}`; } }
  if (event.target.id === 'flowUrlForm') { event.preventDefault(); const form = event.target; const data = new FormData(form); $('flowUrlMsg').textContent = 'Guardando...'; try { await api(`requirements/${encodeURIComponent(form.dataset.id)}/sources-url`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ requirementId: form.dataset.id, type: data.get('type'), url: data.get('url'), name: data.get('url'), status: 'registered' }) }); $('flowUrlMsg').textContent = 'URL agregada'; form.reset(); await load(); } catch (error) { $('flowUrlMsg').textContent = `No disponible: ${error.message}`; } }
});
load().catch((error) => { $('flowBoard').innerHTML = `<div class="empty">Error API: ${esc(error.message)}</div>`; });
