const stages = [
  ['Reportado Azure', 'intake / backlog', 'CP0'],
  ['CP1 Análisis', 'reglas y criterios', 'CP1'],
  ['CP2 Spec', 'arquitectura / QA', 'CP2'],
  ['CP3 Dev', 'ramas / PR / unitarias', 'CP3'],
  ['CP4 QA', 'funcional / UX / regresión', 'CP4'],
  ['DevOps', 'pipeline / release', 'CP5'],
  ['Negocio', 'aceptación', 'Negocio']
];
const state = {};

async function api(path, options) {
  const res = await fetch(`/dashboard/api/${path}`, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
const el = (id) => document.getElementById(id);
const jsonHeaders = () => ({ 'content-type': 'application/json' });
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function riskClass(risk) { const r = String(risk || '').toLowerCase(); if (r.includes('alto')) return 'risk-high'; if (r.includes('bajo')) return 'risk-low'; return 'risk-medium'; }
function stagePillClass(stage, status = '') { const text = `${stage} ${status}`.toLowerCase(); if (text.includes('qa')) return 'qa'; if (text.includes('devops')) return 'devops'; if (text.includes('bloque')) return 'blocked'; if (text.includes('producción') || text.includes('monitoreo')) return 'monitor'; return ''; }

async function load() {
  const [health, summary, initiatives, workItems, gates, handoffs, risks, activities, users, assignments] = await Promise.all([
    api('health'), api('summary'), api('initiatives'), api('workItems'), api('gates'), api('handoffs'), api('risks'), api('activities'), api('users'), api('assignments')
  ]);
  Object.assign(state, { health, summary, initiatives: initiatives.items, workItems: workItems.items, gates: gates.items, handoffs: handoffs.items, risks: risks.items, activities: activities.items, users: users.items, assignments: assignments.items });
  render();
}

function render() {
  renderKpis(); renderFlow(); renderInitiatives(); renderHandoffs(); renderModuleDetails(); renderTraceability(); renderQa(); renderGates(); renderRisks(); renderUsers(); renderAssignments(); renderActivities(); fillAssignmentSelectors(); renderUsersModuleKpis();
}

function renderKpis() {
  if (!el('kpis')) return;
  const s = state.summary;
  const blocked = state.initiatives.filter((i) => /bloque/i.test(i.status)).length || state.handoffs.filter((h) => /bloque/i.test(h.status)).length;
  const traceComplete = s.traceability.length ? Math.round((s.traceability.filter((t) => t.complete).length / s.traceability.length) * 100) : 0;
  const lead = '12.4d';
  const cards = [
    ['Iniciativas activas', s.counts.initiatives, '+6 esta semana', ''],
    ['Bloqueadas', blocked, 'por definición funcional', 'critical'],
    ['Lead time prom.', lead, 'objetivo: < 14d', ''],
    ['Bugs críticos', s.quality.criticalBugs, `${s.quality.openBugs} abiertos`, 'warning'],
    ['Trazabilidad completa', `${traceComplete}%`, 'HU → QA → Release', 'good'],
    ['Gates pendientes', s.quality.pendingGates, `QA: ${Math.max(0, s.quality.pendingGates - 1)} · Negocio: 1`, 'purple']
  ];
  el('kpis').innerHTML = cards.map(([label, value, hint, tone]) => `<article class="kpi ${tone}"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span><span class="hint">${escapeHtml(hint)}</span></article>`).join('');
}

function renderFlow() {
  if (!el('flow')) return;
  el('flow').innerHTML = stages.map(([label, sub, key]) => {
    const count = key === 'Negocio'
      ? state.handoffs.filter((h) => /Negocio|Business/i.test(`${h.to} ${h.role || ''}`)).length
      : state.initiatives.filter((i) => i.stage === key || (key === 'CP5' && /Producción|DevOps/i.test(i.stage))).length;
    const pct = Math.max(8, Math.min(92, count * 22));
    return `<article class="stage-card"><strong>${escapeHtml(label)}</strong><span class="stage-num">${count}</span><small>${escapeHtml(sub)}</small><div class="progress"><span style="width:${pct}%"></span></div></article>`;
  }).join('');
}

function renderInitiatives() {
  if (!el('initiatives')) return;
  el('initiatives').innerHTML = state.initiatives.map((i) => {
    const nextGate = state.gates.find((g) => g.initiativeId === i.id && g.result !== 'Aprobado') || state.gates.find((g) => g.initiativeId === i.id);
    return `<tr><td class="id-link">${escapeHtml(i.id)}</td><td>${escapeHtml(i.title)}</td><td><span class="pill ${stagePillClass(i.stage, i.status)}">${escapeHtml(i.stage)}</span></td><td>${escapeHtml(i.owner)}</td><td class="${riskClass(i.risk)}">${escapeHtml(i.risk)}</td><td>${escapeHtml(nextGate?.name || 'Por definir')}</td></tr>`;
  }).join('');
}

function renderHandoffs() {
  if (!el('handoffs')) return;
  const colors = ['red', 'yellow', 'blue', 'green'];
  const items = state.handoffs.map((h, index) => `<div class="alert-item"><span class="dot ${colors[index % colors.length]}"></span><div><strong>${escapeHtml(h.initiativeId)} ${escapeHtml(h.status).toLowerCase()} · ${escapeHtml(h.from)} → ${escapeHtml(h.to)}</strong><span>${escapeHtml(h.comments || `${h.slaHours || 24}h SLA operativo`)}</span></div></div>`);
  if (!items.length) items.push('<div class="alert-item"><span class="dot green"></span><div><strong>Sin handoffs bloqueados</strong><span>Flujo operativo estable.</span></div></div>');
  el('handoffs').innerHTML = items.join('');
}

function renderModuleDetails() {
  if (!el('moduleDetails')) return;
  const modules = state.summary.modules || [];
  el('moduleDetails').innerHTML = modules.map((module) => {
    const metrics = Object.entries(module.metrics || {}).map(([key, value]) => `<span><strong>${escapeHtml(value)}</strong>${escapeHtml(labelize(key))}</span>`).join('');
    const details = (module.details || []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join('');
    return `<article class="module-card"><div class="module-title"><strong>${escapeHtml(module.title)}</strong><span>${escapeHtml(module.status)}</span></div><p>${escapeHtml(module.owner)}</p><div class="module-metrics">${metrics}</div><ul>${details}</ul></article>`;
  }).join('');
}

function labelize(key) { return String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()); }

function renderTraceability() {
  if (!el('traceability')) return;
  const focus = state.summary.traceability[0] || { initiativeId: '—', workItems: 0, gates: 0, evidences: 0, risks: 0 };
  const bugs = state.workItems.filter((w) => w.initiativeId === focus.initiativeId && w.type === 'Bug').length;
  const nodes = [
    ['Req.', focus.initiativeId], ['HU', `${focus.workItems} items`], ['Tareas', `${Math.max(0, focus.workItems - bugs)} abiertas`], ['PR', 'por conectar'], ['QA', `${focus.gates} gates`],
    ['Evidencia', `${focus.evidences} archivos`], ['Bugs', `${bugs} abiertos`], ['Release', 'pendiente'], ['Negocio', 'no revisado'], ['Valor', 'por medir']
  ];
  el('traceability').innerHTML = nodes.map(([a, b]) => `<div class="trace-node"><div><strong>${escapeHtml(a)}</strong><span>${escapeHtml(b)}</span></div></div>`).join('');
}

function renderQa() {
  if (!el('qaCards')) return;
  const bugs = state.workItems.filter((w) => w.type === 'Bug');
  el('qaCards').innerHTML = [
    ['Defectos rastreados', `${bugs.length} bugs · ${state.summary.quality.openBugs} abiertos`],
    ['Evidencia disponible', `${state.summary.counts.evidences} registros`],
    ['Gates QA/validación', `${state.summary.quality.pendingGates} pendientes`]
  ].map(metricCard).join('');
}
function renderGates() { if (!el('gates')) return; el('gates').innerHTML = state.gates.map((g) => metricCard([g.name, `${g.initiativeId} · ${g.result} · ${g.owner}`])).join(''); }
function renderRisks() { if (!el('risks')) return; el('risks').innerHTML = state.risks.map((r) => metricCard([r.title, `${r.initiativeId} · ${r.severity} · ${r.owner}`])).join(''); }
function metricCard([title, detail]) { return `<article class="metric-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></article>`; }


function renderUsersModuleKpis() {
  if (!el('usersCount')) return;
  const azure = state.users.filter((u) => u.syncSource === 'azure-devops').length;
  el('usersCount').textContent = state.users.length;
  el('assignmentsCount').textContent = state.assignments.length;
  el('azureUsersCount').textContent = azure;
  if (el('azureSyncAt')) {
    const sync = state.summary.azureSync;
    el('azureSyncAt').textContent = sync?.syncedAt ? new Date(sync.syncedAt).toLocaleString('es-CO') : 'sin sync';
  }
}

function renderUsers() {
  if (!el('users')) return;
  el('users').innerHTML = state.users.map((u) => {
    const assigned = state.assignments.filter((a) => a.userId === u.id && a.status !== 'Completada').reduce((sum, a) => sum + Number(a.allocation || 0), 0);
    return `<article class="mini-card"><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.role)} · ${escapeHtml(u.team)} · ${assigned}/${u.capacity || 0}% asignado</span><div class="card-actions"><button class="secondary" data-action="toggle-user" data-id="${escapeHtml(u.id)}">${u.status === 'Activo' ? 'Pausar' : 'Activar'}</button><button class="danger-btn" data-action="delete-user" data-id="${escapeHtml(u.id)}">Eliminar</button></div></article>`;
  }).join('');
}
function renderAssignments() {
  if (!el('assignments')) return;
  const usersById = new Map(state.users.map((u) => [u.id, u]));
  const initiativesById = new Map(state.initiatives.map((i) => [i.id, i]));
  el('assignments').innerHTML = state.assignments.map((a) => `<article class="mini-card"><strong>${escapeHtml(usersById.get(a.userId)?.name || a.userId)} → ${escapeHtml(initiativesById.get(a.initiativeId)?.title || a.initiativeId)}</strong><span>${escapeHtml(a.role)} · ${escapeHtml(a.workItemId)} · ${a.allocation || 0}% · ${escapeHtml(a.status)}</span><div class="card-actions"><button class="secondary" data-action="complete-assignment" data-id="${escapeHtml(a.id)}">Completar</button><button class="danger-btn" data-action="delete-assignment" data-id="${escapeHtml(a.id)}">Eliminar</button></div></article>`).join('');
}
function fillAssignmentSelectors() {
  const form = el('assignmentForm'); if (!form) return;
  form.userId.innerHTML = state.users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} · ${escapeHtml(u.team)}</option>`).join('');
  form.initiativeId.innerHTML = state.initiatives.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.id)} · ${escapeHtml(i.title)}</option>`).join('');
  form.workItemId.innerHTML = state.workItems.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.id)} · ${escapeHtml(w.title)}</option>`).join('');
}
function renderActivities() { if (!el('activities')) return; el('activities').innerHTML = state.activities.slice(0, 8).map((a) => `<div class="event"><strong>${escapeHtml(a.actor)} · ${escapeHtml(a.type)}</strong><span>${escapeHtml(a.message)}</span></div>`).join(''); }

if (el('activityForm')) el('activityForm').addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await api('activities', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ initiativeId: 'INI-001', type: 'manual-update', message: data.get('message'), actor: data.get('actor') }) }); event.currentTarget.reset(); await load(); });
if (el('userForm')) el('userForm').addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await api('users', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: data.get('name'), role: data.get('role'), team: data.get('team'), status: 'Activo', capacity: Number(data.get('capacity')) }) }); event.currentTarget.reset(); await load(); });
if (el('assignmentForm')) el('assignmentForm').addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await api('assignments', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ userId: data.get('userId'), initiativeId: data.get('initiativeId'), workItemId: data.get('workItemId'), role: data.get('role'), allocation: Number(data.get('allocation')), status: 'Activa' }) }); event.currentTarget.reset(); await load(); });
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'toggle-user') { const user = state.users.find((u) => u.id === id); await api(`users/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ status: user.status === 'Activo' ? 'Pausado' : 'Activo' }) }); }
  if (action === 'delete-user') await api(`users/${id}`, { method: 'DELETE' });
  if (action === 'complete-assignment') await api(`assignments/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ status: 'Completada', allocation: 0 }) });
  if (action === 'delete-assignment') await api(`assignments/${id}`, { method: 'DELETE' });
  await load();
});
load().catch((error) => { document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#fee2e2;color:#991b1b">Error API: ${escapeHtml(error.message)}</div>`); });
