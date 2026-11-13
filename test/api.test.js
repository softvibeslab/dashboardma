import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../src/server.js';

async function withApp(seed, fn, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ma-control-tower-'));
  const dataFile = path.join(dir, 'state.json');
  await writeFile(dataFile, JSON.stringify(seed, null, 2));
  const server = createServer({ dataFile, staticDir: path.join(process.cwd(), 'public'), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseUrl, dataFile });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

const seed = {
  meta: { generatedAt: '2026-09-24T00:00:00Z', source: 'demo-controlled' },
  initiatives: [
    { id: 'INI-001', title: 'Torre de Control MobilityApps', project: 'Ecosistema 360', client: 'MobilityApps', owner: 'PMO', stage: 'CP3', status: 'En desarrollo', priority: 'Alta', risk: 'Medio', dueDate: '2026-10-10', valueExpected: 'Reducir tiempos muertos entre handoffs' },
    { id: 'INI-002', title: 'Radar Sentry a Azure DevOps', project: 'QA Automation', client: 'MobilityApps', owner: 'QA', stage: 'Producción', status: 'Monitoreo', priority: 'Alta', risk: 'Bajo', dueDate: '2026-09-30', valueExpected: 'Trazabilidad de errores productivos' }
  ],
  workItems: [
    { id: 'HU-100', initiativeId: 'INI-001', type: 'HU', title: 'Ver KPIs ejecutivos', state: 'Active', assignedTo: 'Frontend', stage: 'CP3', priority: 1, updatedAt: '2026-09-24T10:00:00Z' },
    { id: 'BUG-200', initiativeId: 'INI-002', type: 'Bug', title: 'Error productivo sincronizado', state: 'Closed', assignedTo: 'QA', stage: 'Producción', severity: 'High', priority: 1, updatedAt: '2026-09-23T22:06:00Z' }
  ],
  gates: [
    { id: 'G-001', initiativeId: 'INI-001', stage: 'CP3', name: 'Desarrollo listo para QA', result: 'Pendiente', owner: 'Tech Lead', evidence: [], riskResidual: 'Medio' }
  ],
  evidences: [
    { id: 'EV-001', initiativeId: 'INI-002', type: 'cron-report', title: 'Radar PASS', url: '#', owner: 'QA', createdAt: '2026-09-23T22:06:00Z' }
  ],
  handoffs: [
    { id: 'HO-001', initiativeId: 'INI-001', from: 'Dev', to: 'QA', status: 'Pendiente', slaHours: 24, enteredAt: '2026-09-24T08:00:00Z' }
  ],
  risks: [
    { id: 'R-001', initiativeId: 'INI-001', severity: 'Medio', title: 'Definición CP oficial pendiente', owner: 'PMO', status: 'Abierto' }
  ],
  activities: [
    { id: 'A-001', initiativeId: 'INI-001', type: 'update', message: 'MVP funcional iniciado', actor: 'Hermes', createdAt: '2026-09-24T12:00:00Z' }
  ],
  users: [
    { id: 'USR-001', name: 'Ana QA', role: 'QA Lead', team: 'QA', status: 'Activo', capacity: 80 }
  ],
  assignments: [
    { id: 'ASN-001', userId: 'USR-001', initiativeId: 'INI-001', workItemId: 'HU-100', role: 'QA reviewer', allocation: 50, status: 'Activa' }
  ],
  repoProfiles: [
    { id: 'RPROF-ANDROID', name: 'Android', areas: ['android', 'qa-mobile'], defaultPolicy: 'canonical', status: 'Activo' }
  ],
  repositories: [
    { id: 'REPO-AJOVER-KMP', name: 'ajv-sales_app_multi-mob-ktl', area: 'android', profileId: 'RPROF-ANDROID', localPath: '/root/workspaces/android/projects/ajv-sales_app_multi-mob-ktl', remote: 'https://dev.azure.com/MobileappsAmerica/mobileApps/_git/ajv-sales_app_multi-mob-ktl', canonicalBranch: 'develop', currentBranch: 'develop', updatePolicy: 'canonical', status: 'UP_TO_DATE', owner: 'Android Team', responsibleIds: ['OWNER-ANDROID'], frequencyMinutes: 60, criticality: 'high', lastSyncAt: '2026-10-06T06:34:28Z' }
  ],
  repoResponsibles: [
    { id: 'OWNER-ANDROID', displayName: 'Responsable Android', email: 'android.owner@example.com', telegramId: '6220304829', preferredChannels: ['email', 'telegram'], active: true }
  ],
  repoAlerts: [
    { id: 'ALERT-001', repoId: 'REPO-AJOVER-KMP', status: 'PAT_EXPIRED', severity: 'critical', message: 'Credencial vencida', createdAt: '2026-10-06T06:35:00Z', recipients: { emails: ['rgarcia@mobilityappsin.com.mx', 'teamworkmobility@gmail.com'], telegramIds: ['5791501756', '6220304829'] }, deliveryStatus: [{ channel: 'email', status: 'pending' }] }
  ]
};

test('searches synchronized Azure work items with filters and bounded pagination', async () => {
  const azureSeed = { ...seed, meta: { azureSync: { syncedAt: '2026-11-04T22:23:23Z' } }, workItems: [
    ...seed.workItems,
    { id: 'ADO-42', azureId: 42, syncSource: 'azure-devops', project: 'mobileApps', title: 'Validar pedido', type: 'User Story', state: 'Active', assignedTo: 'Ana', url: 'https://dev.azure.com/MobileappsAmerica/mobileApps/_workitems/edit/42' },
    { id: 'ADO-43', azureId: 43, syncSource: 'azure-devops', project: 'webApps', title: 'Validar pedido web', type: 'Bug', state: 'New', assignedTo: 'Carlos' }
  ] };
  await withApp(azureSeed, async ({ baseUrl }) => {
    const get = (query) => fetch(`${baseUrl}/dashboard/api/azure/work-items?${query}`).then((r) => r.json());
    const result = await get('q=pedido&limit=1');
    assert.equal(result.total, 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.hasMore, true);
    assert.equal(result.source, 'azure-sync');
    assert.equal(result.syncedAt, '2026-11-04T22:23:23Z');
    assert.deepEqual(result.projects, ['mobileApps', 'webApps']);
    assert.equal((await get('q=pedido&project=mobileApps&state=Active')).items[0].azureId, 42);
    assert.equal((await get('q=43')).items[0].azureId, 43);
    assert.equal((await get('q=ana')).items[0].azureId, 42);
    assert.equal((await get('q=no-existe')).total, 0);
    assert.equal((await get('q=pedido&limit=1&offset=1')).items[0].azureId, 43);
    assert.equal((await fetch(`${baseUrl}/dashboard/api/azure/work-items?offset=-1`)).status, 400);
  });
  await withApp(azureSeed, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}/dashboard/api/azure/work-items?q=pedido`)).status, 401);
  }, { auth: { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: 'test', sessionSecret: 'test-session' } });
});

test('returns synchronized Azure users filtered by project and area without exposing write access', async () => {
  const azureSeed = { ...seed, meta: { azureSync: { syncedAt: '2026-11-04T22:23:23Z' } }, users: [
    { id: 'USR-AZ-1', name: 'Ana Azure', email: 'ana@example.com', team: 'mobileApps', projects: ['mobileApps'], areas: ['mobileApps\\Ventas'], azureIdentityKey: 'ana@example.com', syncSource: 'azure-devops' },
    { id: 'USR-AZ-2', name: 'Carlos Azure', email: 'carlos@example.com', team: 'webApps', projects: ['webApps'], areas: ['webApps\\Operaciones'], azureIdentityKey: 'carlos@example.com', syncSource: 'azure-devops' }
  ] };
  await withApp(azureSeed, async ({ baseUrl }) => {
    const result = await fetch(`${baseUrl}/dashboard/api/azure/users?project=mobileApps&area=Ventas`).then(r => r.json());
    assert.equal(result.source, 'azure-sync');
    assert.equal(result.syncedAt, '2026-11-04T22:23:23Z');
    assert.equal(result.areaMatched, true);
    assert.deepEqual(result.items.map(item => item.email), ['ana@example.com']);
    assert.equal((await fetch(`${baseUrl}/dashboard/api/azure/users?limit=101`)).status, 400);
  });
});

test('requirements page exposes session status and Azure search controls', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/dashboard/requirements`).then((r) => r.text());
    assert.match(html, /id="sessionStatus"/);
    assert.match(html, /session-status\.js/);
    assert.match(html, /id="azureSearchForm"/);
    assert.match(html, /id="azureProject"/);
    assert.match(html, /datos sincronizados/);
    assert.doesNotMatch(html, /Modo demo activo/);
    const script = await fetch(`${baseUrl}/dashboard/requirements/app.js`).then((r) => r.text());
    assert.match(script, /azure\/work-items/);
    assert.match(script, /Usar como requerimiento/);
  });
});

test('GET /api/health returns service status', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'mobilityapps-control-tower');
  });
});

test('GET /dashboard/api/health aliases API under dashboard path', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/dashboard/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'mobilityapps-control-tower');
  });
});

test('GET /api/summary aggregates lifecycle and quality metrics', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/summary`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.counts.initiatives, 2);
    assert.equal(body.counts.workItems, 2);
    assert.equal(body.stageCounts.CP3, 1);
    assert.equal(body.stageCounts.Producción, 1);
    assert.equal(body.quality.openBugs, 0);
    assert.equal(body.quality.pendingGates, 1);
    assert.equal(body.handoffs.pending, 1);
    assert.equal(body.traceability[0].initiativeId, 'INI-001');
    assert.equal(body.modules.length, 7);
    assert.deepEqual(body.modules.map((m) => m.id), ['azure', 'cp', 'qa', 'devops', 'negocio', 'riesgos', 'capacidad']);
    assert.equal(body.modules.find((m) => m.id === 'qa').metrics.openBugs, 0);
    assert.equal(body.modules.find((m) => m.id === 'capacidad').metrics.activeAssignments, 1);
  });
});

test('collection API reads and creates governed records', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const list = await fetch(`${baseUrl}/api/initiatives`);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).items.length, 2);

    const created = await fetch(`${baseUrl}/api/activities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initiativeId: 'INI-001', type: 'decision', message: 'Negocio valida el flujo CP', actor: 'PO' })
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.match(body.item.id, /^ACT-/);
    assert.equal(body.item.message, 'Negocio valida el flujo CP');

    const activities = await fetch(`${baseUrl}/api/activities`).then((r) => r.json());
    assert.equal(activities.items.length, 2);
  });
});

test('user and assignment CRUD supports ownership tracking', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const users = await fetch(`${baseUrl}/dashboard/api/users`).then((r) => r.json());
    assert.equal(users.items.length, 1);
    assert.equal(users.items[0].name, 'Ana QA');

    const createdUser = await fetch(`${baseUrl}/dashboard/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Carlos DevOps', role: 'DevOps Engineer', team: 'DevOps', status: 'Activo', capacity: 60 })
    });
    assert.equal(createdUser.status, 201);
    const userBody = await createdUser.json();
    assert.match(userBody.item.id, /^USR-/);

    const createdAssignment = await fetch(`${baseUrl}/dashboard/api/assignments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: userBody.item.id, initiativeId: 'INI-001', workItemId: 'TASK-101', role: 'Release owner', allocation: 40, status: 'Activa' })
    });
    assert.equal(createdAssignment.status, 201);
    const assignmentBody = await createdAssignment.json();
    assert.match(assignmentBody.item.id, /^ASN-/);

    const updated = await fetch(`${baseUrl}/dashboard/api/assignments/${assignmentBody.item.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Completada', allocation: 0 })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).item.status, 'Completada');

    const summary = await fetch(`${baseUrl}/dashboard/api/summary`).then((r) => r.json());
    assert.equal(summary.counts.users, 2);
    assert.equal(summary.counts.assignments, 2);
    assert.equal(summary.assignments.active, 1);
    assert.equal(summary.assignments.byTeam.DevOps, 1);
  });
});

test('repository governance CRUD supports repos, responsibles and alerts', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const repos = await fetch(`${baseUrl}/dashboard/api/repositories`).then((r) => r.json());
    assert.equal(repos.items.length, 1);
    assert.equal(repos.items[0].responsibleIds[0], 'OWNER-ANDROID');

    const responsible = await fetch(`${baseUrl}/dashboard/api/repoResponsibles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Backend Owner', email: 'backend.owner@example.com', telegramId: '5791501756', preferredChannels: ['email', 'telegram'], active: true })
    });
    assert.equal(responsible.status, 201);
    const responsibleBody = await responsible.json();
    assert.match(responsibleBody.item.id, /^ROWN-/);

    const repo = await fetch(`${baseUrl}/dashboard/api/repositories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'px-sls-web_api-net', area: 'backend', profileId: 'RPROF-BACKEND', localPath: '/root/workspaces/backend-services/projects/px-sls-web_api-net', remote: 'https://dev.azure.com/MobileappsAmerica/backendServicesWeb/_git/px-sls-web_api-net', canonicalBranch: 'develop', currentBranch: 'develop', updatePolicy: 'canonical', status: 'UNKNOWN', responsibleIds: [responsibleBody.item.id], frequencyMinutes: 60, criticality: 'high' })
    });
    assert.equal(repo.status, 201);
    const repoBody = await repo.json();
    assert.match(repoBody.item.id, /^REPO-/);

    const alert = await fetch(`${baseUrl}/dashboard/api/repoAlerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: repoBody.item.id, status: 'ACCESS_DENIED', severity: 'critical', message: 'Sin acceso a Azure DevOps', recipients: { emails: ['rgarcia@mobilityappsin.com.mx', 'teamworkmobility@gmail.com', responsibleBody.item.email], telegramIds: ['5791501756', responsibleBody.item.telegramId] }, deliveryStatus: [] })
    });
    assert.equal(alert.status, 201);
    const alertBody = await alert.json();
    assert.match(alertBody.item.id, /^RALERT-/);

    const summary = await fetch(`${baseUrl}/dashboard/api/summary`).then((r) => r.json());
    assert.equal(summary.counts.repositories, 2);
    assert.equal(summary.counts.repoResponsibles, 2);
    assert.equal(summary.counts.repoAlerts, 2);
    assert.equal(summary.repoSync.alertsOpen, 2);
  });
});

test('serves repository governance dashboard under /dashboard/repositories', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    for (const route of ['/dashboard/repositories', '/dashboard/repository-owners', '/dashboard/alerts']) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Repositorios y alertas/);
      assert.match(html, /data-repo-governance/);
    }

    const script = await fetch(`${baseUrl}/dashboard/repositories/repositories.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  });
});

test('API rejects unknown collections and unsafe payloads', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}/api/secrets`)).status, 404);
    const bad = await fetch(`${baseUrl}/api/activities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '../hack', message: '' })
    });
    assert.equal(bad.status, 400);
  });
});

test('serves dashboard shell under /dashboard', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/dashboard`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /MobilityApps Ecosystem Control Tower/);
    assert.match(html, /data-dashboard-app/);
  });
});

test('serves users module under /dashboard/users', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/dashboard/users`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Usuarios y asignaciones/);
    assert.match(html, /data-users-module/);
  });
});

test('serves operational module detail pages and API slices', async () => {
  await withApp(seed, async ({ baseUrl }) => {
    for (const moduleId of ['azure', 'cp', 'qa', 'devops', 'business', 'risks', 'capacity']) {
      const page = await fetch(`${baseUrl}/dashboard/modules/${moduleId}`);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /data-module-detail/);
      assert.match(html, /Detalle de módulo/);
    }

    const moduleScript = await fetch(`${baseUrl}/dashboard/modules/module.js`);
    assert.equal(moduleScript.status, 200);
    assert.match(moduleScript.headers.get('content-type'), /javascript/);

    const moduleApi = await fetch(`${baseUrl}/dashboard/api/modules/qa`).then((r) => r.json());
    assert.equal(moduleApi.module.id, 'qa');
    assert.ok(Array.isArray(moduleApi.records.workItems));
    assert.ok(Array.isArray(moduleApi.records.gates));
    assert.ok(Array.isArray(moduleApi.records.evidences));

    const traceability = await fetch(`${baseUrl}/dashboard/api/traceability`).then((r) => r.json());
    assert.equal(traceability.items[0].initiativeId, 'INI-001');
    assert.ok('decision' in traceability.items[0]);

    const capacity = await fetch(`${baseUrl}/dashboard/api/capacity`).then((r) => r.json());
    assert.equal(capacity.users.length, 1);
    assert.equal(capacity.users[0].allocation, 50);

    const syncHistory = await fetch(`${baseUrl}/dashboard/api/sync-history`).then((r) => r.json());
    assert.ok(Array.isArray(syncHistory.items));
  });
});

test('Azure login protects dashboard when configured and callback creates a session', async () => {
  const fakeJwt = (nonce) => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ aud: 'client-test', nonce, exp: Math.floor(Date.now() / 1000) + 3600, name: 'Roger Azure', preferred_username: 'roger@example.com', oid: 'oid-1', tid: 'tenant-test' })).toString('base64url');
    return `${header}.${payload}.sig`;
  };
  await withApp(seed, async ({ baseUrl }) => {
    const protectedPage = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    assert.equal(protectedPage.status, 302);
    assert.match(protectedPage.headers.get('location'), /\/dashboard\/auth\/login/);

    const protectedApi = await fetch(`${baseUrl}/dashboard/api/summary`);
    assert.equal(protectedApi.status, 401);

    const login = await fetch(`${baseUrl}/dashboard/auth/login?returnTo=%2Fdashboard%2Fmodules%2Fqa`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    assert.match(login.headers.get('location'), /login\.microsoftonline\.com/);
    const stateCookie = login.headers.get('set-cookie');
    const state = new URL(login.headers.get('location')).searchParams.get('state');

    const callback = await fetch(`${baseUrl}/dashboard/auth/callback?code=abc&state=${state}`, { redirect: 'manual', headers: { cookie: stateCookie } });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/dashboard/modules/qa');
    const sessionCookie = callback.headers.get('set-cookie');

    const status = await fetch(`${baseUrl}/dashboard/api/auth/status`, { headers: { cookie: sessionCookie } }).then((r) => r.json());
    assert.equal(status.configured, true);
    assert.equal(status.authenticated, true);
    assert.equal(status.user.email, 'roger@example.com');
  }, {
    auth: {
      enabled: true,
      tenantId: 'tenant-test',
      clientId: 'client-test',
      clientSecret: 'secret-test',
      sessionSecret: 'session-secret-test-session-secret-test',
      redirectUri: 'https://iamobilityappsinc.com/dashboard/auth/callback',
      tokenExchange: ({ statePayload }) => ({ id_token: fakeJwt(statePayload.nonce) })
    }
  });
});
