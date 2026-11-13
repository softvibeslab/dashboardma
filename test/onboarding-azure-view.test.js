import test from 'node:test';
import assert from 'node:assert/strict';
const view = () => import('../public/dashboard/requirements/onboarding/app.js');
test('newer searches and clearing the query invalidate late responses including failures', async () => {
  const { createAzureSearch } = await view();
  const first = deferred(), second = deferred();
  let calls = 0;
  const search = createAzureSearch({ request: () => (++calls === 1 ? first.promise : second.promise) });
  const a = search.search('old'), b = search.search('new');
  second.resolve({ items: [{ id: 'new' }] }); await b;
  first.resolve({ items: [{ id: 'old' }] }); await a;
  assert.equal(search.state.result.items[0].id, 'new');
  const pending = deferred();
  const other = createAzureSearch({ request: () => pending.promise });
  const c = other.search('old'); await other.search('');
  pending.reject(new Error('late failure')); await c;
  assert.equal(other.state.error, '');
  assert.equal(other.state.result, null);
});
test('import confirms before writing, deduplicates concurrent clicks and reloads before selecting returned ID', async () => {
  const { createAzureSearch } = await view();
  const gate = deferred(), events = [], notices = [];
  let allowed = false;
  const search = createAzureSearch({
    request: async (url, body) => { events.push([url, body]); return body ? gate.promise : { items: [{ id: 'AZ-42', title: 'Unsafe <img>' }] }; },
    canImport: () => allowed,
    lock: value => events.push(['lock', value]),
    reload: async () => { events.push(['reload']); },
    select: async id => { events.push(['select', id]); },
    notify: message => notices.push(message)
  });
  await search.search('pedido');
  assert.equal(typeof search.importItem, 'function');
  await search.importItem('AZ-42');
  assert.equal(events.length, 1, 'cancel has no write or selection side effects');
  allowed = true;
  const importing = search.importItem('AZ-42');
  await search.importItem('AZ-42');
  await search.search('another');
  assert.equal(events.filter(([url]) => url === '/dashboard/api/requirements/import-azure').length, 1);
  assert.deepEqual(events.find(([url]) => url === '/dashboard/api/requirements/import-azure')[1], { workItemId: 'AZ-42' });
  assert.equal(search.state.importing, true);
  gate.resolve({ item: { id: 'REQ-99' }, created: true }); await importing;
  assert.deepEqual(events.slice(-3), [['reload'], ['select', 'REQ-99'], ['lock', false]]);
  assert.match(notices.at(-1), /agregado/i);
  assert.equal(search.state.importing, false);
});

test('search view escapes snapshot data and shows timestamp, totals, paging and action states', async () => {
  const { azureSearchMarkup } = await view();
  assert.equal(typeof azureSearchMarkup, 'function');
  const state = { query: 'pedido', offset: 10, result: { items: [{ id: 'AZ-1\" onclick=bad', title: '<img src=x onerror=bad>', project: '<script>bad</script>', state: 'Active', syncedAt: '<b>item date</b>' }], total: 25, syncedAt: '<b>sync date</b>', hasMore: true } };
  const html = azureSearchMarkup(state);
  assert.match(html, /11–11 de 25/);
  assert.match(html, /&lt;b&gt;sync date/);
  assert.match(html, /&lt;b&gt;item date/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|<script|<b>/);
  assert.match(html, /data-offset="0"/);
  assert.match(html, /data-offset="20"/);
  assert.match(html, /Agregar a bandeja y continuar/);
  assert.match(azureSearchMarkup({ ...state, importing: true }), /disabled/);
  assert.match(azureSearchMarkup({ loading: true }), /Buscando/);
  assert.match(azureSearchMarkup({ error: '<img>' }), /&lt;img&gt;/);
  assert.match(azureSearchMarkup({ query: 'missing', result: { items: [], total: 0 } }), /No hay resultados/);
  assert.match(azureSearchMarkup({}), /Escribe/);
});

test('page places a single synchronized search before the existing selector with responsive results', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/dashboard/requirements/onboarding/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/dashboard/requirements/onboarding/styles.css', import.meta.url), 'utf8');
  assert.match(html, /id="azureSearchForm"/);
  assert.match(html, /id="azureQuery"/);
  assert.match(html, /id="azureSearchButton"/);
  assert.match(html, /id="azureResults"/);
  assert.ok(html.indexOf('id="azureSearchForm"') < html.indexOf('id="requirementSelect"'));
  assert.match(html, /sincronizados.*no en vivo/);
  const form = html.match(/<form id="azureSearchForm"[\s\S]*?<\/form>/)[0];
  assert.equal((form.match(/<input/g) || []).length, 1);
  assert.doesNotMatch(form, /<select/);
  assert.match(css, /\.azure-result/);
  assert.match(css, /@media[^}]*700px[\s\S]*azure-result/);
});

test('mounted search/import interaction preserves dirty edits on cancel, locks races and selects imported requirement', async () => {
  const { mountWizard } = await view();
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, dataset: {}, listeners: {}, classList: { toggle() {} }, setAttribute() {}, focus() {}, querySelectorAll: () => [], addEventListener(name, fn) { this.listeners[name] = fn; }, async fire(name, event = {}) { return this.listeners[name]?.({ preventDefault() {}, target: this, ...event }); } });
    return nodes.get(id);
  };
  const root = { getElementById: element, addEventListener() {}, hidden: false };
  const originals = Object.fromEntries(['fetch', 'document', 'location', 'history', 'confirm', 'addEventListener'].map(key => [key, globalThis[key]]));
  const calls = [], post = deferred();
  let confirmed = false, confirmCount = 0, imported = false;
  const snapshot = id => ({ flow: { stage: 0, revision: 1, tracks: [] }, context: { requirement: { id, title: 'Pedido' }, versions: [{ id: 'v1', version: 1 }] }, blockers: [] });
  Object.assign(globalThis, { document: root, location: { href: 'http://localhost/dashboard/requirements/onboarding', search: '' }, history: { replaceState() {} }, addEventListener() {}, confirm: () => { confirmCount++; return confirmed; }, fetch: async (url, init) => {
    calls.push({ url, init });
    let result;
    if (url === '/dashboard/api/requirements') result = { items: [{ id: 'REQ-old', title: 'Existing' }, ...(imported ? [{ id: 'REQ-new', title: 'Imported' }] : [])] };
    else if (url.includes('/azure/work-items?')) result = { items: [{ id: 'AZ-42', title: 'Pedido' }], total: 1, syncedAt: '2026-11-05' };
    else if (url.endsWith('/import-azure')) { result = await post.promise; imported = true; }
    else result = snapshot(url.includes('REQ-new') ? 'REQ-new' : 'REQ-old');
    return { ok: true, json: async () => result };
  } });
  try {
    mountWizard(root); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1, 'opening loads only the existing dropdown');
    element('requirementSelect').value = 'REQ-old'; await element('requirementSelect').fire('change');
    await element('stageBody').fire('input');
    const editor = element('stageBody').innerHTML;
    element('azureQuery').value = 'pedido'; await element('azureSearchForm').fire('submit');
    assert.match(element('azureResults').innerHTML, /Agregar a bandeja y continuar/);
    const button = { disabled: false, dataset: { importId: 'AZ-42' } };
    const click = () => element('azureResults').fire('click', { target: { closest: () => button } });
    await click();
    assert.equal(calls.filter(c => c.init.method === 'POST').length, 0);
    assert.equal(element('stageBody').innerHTML, editor);
    assert.match(element('saveHint').textContent, /sin guardar/);
    confirmed = true;
    const pending = click();
    assert.equal(element('requirementSelect').disabled, true);
    assert.equal(element('stageBody').inert, true);
    await click();
    element('requirementSelect').value = 'REQ-other'; await element('requirementSelect').fire('change');
    assert.equal(element('requirementSelect').value, 'REQ-old');
    post.resolve({ item: { id: 'REQ-new' }, created: false }); await pending;
    assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
    assert.equal(element('requirementSelect').value, 'REQ-new');
    assert.equal(calls.at(-1).url, '/dashboard/api/requirements/REQ-new/wizard');
    assert.match(element('message').textContent, /reutiliz/);
    assert.equal(element('stageBody').inert, false);
    assert.equal(element('requirementSelect').disabled, false);
    assert.equal(confirmCount, 2, 'one confirmation per click, not a second discard dialog after success');
    await element('stageBody').fire('input'); confirmed = false;
    element('requirementSelect').value = 'REQ-old'; await element('requirementSelect').fire('change');
    assert.equal(element('requirementSelect').value, 'REQ-new', 'existing dropdown keeps its dirty guard');
  } finally { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('a newly imported requirement without versions offers explicit inline enrichment without inference', async () => {
  const { stageMarkup } = await view();
  const html = stageMarkup({ flow: { stage: 0 }, context: { requirement: { id: 'REQ-new' }, versions: [] } });
  assert.match(html, /aún no tiene una versión enriquecida/i);
  assert.doesNotMatch(html, /href="\/dashboard\/requirements"/);
  assert.match(html, /no se genera.*automáticamente/i);
  assert.match(html, /data-intake-enrich/);
  assert.match(html, /disabled>Guardar versión de partida/);
  assert.doesNotMatch(html, /data-action="generate"/);
});

test('import/search failures unlock retry and failed wizard selection keeps its own error instead of a success notice', async () => {
  const { createAzureSearch } = await view();
  const locks = [], notices = [];
  let fail = true, failSearch = true, writes = 0;
  const search = createAzureSearch({
    request: async (url, body) => {
      if (!body) { if (failSearch) throw new Error('Search unavailable'); return { items: [{ id: 42 }] }; }
      writes++; if (fail) throw new Error('Import unavailable');
      return { item: { id: 'REQ-42' }, created: false };
    },
    lock: locked => locks.push(locked), select: async () => false, notify: message => notices.push(message)
  });
  await search.search('pedido'); assert.equal(search.state.error, 'Search unavailable');
  failSearch = false; await search.search('pedido');
  await search.importItem(42);
  assert.equal(search.state.error, 'Import unavailable');
  assert.equal(search.state.importing, false);
  assert.deepEqual(locks, [true, false]);
  fail = false; await search.importItem(42);
  assert.equal(writes, 2);
  assert.equal(notices.length, 0, 'wizard load failure must remain visible');
  await search.importItem('not-in-current-results');
  assert.equal(writes, 2);
});

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('Azure search is explicit, skips blank queries and paginates synchronized data only', async () => {
  const { createAzureSearch } = await view();
  assert.equal(typeof createAzureSearch, 'function');
  const calls = [], states = [];
  const search = createAzureSearch({ request: async (...args) => { calls.push(args); return { items: [{ id: 'AZ-1' }], total: 25, syncedAt: '2026-11-05', hasMore: true }; }, render: s => states.push({ ...s }) });
  assert.equal(calls.length, 0);
  await search.search('  ');
  assert.equal(calls.length, 0);
  await search.search('  pedido & entrega  ');
  assert.equal(calls[0][0], '/dashboard/api/azure/work-items?q=pedido+%26+entrega&limit=10&offset=0');
  await search.search('pedido & entrega', 10);
  assert.equal(calls[1][0], '/dashboard/api/azure/work-items?q=pedido+%26+entrega&limit=10&offset=10');
  assert.equal(states.at(-1).offset, 10);
  assert.equal(states.at(-1).result.syncedAt, '2026-11-05');
  assert.equal(states.at(-1).loading, false);
});
