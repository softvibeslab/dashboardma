const el = (id) => document.getElementById(id);
const GLOBAL_EMAILS = ['rgarcia@mobilityappsin.com.mx', 'teamworkmobility@gmail.com'];
const GLOBAL_TELEGRAM = ['5791501756'];
let state = { repositories: [], repoResponsibles: [], repoAlerts: [], summary: null };
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
async function api(path, options) { const res = await fetch(`/dashboard/api/${path}`, options); if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return res.json(); }
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function splitList(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function ownerById(id) { return state.repoResponsibles.find((owner) => owner.id === id); }
function repoById(id) { return state.repositories.find((repo) => repo.id === id); }
function ownerLabel(id) { const owner = ownerById(id); return owner ? `${owner.displayName} · ${owner.email || 'sin correo'} · ${owner.telegramId || 'sin Telegram'}` : id; }
function alertRecipients(repo) {
  const owners = (repo?.responsibleIds || []).map(ownerById).filter((owner) => owner && owner.active !== false);
  const emails = [...new Set([...GLOBAL_EMAILS, ...owners.map((owner) => owner.email).filter(Boolean)])];
  const telegramIds = [...new Set([...GLOBAL_TELEGRAM, ...owners.map((owner) => owner.telegramId).filter(Boolean)])];
  return { emails, telegramIds };
}
async function load() {
  const [summary, repos, owners, alerts] = await Promise.all([
    api('summary'), api('repositories'), api('repoResponsibles'), api('repoAlerts')
  ]);
  state = { summary, repositories: repos.items, repoResponsibles: owners.items, repoAlerts: alerts.items };
  render();
}
function renderKpis() {
  const sync = state.summary?.repoSync || {};
  el('repoKpis').innerHTML = [
    ['Repositorios', sync.repositories || 0, 'Inventario por perfil/área'],
    ['Responsables', sync.responsibles || 0, 'Owners con correo/Telegram'],
    ['Alertas abiertas', sync.alertsOpen || 0, 'Errores pendientes'],
    ['Bloqueados', sync.blocked || 0, 'Requieren intervención'],
    ['Global email', GLOBAL_EMAILS.length, GLOBAL_EMAILS.join(' · ')],
    ['Telegram', GLOBAL_TELEGRAM[0], 'Aviso base obligatorio']
  ].map(([label, value, hint]) => `<article class="kpi"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span><span class="hint">${escapeHtml(hint)}</span></article>`).join('');
}
function renderRepos() {
  const filter = el('repoFilter').value.toLowerCase().trim();
  const repos = state.repositories.filter((repo) => JSON.stringify(repo).toLowerCase().includes(filter));
  el('repoList').innerHTML = repos.map((repo) => {
    const recipients = alertRecipients(repo);
    return `<article class="metric-card">
      <strong>${escapeHtml(repo.name)} <span class="pill ${repo.status === 'UP_TO_DATE' ? 'qa' : 'blocked'}">${escapeHtml(repo.status || 'UNKNOWN')}</span></strong>
      <span>${escapeHtml(repo.area)} · rama ${escapeHtml(repo.canonicalBranch || 'sin rama')} · política ${escapeHtml(repo.updatePolicy || 'canonical')}</span>
      <span>${escapeHtml(repo.localPath)}</span>
      <span>Responsables: ${escapeHtml((repo.responsibleIds || []).map(ownerLabel).join(' | ') || 'sin responsable')}</span>
      <span>Alertas a: ${escapeHtml(recipients.emails.join(', '))} · Telegram ${escapeHtml(recipients.telegramIds.join(', '))}</span>
      <div class="card-actions"><button class="secondary" data-edit-repo="${escapeHtml(repo.id)}">Editar</button><button class="danger-btn" data-delete="repositories:${escapeHtml(repo.id)}">Eliminar</button></div>
    </article>`;
  }).join('') || '<article class="metric-card"><strong>Sin repositorios</strong><span>Agrega el primer repositorio para activar el job.</span></article>';
}
function renderOwners() {
  el('ownerList').innerHTML = state.repoResponsibles.map((owner) => `<article class="metric-card">
    <strong>${escapeHtml(owner.displayName)} <span class="pill ${owner.active === false ? 'blocked' : 'qa'}">${owner.active === false ? 'Inactivo' : 'Activo'}</span></strong>
    <span>${escapeHtml(owner.email || 'sin correo')} · Telegram ${escapeHtml(owner.telegramId || 'sin ID')}</span>
    <span>Canales: ${escapeHtml((owner.preferredChannels || []).join(', ') || 'email')}</span>
    <div class="card-actions"><button class="secondary" data-edit-owner="${escapeHtml(owner.id)}">Editar</button><button class="danger-btn" data-delete="repoResponsibles:${escapeHtml(owner.id)}">Eliminar</button></div>
  </article>`).join('') || '<article class="metric-card"><strong>Sin responsables</strong><span>Agrega owners para enrutar alertas por repositorio.</span></article>';
}
function renderAlerts() {
  el('alertList').innerHTML = state.repoAlerts.map((alert) => `<article class="metric-card">
    <strong>${escapeHtml(alert.status)} <span class="pill blocked">${escapeHtml(alert.severity || 'medium')}</span></strong>
    <span>${escapeHtml(repoById(alert.repoId)?.name || alert.repoId)} · ${escapeHtml(alert.message)}</span>
    <span>Correo: ${escapeHtml((alert.recipients?.emails || []).join(', '))}</span>
    <span>Telegram: ${escapeHtml((alert.recipients?.telegramIds || []).join(', '))}</span>
    <span>Entrega: ${escapeHtml((alert.deliveryStatus || []).map((item) => `${item.channel}:${item.status}`).join(' · ') || 'pendiente')}</span>
    <div class="card-actions"><button class="secondary" data-edit-alert="${escapeHtml(alert.id)}">Editar</button><button class="danger-btn" data-delete="repoAlerts:${escapeHtml(alert.id)}">Eliminar</button></div>
  </article>`).join('') || '<article class="metric-card"><strong>Sin alertas</strong><span>No hay errores registrados.</span></article>';
}
function render() { renderKpis(); renderRepos(); renderOwners(); renderAlerts(); }
async function submitRepo(event) {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const payload = { ...data, responsibleIds: splitList(data.responsibleIds), frequencyMinutes: Number(data.frequencyMinutes || 60), protected: data.updatePolicy === 'protected' };
  delete payload.id;
  await api('repositories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  event.currentTarget.reset(); await load();
}
async function submitOwner(event) {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const payload = { ...data, preferredChannels: splitList(data.preferredChannels), active: data.active !== 'false' };
  await api('repoResponsibles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  event.currentTarget.reset(); await load();
}
async function submitAlert(event) {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const repo = repoById(data.repoId);
  const recipients = alertRecipients(repo);
  const payload = { ...data, recipients, deliveryStatus: [{ channel: 'email', status: 'pending' }, { channel: 'telegram', status: 'pending' }], createdAt: new Date().toISOString() };
  await api('repoAlerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  event.currentTarget.reset(); await load();
}
document.addEventListener('click', async (event) => {
  const del = event.target.closest('[data-delete]');
  if (del) {
    const [collection, id] = del.dataset.delete.split(':');
    await api(`${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }
});
el('repoForm').addEventListener('submit', submitRepo);
el('ownerForm').addEventListener('submit', submitOwner);
el('alertForm').addEventListener('submit', submitAlert);
el('repoFilter').addEventListener('input', renderRepos);
el('refreshBtn').addEventListener('click', load);
load().catch((error) => { document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#fee2e2;color:#991b1b">Error API: ${escapeHtml(error.message)}</div>`); });
