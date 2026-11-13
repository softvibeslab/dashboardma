export const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderWorkspace(requirement) {
  if (!requirement?.id) return '';
  const id = escapeText(requirement.id);
  return `<div class="requirement-workspace" data-collab-requirement="${id}">
    <section class="detail-block"><h3>Conversación privada con Hermes</h3><p class="muted">Solo tú puedes ver tu chat de este requerimiento. El foro del equipo se comparte por separado.</p><button type="button" class="primary-button" data-collab-action="open-chat" data-id="${id}" data-title="${escapeText(requirement.title)}">Abrir chat con Hermes</button></section>
    <section class="detail-block" aria-labelledby="requirement-discussion-heading"><div class="collab-heading"><h3 id="requirement-discussion-heading">Foro del equipo</h3><button type="button" class="secondary" data-collab-action="refresh-discussion">Actualizar foro</button></div><p class="muted">Notas compartidas, no aprobaciones. Los mensajes publicados no se pueden editar.</p><div id="requirement-discussion" aria-live="polite"><p class="muted">Cargando foro…</p></div><form id="requirement-discussion-form" data-requirement-id="${id}"><label for="requirement-discussion-message">Añadir una nota al equipo</label><textarea id="requirement-discussion-message" name="message" maxlength="4000" required rows="3"></textarea><button type="submit" class="secondary">Publicar nota</button><p id="requirement-discussion-status" role="status"></p></form></section>
    <section class="detail-block" aria-labelledby="requirement-azure-heading"><div class="collab-heading"><h3 id="requirement-azure-heading">Adjuntos en Azure DevOps</h3><button type="button" class="secondary" data-collab-action="refresh-azure">Consultar/Actualizar adjuntos</button></div><p class="muted">En Azure, abre el ticket y busca Attachments / Adjuntos (icono de clip). Esta lista muestra metadatos; no significa que se haya leído el contenido de los archivos.</p><div id="requirement-azure-attachments" aria-live="polite"><p class="muted">Cargando estado de Azure…</p></div></section>
  </div>`;
}

export function safeAzureUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'dev.azure.com' && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}

const statusLabel = (status) => ({ queued: 'En cola', running: 'En ejecución', completed: 'Completado', failed: 'Error', not_loaded: 'Sin consultar', unlinked: 'Sin ticket asociado' }[status] || 'Pendiente');
const pending = (status) => ['queued', 'running'].includes(status);
const e = escapeText;

export function renderChatTurns(data = {}) {
  const context = data.context || {};
  if (!(data.items || []).length) return `<p class="muted">Contexto actual: ${e(context.version ?? 'sin versión')} · ${e(context.status || 'Pendiente')}</p><p class="muted">Aún no hay mensajes. Pregunta sobre este requerimiento.</p>`;
  return `<p class="muted">Contexto actual: ${e(context.version ?? 'sin versión')} · ${e(context.status || 'Pendiente')}</p>${(data.items || []).map((turn) => `<article class="collab-turn"><p class="collab-meta">${e(turn.createdAt)} · ${e(statusLabel(turn.status))}</p><strong>Tú</strong><p class="collab-text">${e(turn.message)}</p><strong>Hermes</strong><p class="collab-text">${e(turn.answer || (pending(turn.status) ? 'Preparando respuesta…' : turn.error || 'Sin respuesta.'))}</p><p class="muted">Modelo: ${e(turn.model || 'pendiente')} · Contexto utilizado: ${e(turn.contextVersion ?? 'sin versión generada')}</p>${turn.error ? `<p class="collab-error">${e(turn.error)}</p>` : ''}</article>`).join('') || '<p class="muted">Aún no hay mensajes. Pregunta sobre este requerimiento.</p>'}`;
}

export function renderDiscussion(data = {}) {
  const items = data.items || [];
  return `${data.hasMore || items.length > 100 ? '<p class="muted">Historial parcial: se muestran las 100 notas más recientes.</p>' : ''}${items.slice(-100).map((item) => `<article class="collab-note"><p class="collab-meta">${e(item.authorName || 'Miembro del equipo')} · ${e(item.createdAt)}</p><p class="collab-text">${e(item.message)}</p></article>`).join('') || '<p class="muted">Aún no hay notas. Comparte contexto con el equipo.</p>'}`;
}

export function renderAzureAttachments(data = {}) {
  const workItem = data.workItem;
  const ticket = safeAzureUrl(workItem?.url);
  const states = {
    unlinked: 'Los archivos subidos aquí son locales, no adjuntos de Azure. Agrega como fuente la URL del ticket que aparece en el backlog sincronizado.',
    not_loaded: 'Todavía no se han consultado los adjuntos. Pulsa Consultar/Actualizar adjuntos.',
    queued: 'Consulta de adjuntos en cola…', running: 'Consultando adjuntos en Azure…',
    failed: 'No se pudieron consultar los adjuntos. Puedes reintentar con Consultar/Actualizar adjuntos.',
    completed: (data.items || []).length ? 'Adjuntos encontrados (solo metadatos):' : 'Este ticket no tiene adjuntos.'
  };
  return `${workItem ? `<p><strong>Ticket ${e(workItem.id)}</strong> · ${e(workItem.project)} ${ticket ? `· <a href="${e(ticket)}" target="_blank" rel="noopener noreferrer">Abrir ticket en Azure</a>` : ''}</p>` : ''}<p>${e(states[data.status] || 'Estado de adjuntos no disponible.')}</p>${data.error ? `<p class="collab-error">${e(data.error)}</p>` : ''}${data.fetchedAt ? `<p class="muted">Última consulta: ${e(data.fetchedAt)}</p>` : ''}${data.truncated ? `<p class="muted">Lista parcial: se muestran ${(data.items || []).length} de ${e(data.total)} adjuntos. Abre el ticket en Azure para ver todos.</p>` : ''}${(data.items || []).length ? `<ul class="collab-attachments">${data.items.map((item) => { const url = safeAzureUrl(item.url); return `<li>${url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(item.name)}</a>` : `${e(item.name)} <span class="muted">(enlace no permitido)</span>`}${Number.isFinite(item.size) ? ` · ${e(item.size)} bytes` : ''}</li>`; }).join('')}</ul>` : ''}`;
}

const installations = new WeakMap();

export function initializeCollaboration({ api, getSelectedRequirement } = {}) {
  if (typeof document === 'undefined') return null;
  const doc = document;
  if (installations.has(doc)) return installations.get(doc);
  if (typeof api !== 'function' || typeof getSelectedRequirement !== 'function') throw new TypeError('Se requieren api y getSelectedRequirement.');
  const $ = (id) => doc.getElementById(id);
  const states = new Map();
  const stateFor = (id) => {
    if (!states.has(id)) states.set(id, { chatDraft: '', discussionDraft: '', retry: {}, sending: {} });
    return states.get(id);
  };
  const request = (id, resource, options = {}) => api(`requirements/${encodeURIComponent(id)}/${resource}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  let selected = null, pinned = null, opener = null, chatEpoch = 0, destroyed = false;
  let chatTimer, azureTimer, chatFlight = false;
  const dialog = doc.createElement('dialog');
  dialog.id = 'requirement-hermes-dialog';
  dialog.className = 'collab-dialog';
  dialog.setAttribute('aria-labelledby', 'requirement-chat-title');
  dialog.setAttribute('aria-describedby', 'requirement-chat-scope');
  dialog.innerHTML = `<header class="collab-heading"><h2 id="requirement-chat-title">Chat con Hermes</h2><button type="button" class="secondary" data-collab-action="close-chat" aria-label="Cerrar chat">Cerrar</button></header><p id="requirement-chat-scope" class="muted">Conversación privada fijada a este requerimiento, aunque cambies la selección. Cada mensaje usa una nueva instantánea acotada del requerimiento, su última versión generada, tu conversación y las notas del equipo. No lee todos los repositorios ni ejecuta herramientas del sistema.</p><div id="requirement-chat-history" class="collab-chat-history" aria-live="polite" aria-label="Mensajes de la conversación"></div><form id="requirement-chat-form"><label for="requirement-chat-message">Mensaje para Hermes</label><textarea id="requirement-chat-message" name="message" rows="3" maxlength="2000" required></textarea><div class="req-actions"><button type="submit" class="primary-button">Enviar mensaje</button><button type="button" class="secondary" data-collab-action="refresh-chat">Actualizar chat</button></div><p id="requirement-chat-status" role="status"></p></form><footer class="muted">La IA propone; no aprueba ni realiza escrituras en Azure DevOps.</footer>`;
  doc.body.append(dialog);
  const clearButton = doc.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'secondary';
  clearButton.setAttribute('data-collab-action', 'clear-chat');
  clearButton.textContent = 'Limpiar mi chat';
  dialog.querySelector?.('.req-actions')?.append(clearButton);
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const visibleChat = () => !destroyed && dialog.open && !doc.hidden && pinned;
  const currentPanel = (id) => !destroyed && selected?.id === id && $('requirement-discussion-form')?.dataset.requirementId === id;
  function setSending(kind, id) {
    const form = $(kind === 'chat' ? 'requirement-chat-form' : 'requirement-discussion-form');
    if (form && (kind === 'chat' ? pinned?.id === id : currentPanel(id))) form.querySelector('button[type="submit"]').disabled = !!stateFor(id).sending[kind];
  }
  function paintChat() {
    if (!visibleChat()) return;
    const s = stateFor(pinned.id);
    const history = $('requirement-chat-history');
    const previousScroll = history.scrollTop;
    const followLatest = history.scrollHeight - history.clientHeight - previousScroll < 80;
    history.innerHTML = s.chat ? renderChatTurns(s.chat) : '<p class="muted">Cargando conversación…</p>';
    history.scrollTop = followLatest ? history.scrollHeight : previousScroll;
    setSending('chat', pinned.id);
  }
  function queueChat(delay = 2500) {
    clearTimeout(chatTimer);
    if (visibleChat()) chatTimer = setTimeout(loadChat, delay);
  }
  async function loadChat() {
    if (!visibleChat()) return;
    if (chatFlight) { queueChat(300); return; }
    clearTimeout(chatTimer);
    const { id } = pinned, epoch = chatEpoch;
    chatFlight = true;
    try {
      const data = await request(id, 'chat');
      if (!visibleChat() || pinned.id !== id || epoch !== chatEpoch) return;
      stateFor(id).chat = data;
      paintChat();
      if ((data.items || []).some((turn) => pending(turn.status))) queueChat();
    } catch (error) {
      if (visibleChat() && pinned.id === id && epoch === chatEpoch) text('requirement-chat-status', `No se pudo actualizar: ${error.message}. Pulsa Actualizar chat para reintentar.`);
    } finally { chatFlight = false; }
  }
  function saveDrafts() {
    if (pinned && $('requirement-chat-message')) stateFor(pinned.id).chatDraft = $('requirement-chat-message').value;
    const form = $('requirement-discussion-form');
    if (form) stateFor(form.dataset.requirementId).discussionDraft = $('requirement-discussion-message').value;
  }
  function stopChat() {
    saveDrafts();
    chatEpoch++;
    clearTimeout(chatTimer);
  }
  function openChat(button) {
    saveDrafts();
    stopChat();
    pinned = { id: button.dataset.id, title: button.dataset.title || '' };
    opener = button;
    text('requirement-chat-title', `${pinned.id} · ${pinned.title} — Hermes`);
    text('requirement-chat-status', '');
    $('requirement-chat-message').value = stateFor(pinned.id).chatDraft;
    if (!dialog.open) dialog.showModal();
    paintChat();
    $('requirement-chat-message').focus();
    void loadChat();
  }
  function closeChat() {
    stopChat();
    if (dialog.open) dialog.close();
    if (opener?.isConnected) opener.focus();
  }
  async function loadDiscussion(id) {
    const s = stateFor(id);
    if (s.discussionFlight) return;
    s.discussionFlight = true;
    try {
      const data = await request(id, 'discussion');
      s.discussion = data;
      if (currentPanel(id)) { $('requirement-discussion').innerHTML = renderDiscussion(data); text('requirement-discussion-status', ''); }
    } catch (error) {
      if (currentPanel(id)) text('requirement-discussion-status', `No se pudo cargar el foro: ${error.message}. Pulsa Actualizar foro para reintentar.`);
    } finally { s.discussionFlight = false; }
  }
  function paintAzure(id) {
    if (!currentPanel(id)) return;
    const s = stateFor(id);
    if (s.azure) $('requirement-azure-attachments').innerHTML = renderAzureAttachments(s.azure);
    const button = doc.querySelector?.('[data-collab-action="refresh-azure"]');
    if (button) button.disabled = !!s.azureFlight;
  }
  function queueAzure(id) {
    if (!currentPanel(id)) return;
    clearTimeout(azureTimer);
    const s = stateFor(id);
    if (doc.hidden || !pending(s.azure?.status)) return;
    s.azureDeadline ||= Date.now() + 180000;
    if (Date.now() >= s.azureDeadline) {
      const note = doc.createElement('p');
      note.className = 'muted';
      note.textContent = 'La consulta sigue pendiente. Se detuvo la actualización automática tras 3 minutos; pulsa Consultar/Actualizar adjuntos para volver a consultar.';
      $('requirement-azure-attachments').append(note);
      return;
    }
    azureTimer = setTimeout(() => {
      if (!currentPanel(id) || doc.hidden) return;
      if (Date.now() >= s.azureDeadline) queueAzure(id);
      else void loadAzure(id);
    }, 5000);
  }
  async function loadAzure(id, refresh = false) {
    const s = stateFor(id);
    if (destroyed || s.azureFlight) return;
    s.azureFlight = true;
    clearTimeout(azureTimer);
    if (refresh) s.azureDeadline = Date.now() + 180000;
    paintAzure(id);
    try {
      if (refresh) {
        const result = await request(id, 'azure-attachments', { method: 'POST' });
        s.azure = result;
        paintAzure(id);
      }
      const data = await request(id, 'azure-attachments');
      s.azure = data;
      if (!pending(data.status)) s.azureDeadline = null;
      paintAzure(id);
      queueAzure(id);
    } catch (error) {
      if (currentPanel(id)) text('requirement-azure-attachments', `No se pudo consultar Azure: ${error.message}. Pulsa Consultar/Actualizar adjuntos para reintentar.`);
    } finally { s.azureFlight = false; paintAzureButton(id); }
  }
  function paintAzureButton(id) {
    if (!currentPanel(id)) return;
    const button = doc.querySelector?.('[data-collab-action="refresh-azure"]');
    if (button) button.disabled = !!stateFor(id).azureFlight;
  }
  function refreshWorkspace(event) {
    if (destroyed) return;
    const next = event?.detail || getSelectedRequirement();
    const changed = selected?.id !== next?.id;
    selected = next?.id ? { id: String(next.id), title: next.title || '' } : null;
    if (changed) clearTimeout(azureTimer);
    if (!selected || !currentPanel(selected.id)) return;
    const { id } = selected, s = stateFor(id);
    $('requirement-discussion-message').value = s.discussionDraft;
    if (s.discussion) $('requirement-discussion').innerHTML = renderDiscussion(s.discussion);
    if (s.azure) paintAzure(id);
    setSending('discussion', id);
    if (changed || !s.discussion) void loadDiscussion(id);
    if (changed || !s.azure) void loadAzure(id);
    else queueAzure(id);
  }
  async function submit(event) {
    const kind = event.target.id === 'requirement-chat-form' ? 'chat' : event.target.id === 'requirement-discussion-form' ? 'discussion' : null;
    if (!kind) return;
    event.preventDefault();
    const id = kind === 'chat' ? pinned?.id : event.target.dataset.requirementId;
    if (!id) return;
    const s = stateFor(id), field = $(kind === 'chat' ? 'requirement-chat-message' : 'requirement-discussion-message');
    const message = field.value, max = kind === 'chat' ? 2000 : 4000;
    const statusId = kind === 'chat' ? 'requirement-chat-status' : 'requirement-discussion-status';
    if (!message.trim() || message.length > max || s.sending[kind]) return;
    const epoch = chatEpoch;
    if (s.retry[kind]?.message !== message) s.retry[kind] = { message, clientRequestId: globalThis.crypto.randomUUID() };
    s.sending[kind] = true;
    setSending(kind, id);
    text(statusId, 'Enviando…');
    const stillHere = () => kind === 'chat' ? visibleChat() && pinned.id === id && epoch === chatEpoch : currentPanel(id);
    try {
      const result = await request(id, kind, { method: 'POST', body: JSON.stringify(s.retry[kind]) });
      delete s.retry[kind];
      if (s[`${kind}Draft`] === message) s[`${kind}Draft`] = '';
      if (stillHere()) {
        const currentField = $(kind === 'chat' ? 'requirement-chat-message' : 'requirement-discussion-message');
        if (currentField?.value === message) currentField.value = '';
        text(statusId, kind === 'chat' ? 'Mensaje recibido. Hermes preparará la respuesta con una nueva instantánea del contexto.' : 'Nota publicada.');
      }
      if (kind === 'chat') {
        if (result.turn) s.chat = { ...s.chat, items: [...(s.chat?.items || []).filter((t) => t.id !== result.turn.id), result.turn] };
        if (stillHere()) { paintChat(); queueChat(0); }
      } else { await loadDiscussion(id); }
    } catch (error) {
      if (stillHere()) text(statusId, `No se pudo enviar: ${error.message}. Reintenta sin editar para reutilizar el mismo envío.`);
    } finally {
      s.sending[kind] = false;
      setSending(kind, id);
    }
  }
  function click(event) {
    const button = event.target.closest?.('[data-collab-action]');
    if (!button) return;
    const action = button.dataset.collabAction;
    if (action === 'open-chat') openChat(button);
    if (action === 'close-chat') closeChat();
    if (action === 'refresh-chat') void loadChat();
    if (action === 'clear-chat' && pinned && visibleChat()) {
      if (!globalThis.confirm('¿Limpiar tu historial privado de este requerimiento? No se borrará el foro del equipo.')) return;
      const id = pinned.id;
      chatEpoch++;
      clearTimeout(chatTimer);
      void request(id, 'chat', { method: 'DELETE' }).then(() => {
        stateFor(id).chat = { items: [], context: stateFor(id).chat?.context };
        if (visibleChat() && pinned.id === id) { paintChat(); text('requirement-chat-status', 'Tu historial privado se ha limpiado.'); void loadChat(); }
      }).catch((error) => { if (visibleChat() && pinned.id === id) text('requirement-chat-status', `No se pudo limpiar: ${error.message}`); });
    }
    if (action === 'refresh-discussion' && selected) void loadDiscussion(selected.id);
    if (action === 'refresh-azure' && selected) void loadAzure(selected.id, true);
  }
  function input(event) {
    if (event.target.id === 'requirement-chat-message' && pinned) stateFor(pinned.id).chatDraft = event.target.value;
    if (event.target.id === 'requirement-discussion-message') stateFor(event.target.form.dataset.requirementId).discussionDraft = event.target.value;
  }
  function visibility() {
    clearTimeout(chatTimer);
    clearTimeout(azureTimer);
    chatEpoch++;
    if (!doc.hidden) {
      if (visibleChat()) void loadChat();
      if (selected && pending(stateFor(selected.id).azure?.status)) queueAzure(selected.id);
    }
  }
  function cancel(event) { event.preventDefault(); closeChat(); }
  const listeners = [['click', click], ['submit', submit], ['input', input], ['requirement-workspace-change', refreshWorkspace], ['visibilitychange', visibility]];
  listeners.forEach(([name, handler]) => doc.addEventListener(name, handler));
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('close', stopChat);
  const controller = {
    refresh: refreshWorkspace,
    destroy() {
      saveDrafts();
      destroyed = true;
      clearTimeout(chatTimer);
      clearTimeout(azureTimer);
      listeners.forEach(([name, handler]) => doc.removeEventListener(name, handler));
      dialog.remove();
      installations.delete(doc);
    }
  };
  installations.set(doc, controller);
  refreshWorkspace();
  return controller;
}
