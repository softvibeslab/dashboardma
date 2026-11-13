const moduleId = location.pathname.split('/').filter(Boolean).pop() || 'azure';
const alias = { business: 'negocio', risks: 'riesgos', capacity: 'capacidad' };
const apiId = alias[moduleId] || moduleId;
let slice;
const el = (id) => document.getElementById(id);
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function labelize(key) { return String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()); }
async function api(path) { const res = await fetch(`/dashboard/api/${path}`); if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return res.json(); }

function flattenRecords(records) {
  if (!records || Array.isArray(records)) return records || [];
  if (records.users && records.byTeam) return records.users;
  return Object.entries(records).flatMap(([type, value]) => Array.isArray(value) ? value.map((item) => ({ ...item, recordType: type })) : []);
}

function renderKpis(module) {
  const metrics = Object.entries(module.metrics || {}).slice(0, 6);
  el('moduleKpis').innerHTML = metrics.map(([key, value]) => `<article class="kpi"><span class="label">${escapeHtml(labelize(key))}</span><span class="value">${escapeHtml(value)}</span><span class="hint">${escapeHtml(module.status)}</span></article>`).join('');
}

function recordTitle(record) {
  return record.title || record.name || record.displayName || record.id || record.workItemId || 'Registro';
}
function recordDetail(record) {
  return [record.recordType, record.state, record.status, record.owner, record.assignedTo, record.team, record.role, record.initiativeTitle || record.initiativeId, record.project].filter(Boolean).join(' · ');
}
function recordActions(record) {
  if (record.recordType !== 'gates' && !String(record.id || '').startsWith('G')) return '';
  return `<div class="card-actions"><button class="secondary" data-gate-action="Aprobado" data-id="${escapeHtml(record.id)}">Aprobar</button><button class="secondary" data-gate-action="Devuelto" data-id="${escapeHtml(record.id)}">Devolver</button><button class="danger-btn" data-gate-action="Bloqueado" data-id="${escapeHtml(record.id)}">Bloquear</button></div>`;
}
function renderRecords() {
  const records = flattenRecords(slice.records);
  const filter = el('moduleFilter').value.toLowerCase().trim();
  const filtered = records.filter((record) => JSON.stringify(record).toLowerCase().includes(filter)).slice(0, 120);
  el('recordCount').textContent = `${filtered.length} visibles · ${records.length} total`;
  el('moduleRecords').innerHTML = filtered.map((record) => `<article class="metric-card"><strong>${escapeHtml(recordTitle(record))}</strong><span>${escapeHtml(recordDetail(record))}</span>${recordActions(record)}</article>`).join('') || '<article class="metric-card"><strong>Sin registros</strong><span>No hay datos para este filtro.</span></article>';
}
function renderControls() {
  const details = slice.module.details || [];
  const controls = [
    ['Owner', slice.module.owner],
    ['Estado', slice.module.status],
    ...details.map((detail, index) => [`Control ${index + 1}`, detail])
  ];
  el('moduleControls').innerHTML = controls.map(([title, detail]) => `<article class="metric-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></article>`).join('');
}
function renderDeepDive() {
  if (apiId === 'capacidad' && slice.records.byTeam) {
    const rows = Object.entries(slice.records.byTeam).map(([team, item]) => `<tr><td>${escapeHtml(team)}</td><td>${item.users}</td><td>${item.allocation}%</td><td>${item.capacity}%</td><td>${item.overloaded}</td></tr>`).join('');
    el('moduleDeepDive').innerHTML = `<table class="clean-table"><thead><tr><th>Equipo</th><th>Usuarios</th><th>Asignación</th><th>Capacidad</th><th>Sobrecarga</th></tr></thead><tbody>${rows}</tbody></table>`;
    return;
  }
  api('traceability').then((trace) => {
    const rows = trace.items.slice(0, 40).map((item) => `<tr><td class="id-link">${escapeHtml(item.initiativeId)}</td><td>${escapeHtml(item.title)}</td><td>${item.workItems}</td><td>${item.pendingGates}</td><td>${item.evidences}</td><td>${escapeHtml(item.decision)}</td></tr>`).join('');
    el('moduleDeepDive').innerHTML = `<table class="clean-table"><thead><tr><th>Iniciativa</th><th>Título</th><th>Items</th><th>Gates pendientes</th><th>Evidencias</th><th>Decisión</th></tr></thead><tbody>${rows}</tbody></table>`;
  });
}
async function load() {
  slice = await api(`modules/${moduleId}`);
  el('moduleTitle').textContent = `Detalle de módulo · ${slice.module.title}`;
  el('moduleSubtitle').textContent = `${slice.module.owner} · ${slice.module.status}`;
  renderKpis(slice.module);
  renderRecords();
  renderControls();
  renderDeepDive();
}
el('moduleFilter').addEventListener('input', renderRecords);
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-gate-action]');
  if (!button) return;
  const { id, gateAction } = button.dataset;
  await fetch(`/dashboard/api/gates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ result: gateAction, owner: 'Control Tower', updatedFrom: 'module-detail' })
  }).then((res) => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); });
  await load();
});
load().catch((error) => { document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#fee2e2;color:#991b1b">Error API: ${escapeHtml(error.message)}</div>`); });
