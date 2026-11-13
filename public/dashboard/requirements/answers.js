export const escapeAnswerText = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const e = escapeAnswerText;
const answerStatus = (status) => ({ draft: 'Borrador', suggested: 'Propuesta, no aprobada', approved: 'Aprobada', rejected: 'Propuesta rechazada' }[status] || 'Abierta');
const assistanceStatus = (status) => ({ queued: 'En cola', running: 'En ejecución', completed: 'Completada', failed: 'Fallida', stale: 'Desactualizada' }[status] || 'Sin solicitar');
export const hasPendingAnswers = (items = []) => items.some((item) => ['queued', 'running'].includes(item.assistance?.status));

export function reconcileAnswerDraft(previous, item) {
  if (previous?.dirty || (previous?.awaiting && hasPendingAnswers([item]))) return previous;
  return { text: String(item.answerDraft ?? item.answer ?? item.suggestedAnswer ?? ''), instruction: previous?.instruction || '', revision: Number.isInteger(item.answerRevision) ? item.answerRevision : 0, dirty: false };
}

export function createAnswerPayload(action, draft) {
  if (!['edit', 'approve', 'reject', 'suggest'].includes(action)) throw new TypeError('Acción desconocida.');
  const payload = { action, expectedRevision: Number.isInteger(draft.revision) ? draft.revision : 0 };
  if (['edit', 'approve', 'suggest'].includes(action)) {
    if (draft.text.length > 8000) throw new RangeError('La respuesta admite hasta 8000 caracteres.');
    payload.text = draft.text;
  }
  if (action === 'suggest' && draft.instruction) {
    if (draft.instruction.length > 1000) throw new RangeError('La indicación admite hasta 1000 caracteres.');
    payload.instruction = draft.instruction;
  }
  return payload;
}

export function renderAnswerCards(items = [], drafts = new Map(), busy = new Set()) {
  if (!items.length) return '<p class="muted">Aún no hay preguntas. Añade la primera para el equipo.</p>';
  return items.map((item, index) => {
    const draft = drafts.get(String(item.id)) || reconcileAnswerDraft(null, item);
    const pending = hasPendingAnswers([item]);
    const disabled = busy.has(String(item.id)) ? ' disabled' : '';
    const field = `answers-question-${index}`;
    return `<details class="answers-card" data-answer-question-id="${e(item.id)}">
      <summary class="answers-card-heading"><h4>${e(item.question)}</h4><span class="answers-status${item.answerStatus === 'approved' ? ' answers-status-approved' : ''}">${item.answerStatus === 'approved' ? 'Aprobada' : 'Pendiente'}</span></summary>
      <div class="answers-card-body">
      <p class="answers-meta">Estado: ${e(answerStatus(item.answerStatus))}</p>
      <p class="answers-meta">Rol: ${e(item.role || 'Sin especificar')} · Versión: ${e(item.versionId ?? 'sin versión')} · Revisión: ${e(item.answerRevision ?? 0)}</p>
      ${item.suggestedAnswer != null ? `<details class="answers-proposal"><summary>Propuesta, no aprobada</summary><p class="answers-text">${e(item.suggestedAnswer)}</p></details>` : ''}
      ${item.answerStatus === 'suggested' && item.answerDraft != null ? `<details class="answers-proposal" open><summary>Respuesta generada — propuesta, no aprobada</summary><p class="answers-text">${e(item.answerDraft)}</p><button type="button" class="secondary" data-answer-action="use-suggestion"${disabled}>Usar propuesta en el editor</button></details>` : ''}
      ${item.answerStatus === 'approved' ? `<p class="answers-meta">Respuesta aprobada registrada</p><p class="answers-text">${e(item.answer)}</p>` : ''}
      <label for="${field}">Respuesta editable${item.answerStatus === 'suggested' || (!item.answer && item.suggestedAnswer) ? ' — propuesta, no aprobada' : ''}</label>
      <textarea id="${field}" data-answer-field="text" maxlength="8000" rows="5"${disabled}>${e(draft.text)}</textarea>
      <label for="${field}-hint">Indicación para Hermes (opcional)</label>
      <textarea id="${field}-hint" data-answer-field="instruction" maxlength="1000" rows="2"${disabled}>${e(draft.instruction)}</textarea>
      <p class="answers-meta">Asistencia: ${e(assistanceStatus(item.assistance?.status))} · Modelo: ${e(item.answerModel || 'pendiente')}</p>
      ${item.assistance?.error ? `<p class="answers-error">${e(item.assistance.error)}</p>` : ''}
      <div class="req-actions answers-actions">
        <button type="button" class="secondary" data-answer-action="suggest"${disabled || (pending ? ' disabled' : '')}>${item.suggestedAnswer || item.answerDraft || item.answer ? 'Enriquecer respuesta' : 'Ayudarme con Hermes'}</button>
        <button type="button" class="secondary" data-answer-action="edit"${disabled}>Guardar borrador</button>
        <button type="button" class="primary-button" data-answer-action="approve"${disabled}>Aprobar respuesta</button>
        <button type="button" class="secondary" data-answer-action="reject"${disabled}>Rechazar propuesta</button>
      </div>
      <details class="answers-history"><summary>Historial de respuestas (${(item.answerHistory || []).length})</summary>
        <ol>${(item.answerHistory || []).map((entry) => `<li><p class="answers-meta">${e(entry.action)} · ${e(entry.actor?.name || 'Sin autor')} · <time>${e(entry.at || 'Sin fecha')}</time></p><p class="answers-text">${e(entry.text)}</p><code>Hash: ${e(entry.hash || 'sin hash')}</code></li>`).join('')}</ol>
      </details>
      </div>
    </details>`;
  }).join('');
}

const installations = new WeakMap();

// api is the host helper, which prefixes /dashboard/api/.
export function initializeAnswers({ api, getSelectedRequirement, onChange = () => {} } = {}) {
  if (typeof document === 'undefined') return null;
  const doc = document;
  if (installations.has(doc)) return installations.get(doc);
  if (typeof api !== 'function' || typeof getSelectedRequirement !== 'function') throw new TypeError('Se requieren api y getSelectedRequirement.');
  const states = new Map();
  const stateFor = (id) => {
    if (!states.has(id)) states.set(id, { items: [], drafts: new Map(), busy: new Set(), expanded: new Set(), question: '', role: '', message: '', loaded: false });
    return states.get(id);
  };
  let selected = null, epoch = 0, timer, deadline = 0, destroyed = false;
  const root = () => doc.getElementById('requirement-answers');
  const current = (id, token = epoch) => !destroyed && token === epoch && selected === id && String(getSelectedRequirement()?.id) === id && root()?.closest('[data-answers-requirement-id]')?.dataset.answersRequirementId === id;
  const request = (id, resource, payload) => api(`requirements/${encodeURIComponent(id)}/${resource}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  function paint() {
    if (!current(selected)) return;
    const s = stateFor(selected), panel = root();
    // Snapshot live cards too: native toggle events are queued and an action may repaint first.
    for (const card of panel.querySelectorAll('[data-answer-question-id]')) {
      if (card.open) s.expanded.add(card.dataset.answerQuestionId);
      else s.expanded.delete(card.dataset.answerQuestionId);
    }
    // Keep caret and expanded audit entries intact when a poll repaints the panel.
    const focus = doc.activeElement;
    const focusedCard = focus?.closest?.('[data-answer-question-id]');
    const focusKey = focusedCard?.dataset.answerQuestionId;
    const field = focus?.dataset?.answerField;
    const caret = [focus?.selectionStart, focus?.selectionEnd];
    const open = new Set([...panel.querySelectorAll('details[open]')].map((node) => `${node.closest('[data-answer-question-id]')?.dataset.answerQuestionId}:${node.className}`));
    panel.innerHTML = `<div class="answers-toolbar"><button type="button" class="secondary" data-answer-action="refresh">Actualizar respuestas</button></div>
      <p class="answers-feedback${s.messageError ? ' answers-error' : ''}" role="status">${e(s.message)}</p>
      ${s.loaded ? renderAnswerCards(s.items, s.drafts, s.busy) : '<p class="muted">Cargando preguntas…</p>'}
      <form data-answers-new-question class="answers-new-question"><h4>Añadir pregunta manual</h4>
        <label for="answers-new-question">Pregunta</label><textarea id="answers-new-question" name="question" rows="3" maxlength="2000" required>${e(s.question)}</textarea>
        <label for="answers-new-role">Rol (opcional)</label><input id="answers-new-role" name="role" maxlength="150" value="${e(s.role)}">
        <button type="submit" class="primary-button"${s.creating ? ' disabled' : ''}>Añadir pregunta</button>
      </form>`;
    for (const node of panel.querySelectorAll('details')) {
      if (node.matches('[data-answer-question-id]')) node.open = s.expanded.has(node.dataset.answerQuestionId);
      else if (open.has(`${node.closest('[data-answer-question-id]')?.dataset.answerQuestionId}:${node.className}`)) node.open = true;
    }
    for (const card of panel.querySelectorAll('[data-answer-question-id]')) {
      if (card.dataset.answerQuestionId !== focusKey || !field) continue;
      const node = card.querySelector(`[data-answer-field="${field}"]`);
      node?.focus({ preventScroll: true });
      if (node?.setSelectionRange && Number.isInteger(caret[0])) node.setSelectionRange(...caret);
    }
  }
  function message(text, error = false) { const s = stateFor(selected); s.message = text; s.messageError = error; paint(); }
  function queue() {
    clearTimeout(timer);
    if (!current(selected) || doc.hidden || !hasPendingAnswers(stateFor(selected).items)) return;
    deadline ||= Date.now() + 300000;
    if (Date.now() >= deadline) { message('La asistencia sigue pendiente. Se detuvo la actualización automática tras 5 minutos. Pulsa Actualizar respuestas para consultar.'); return; }
    timer = setTimeout(() => {
      if (Date.now() >= deadline) queue();
      else void load();
    }, Math.min(3000, deadline - Date.now()));
  }
  async function load(manual = false) {
    const id = selected, token = epoch;
    if (!current(id) || doc.hidden) return;
    const s = stateFor(id);
    if (s.loading === token) return;
    s.loading = token;
    // Do not let an older GET replace the result of a newer mutation.
    const generation = s.generation || 0;
    try {
      const data = await request(id, 'answers');
      if (!current(id, token) || doc.hidden || generation !== (s.generation || 0)) return;
      s.items = data.items || []; s.loaded = true;
      for (const item of s.items) {
        const key = String(item.id);
        const previous = s.drafts.get(key);
        const draft = reconcileAnswerDraft(previous, item);
        if (manual && draft.dirty) draft.revision = Number.isInteger(item.answerRevision) ? item.answerRevision : 0;
        s.drafts.set(key, draft);
      }
      if (manual) { s.message = 'Respuestas actualizadas. Tus ediciones se conservaron; revisa la versión y la propuesta antes de aprobar.'; s.messageError = false; }
      paint(); queue();
    } catch (error) {
      if (current(id, token)) { message(`No se pudieron cargar las respuestas: ${error.message}. Pulsa Actualizar respuestas para reintentar.`, true); queue(); }
    } finally { if (s.loading === token) s.loading = null; }
  }
  function capture(card) {
    const s = stateFor(selected), key = card.dataset.answerQuestionId;
    const item = s.items.find((entry) => String(entry.id) === key);
    if (!item) return null;
    const previous = s.drafts.get(key) || reconcileAnswerDraft(null, item);
    const text = card.querySelector('[data-answer-field="text"]').value;
    const instruction = card.querySelector('[data-answer-field="instruction"]').value;
    const draft = { ...previous, text, instruction, dirty: previous.dirty || text !== previous.text };
    s.drafts.set(key, draft);
    return draft;
  }
  async function act(action, card) {
    const id = selected, token = epoch, s = stateFor(id), key = card.dataset.answerQuestionId;
    if (!current(id) || s.busy.has(key)) return;
    const draft = capture(card);
    if (!draft) return;
    const item = s.items.find((entry) => String(entry.id) === key);
    if (action === 'use-suggestion') {
      s.drafts.set(key, { ...reconcileAnswerDraft(null, item), dirty: true }); paint(); return;
    }
    if (action === 'approve' && item.answerStatus === 'rejected') { message('Guarda un nuevo borrador antes de aprobar una propuesta rechazada.', true); return; }
    if (action === 'approve' && !globalThis.confirm?.('¿Aprobar exactamente el texto visible de esta respuesta? Esta acción humana no aprueba el requerimiento ni un CP.')) return;
    let payload;
    try { payload = createAnswerPayload(action, draft); } catch (error) { message(error.message, true); return; }
    s.busy.add(key); s.generation = (s.generation || 0) + 1;
    clearTimeout(timer); paint();
    try {
      const data = await request(id, `questions/${encodeURIComponent(key)}/answer`, payload);
      if (!current(id, token)) return;
      if (!data.item) throw new Error('El servidor no devolvió la respuesta actualizada');
      s.items = s.items.map((entry) => String(entry.id) === key ? data.item : entry);
      s.drafts.set(key, action === 'suggest' ? { ...draft, dirty: false, awaiting: true, signature: draft.text, revision: data.item.answerRevision ?? 0 } : reconcileAnswerDraft(null, data.item));
      s.message = ({ edit: 'Borrador guardado.', approve: 'Respuesta aprobada por acción humana.', reject: 'Propuesta rechazada. Guarda un nuevo borrador antes de aprobar.', suggest: 'Asistencia solicitada a Hermes. La propuesta no se aprobará automáticamente.' })[action];
      s.messageError = false;
      if (action === 'suggest') deadline = 0;
      // Optional host notification must never turn a saved answer into a failed action.
      Promise.resolve().then(() => onChange({ requirementId: id, questionId: key, action })).catch(() => {});
    } catch (error) {
      if (!current(id, token)) return;
      // The host api may expose only Error(message), so detect revision failures there too.
      const conflict = error.status === 409 || /409|conflict|revisi[oó]n|revision/i.test(error.message);
      s.message = conflict ? 'Conflicto de revisión. Tu texto se conserva sin sobrescribirlo. Pulsa Actualizar respuestas, compara el historial y vuelve a guardar o aprobar explícitamente.' : `No se pudo completar la acción: ${error.message}`;
      s.messageError = true;
    } finally {
      s.busy.delete(key);
      if (current(id, token)) { paint(); queue(); }
    }
  }
  function onInput(event) {
    if (!current(selected) || !event.target.closest?.('[data-answers-requirement-id]')) return;
    const card = event.target.closest('[data-answer-question-id]');
    if (card) { capture(card); return; }
    const form = event.target.closest('[data-answers-new-question]');
    if (form && ['question', 'role'].includes(event.target.name)) stateFor(selected)[event.target.name] = event.target.value;
  }
  function onClick(event) {
    const button = event.target.closest?.('[data-answer-action]');
    if (!button || button.disabled || !current(selected) || !button.closest('[data-answers-requirement-id]')) return;
    const action = button.dataset.answerAction;
    if (action === 'refresh') { deadline = 0; void load(true); return; }
    const card = button.closest('[data-answer-question-id]');
    if (card) void act(action, card);
  }
  async function onSubmit(event) {
    const form = event.target.closest?.('[data-answers-new-question]');
    if (!form || !current(selected)) return;
    event.preventDefault();
    const id = selected, token = epoch, s = stateFor(id);
    if (s.creating || !form.reportValidity()) return;
    s.question = form.elements.question.value; s.role = form.elements.role.value;
    if (!s.question.trim()) { message('Escribe una pregunta.', true); return; }
    s.creating = true; s.generation = (s.generation || 0) + 1; paint();
    try {
      const data = await request(id, 'questions', { question: s.question, role: s.role });
      if (!current(id, token)) return;
      if (!data.item) throw new Error('El servidor no devolvió la pregunta');
      s.items.push(data.item); s.loaded = true; s.drafts.set(String(data.item.id), reconcileAnswerDraft(null, data.item));
      s.question = ''; s.role = ''; s.message = 'Pregunta añadida al espacio compartido.'; s.messageError = false;
      Promise.resolve().then(() => onChange({ requirementId: id, questionId: String(data.item.id), action: 'create' })).catch(() => {});
    } catch (error) { if (current(id, token)) { s.message = `No se pudo añadir la pregunta: ${error.message}`; s.messageError = true; } }
    finally { s.creating = false; if (current(id, token)) { paint(); queue(); } }
  }
  function onSelection(event) {
    clearTimeout(timer); epoch++; deadline = 0;
    selected = event?.detail?.id != null ? String(event.detail.id) : getSelectedRequirement()?.id != null ? String(getSelectedRequirement().id) : null;
    if (selected && current(selected)) { paint(); void load(); }
  }
  function onVisibility() {
    clearTimeout(timer);
    if (!doc.hidden && current(selected)) {
      if (!stateFor(selected).loaded) void load();
      else queue();
    }
  }
  function onToggle(event) {
    const card = event.target;
    // toggle does not bubble. Ignore nested proposal/history details and detached old renders.
    if (!current(selected) || !card.matches?.('details[data-answer-question-id]') || !root()?.contains(card)) return;
    const expanded = stateFor(selected).expanded;
    if (card.open) expanded.add(card.dataset.answerQuestionId);
    else expanded.delete(card.dataset.answerQuestionId);
  }
  doc.addEventListener('toggle', onToggle, true);
  const bindings = { click: onClick, input: onInput, submit: onSubmit, 'requirement-workspace-change': onSelection, visibilitychange: onVisibility };
  for (const [name, handler] of Object.entries(bindings)) doc.addEventListener(name, handler);
  const controller = { refresh() { deadline = 0; return load(true); }, destroy() { destroyed = true; epoch++; clearTimeout(timer); doc.removeEventListener('toggle', onToggle, true); for (const [name, handler] of Object.entries(bindings)) doc.removeEventListener(name, handler); installations.delete(doc); } };
  installations.set(doc, controller);
  onSelection();
  return controller;
}

export function renderAnswersSection(requirement) {
  if (!requirement?.id) return '';
  return `<section class="detail-block answers-section" data-answers-requirement-id="${e(requirement.id)}" aria-labelledby="requirement-answers-heading">
    <h3 id="requirement-answers-heading">Preguntas y respuestas</h3>
    <p class="muted">Espacio compartido del requerimiento, separado del chat privado. Hermes propone; una persona decide. Aprobar una respuesta no aprueba el requerimiento ni un CP.</p>
    <div id="requirement-answers" aria-live="polite"><p class="muted">Cargando preguntas…</p></div>
  </section>`;
}
