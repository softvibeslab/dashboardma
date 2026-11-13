import test from 'node:test';
import assert from 'node:assert/strict';

const view = () => import('../public/dashboard/requirements/answers.js');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness() {
  const listeners = new Map();
  const root = { innerHTML: '', closest: () => ({ dataset: { answersRequirementId: selected.id } }), querySelectorAll: () => [], querySelector: () => null };
  let selected = { id: 'R/1', title: 'Requirement' };
  const doc = { hidden: false, activeElement: null, getElementById: (id) => id === 'requirement-answers' ? root : null,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); } };
  const fire = (type, target = {}, detail) => { for (const fn of listeners.get(type) || []) fn({ target, detail, preventDefault() {} }); };
  const fields = { text: { value: ' exact visible\n ' }, instruction: { value: 'hint' } };
  const card = { dataset: { answerQuestionId: 'q1' }, querySelector: (selector) => selector.includes('instruction') ? fields.instruction : fields.text };
  const target = (action) => ({ dataset: { answerAction: action }, disabled: false,
    closest(selector) { if (selector.includes('data-answer-action')) return this; if (selector.includes('data-answer-question-id')) return card; if (selector.includes('data-answers-requirement-id')) return root.closest(); return null; } });
  return { doc, root, fields, fire, target, listeners, selected: () => selected, select(id) { selected = { id }; fire('requirement-workspace-change', {}, selected); } };
}

test('controller binds once, confirms human approval and sends exact visible text, then uses returned draft', async () => {
  const { initializeAnswers } = await view();
  const h = harness(), calls = [];
  globalThis.document = h.doc;
  const originalConfirm = globalThis.confirm;
  let allow = false;
  globalThis.confirm = () => allow;
  const item = { id: 'q1', question: 'Question', answerRevision: 3, answerDraft: 'server initial' };
  const api = async (path, options) => { calls.push({ path, options }); return options?.method === 'POST' ? { item: { ...item, answerDraft: 'server returned', answerRevision: 4 } } : { items: [item] }; };
  const controller = initializeAnswers({ api, getSelectedRequirement: h.selected });
  try {
    assert.equal(initializeAnswers({ api, getSelectedRequirement: h.selected }), controller);
    assert.equal(h.listeners.get('click').size, 1);
    await flush();
    h.fire('click', h.target('approve')); await flush();
    assert.equal(calls.length, 1);
    allow = true;
    h.fire('click', h.target('approve')); await flush();
    const post = calls.find((call) => call.options?.method === 'POST');
    assert.equal(post.path, 'requirements/R%2F1/questions/q1/answer');
    assert.equal(post.options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(post.options.body), { action: 'approve', expectedRevision: 3, text: ' exact visible\n ' });
    assert.match(h.root.innerHTML, /server returned/);
  } finally { controller.destroy(); globalThis.confirm = originalConfirm; delete globalThis.document; }
});

test('409 keeps visible edits and selection epochs discard stale responses', async () => {
  const { initializeAnswers } = await view();
  const h = harness(); globalThis.document = h.doc;
  let late;
  const api = async (path, options) => {
    if (options?.method === 'POST') throw new Error('409 Conflict: revision mismatch');
    if (path.includes('R%2F1')) return { items: [{ id: 'q1', question: 'First', answerRevision: 0 }] };
    return new Promise((resolve) => { late = resolve; });
  };
  const controller = initializeAnswers({ api, getSelectedRequirement: h.selected });
  try {
    await flush(); h.fire('click', h.target('edit')); await flush();
    assert.match(h.root.innerHTML, /conflicto/i);
    assert.match(h.root.innerHTML, / exact visible\n /);
    h.select('B'); await flush(); h.select('C'); await flush();
    late({ items: [{ id: 'q2', question: 'Current C' }] }); await flush();
    assert.match(h.root.innerHTML, /Current C/);
    h.select('R/1'); await flush();
    assert.match(h.root.innerHTML, / exact visible\n /);
  } finally { controller.destroy(); delete globalThis.document; }
});

test('manual question form posts explicit question and role without triggering assistance', async () => {
  const { initializeAnswers } = await view();
  const h = harness(), calls = []; globalThis.document = h.doc;
  const api = async (path, options) => { calls.push({ path, options }); return options?.method === 'POST' ? { item: { id: 'new', question: 'Manual question', answerStatus: 'open' } } : { items: [] }; };
  const controller = initializeAnswers({ api, getSelectedRequirement: h.selected });
  try {
    await flush();
    const form = { elements: { question: { value: 'Manual question' }, role: { value: 'QA' } }, reportValidity: () => true, closest: () => form };
    h.fire('submit', form); await flush();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].path, 'requirements/R%2F1/questions');
    assert.deepEqual(JSON.parse(calls[1].options.body), { question: 'Manual question', role: 'QA' });
    assert.match(h.root.innerHTML, /Manual question/);
    assert.match(h.root.innerHTML, /Estado: Abierta/);
  } finally { controller.destroy(); delete globalThis.document; }
});

test('suggest sends unsaved text; generation updates untouched editor but retains subsequent edits', async () => {
  const { initializeAnswers } = await view();
  const h = harness(); globalThis.document = h.doc;
  let item = { id: 'q1', question: 'Question', answerDraft: 'old', answerRevision: 1 };
  const posts = [];
  const api = async (path, options) => {
    if (options?.method === 'POST') { posts.push(JSON.parse(options.body)); item = { ...item, assistance: { status: 'queued' } }; return { item }; }
    return { items: [item] };
  };
  const controller = initializeAnswers({ api, getSelectedRequirement: h.selected });
  try {
    await flush(); h.fire('click', h.target('suggest')); await flush();
    assert.equal(posts[0].text, ' exact visible\n ');
    item = { ...item, answerDraft: 'generated one', answerStatus: 'suggested', answerRevision: 2, assistance: { status: 'completed' } };
    await controller.refresh();
    assert.match(h.root.innerHTML, />generated one<\/textarea>/);
    h.fields.text.value = 'generated one';
    h.fire('click', h.target('suggest')); await flush();
    h.fields.text.value = 'new local edit';
    h.fire('input', h.target());
    item = { ...item, answerDraft: 'generated two', answerRevision: 3, assistance: { status: 'completed' } };
    await controller.refresh();
    assert.match(h.root.innerHTML, />new local edit<\/textarea>/);
    assert.match(h.root.innerHTML, /generated two/);
    assert.match(h.root.innerHTML, /Usar propuesta en el editor/);
    h.fire('click', h.target('use-suggestion')); await flush();
    assert.match(h.root.innerHTML, />generated two<\/textarea>/);
    assert.equal(posts.length, 2);
  } finally { controller.destroy(); delete globalThis.document; }
});

test('late GET from a previous selection cannot repaint the current selection', async () => {
  const { initializeAnswers } = await view();
  const h = harness(); globalThis.document = h.doc;
  const resolvers = [];
  const controller = initializeAnswers({ api: () => new Promise((resolve) => resolvers.push(resolve)), getSelectedRequirement: h.selected });
  try {
    h.select('B');
    resolvers[1]({ items: [{ id: 'b', question: 'Current selection' }] }); await flush();
    resolvers[0]({ items: [{ id: 'old', question: 'Stale selection' }] }); await flush();
    assert.match(h.root.innerHTML, /Current selection/);
    assert.doesNotMatch(h.root.innerHTML, /Stale selection/);
  } finally { controller.destroy(); delete globalThis.document; }
});

test('pending-only polling stops at five minutes and on hidden document', async (t) => {
  const { initializeAnswers } = await view();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const h = harness(); globalThis.document = h.doc;
  let calls = 0;
  const controller = initializeAnswers({ api: async () => { calls++; return { items: [{ id: 'q1', assistance: { status: 'queued' } }] }; }, getSelectedRequirement: h.selected });
  try {
    await flush(); assert.equal(calls, 1);
    t.mock.timers.tick(3000); await flush(); assert.equal(calls, 2);
    h.doc.hidden = true; h.fire('visibilitychange');
    t.mock.timers.tick(3000); await flush(); assert.equal(calls, 2);
    h.doc.hidden = false; h.fire('visibilitychange'); await flush();
    t.mock.timers.tick(300000); await flush();
    const stopped = calls;
    t.mock.timers.tick(6000); await flush(); assert.equal(calls, stopped);
    assert.match(h.root.innerHTML, /5 minutos/);
  } finally { controller.destroy(); delete globalThis.document; t.mock.timers.reset(); }
});

test('initially hidden panel loads on visibility restoration and idle answers never poll', async (t) => {
  const { initializeAnswers } = await view();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const h = harness(); h.doc.hidden = true; globalThis.document = h.doc;
  let calls = 0;
  const controller = initializeAnswers({ api: async () => { calls++; return { items: [] }; }, getSelectedRequirement: h.selected });
  try {
    await flush(); assert.equal(calls, 0);
    h.doc.hidden = false; h.fire('visibilitychange'); await flush();
    assert.equal(calls, 1);
    t.mock.timers.tick(30000); await flush(); assert.equal(calls, 1);
  } finally { controller.destroy(); delete globalThis.document; t.mock.timers.reset(); }
});

test('proposal rendering never presents a suggestion as approved and escapes history', async () => {
  const { renderAnswerCards } = await view();
  const html = renderAnswerCards([{ id: 'q1', question: '<img src=x>', suggestedAnswer: '</textarea><script>x</script>', assistance: { status: 'running' }, answerHistory: [{ action: 'suggest', actor: { name: '<actor>' }, at: 'today', hash: '<hash>', text: '<history>' }] }]);
  assert.match(html, /Propuesta, no aprobada/);
  assert.match(html, /Modelo: pendiente/);
  assert.match(html, /En ejecución/);
  assert.match(html, /&lt;actor&gt;/);
  assert.doesNotMatch(html, /<script>|<img|<actor>|Estado: Aprobada/);
  assert.match(html, /maxlength="8000"/);
  assert.match(html, /maxlength="1000"/);
});

test('draft reconciliation retains local edits and their base revision during polling', async () => {
  const { reconcileAnswerDraft, createAnswerPayload, hasPendingAnswers } = await view();
  const item = { answerDraft: '', suggestedAnswer: 'proposal', answerRevision: 4 };
  assert.equal(reconcileAnswerDraft(null, item).text, '');
  const dirty = { text: ' exact visible\n ', instruction: 'hint', revision: 2, dirty: true };
  assert.deepEqual(reconcileAnswerDraft(dirty, item), dirty);
  assert.deepEqual(createAnswerPayload('approve', dirty), { action: 'approve', expectedRevision: 2, text: ' exact visible\n ' });
  assert.deepEqual(createAnswerPayload('suggest', dirty), { action: 'suggest', expectedRevision: 2, text: ' exact visible\n ', instruction: 'hint' });
  assert.deepEqual(createAnswerPayload('reject', dirty), { action: 'reject', expectedRevision: 2 });
  assert.throws(() => createAnswerPayload('approve', { ...dirty, text: 'x'.repeat(8001) }), /8000/);
  assert.throws(() => createAnswerPayload('suggest', { ...dirty, instruction: 'x'.repeat(1001) }), /1000/);
  assert.equal(hasPendingAnswers([{ assistance: { status: 'queued' } }]), true);
  assert.equal(hasPendingAnswers([{ assistance: { status: 'stale' } }]), false);
});

test('section is independent, requirement-scoped and escapes untrusted identifiers', async () => {
  const { renderAnswersSection } = await view();
  assert.equal(renderAnswersSection(null), '');
  const html = renderAnswersSection({ id: '\"><script>alert(1)</script>', title: '<unsafe>' });
  assert.match(html, /id="requirement-answers"/);
  assert.match(html, /data-answers-requirement-id="&quot;&gt;&lt;script&gt;/);
  assert.match(html, /Preguntas y respuestas/);
  assert.doesNotMatch(html, /<script>|<unsafe>/);
  assert.match(html, /no aprueba el requerimiento ni un CP/);
});
