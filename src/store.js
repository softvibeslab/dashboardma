import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const COLLECTIONS = new Set([
  'initiatives',
  'workItems',
  'gates',
  'evidences',
  'handoffs',
  'risks',
  'activities',
  'users',
  'assignments',
  'repoProfiles',
  'repositories',
  'repoResponsibles',
  'repoAlerts',
  'requirements',
  'requirementSources',
  'enrichmentRuns',
  'requirementQuestions',
  'requirementVersions',
  'requirementApprovals',
  'requirementHandoffs',
  'qaPackages'
]);

const ID_PREFIX = {
  initiatives: 'INI',
  workItems: 'WI',
  gates: 'GATE',
  evidences: 'EV',
  handoffs: 'HO',
  risks: 'RISK',
  activities: 'ACT',
  users: 'USR',
  assignments: 'ASN',
  repoProfiles: 'RPROF',
  repositories: 'REPO',
  repoResponsibles: 'ROWN',
  repoAlerts: 'RALERT',
  requirements: 'REQ',
  requirementSources: 'RSRC',
  enrichmentRuns: 'ENR',
  requirementQuestions: 'RQ',
  requirementVersions: 'RV',
  requirementApprovals: 'RAPP',
  requirementHandoffs: 'RHO',
  qaPackages: 'QAP'
};

const mutationQueues = new Map();

export class JsonStore {
  constructor(dataFile) {
    this.dataFile = dataFile;
  }

  async read() {
    const raw = await readFile(this.dataFile, 'utf8');
    const data = JSON.parse(raw);
    for (const collection of COLLECTIONS) {
      if (!Array.isArray(data[collection])) data[collection] = [];
    }
    if (!data.meta) data.meta = {};
    return data;
  }

  async write(data) {
    data.meta = { ...(data.meta || {}), updatedAt: new Date().toISOString() };
    await mkdir(path.dirname(this.dataFile), { recursive: true });
    const temporary = `${this.dataFile}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, this.dataFile);
  }

  async transaction(mutate) {
    const key = path.resolve(this.dataFile);
    const previous = mutationQueues.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      const data = await this.read();
      const result = await mutate(data);
      await this.write(data);
      return result;
    });
    mutationQueues.set(key, pending);
    try { return await pending; }
    finally { if (mutationQueues.get(key) === pending) mutationQueues.delete(key); }
  }

  async list(collection) {
    ensureCollection(collection);
    const data = await this.read();
    return data[collection];
  }

  async create(collection, payload) {
    ensureCollection(collection);
    validatePayload(payload);
    return this.transaction((data) => {
      const item = {
        id: payload.id || generateId(collection),
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...payload
      };
      validateId(item.id);
      data[collection].unshift(item);
      return item;
    });
  }

  async update(collection, id, payload) {
    ensureCollection(collection);
    validateId(id);
    validatePayload(payload);
    return this.transaction((data) => {
      const index = data[collection].findIndex((item) => item.id === id);
      if (index < 0) return null;
      const item = { ...data[collection][index], ...payload, id, updatedAt: new Date().toISOString() };
      data[collection][index] = item;
      return item;
    });
  }

  async remove(collection, id) {
    ensureCollection(collection);
    validateId(id);
    return this.transaction((data) => {
      const before = data[collection].length;
      data[collection] = data[collection].filter((item) => item.id !== id);
      return data[collection].length !== before;
    });
  }
}

export function ensureCollection(collection) {
  if (!COLLECTIONS.has(collection)) {
    const err = new Error(`Unknown collection: ${collection}`);
    err.status = 404;
    throw err;
  }
}

function generateId(collection) {
  const prefix = ID_PREFIX[collection] || 'REC';
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[A-Z0-9][A-Z0-9_.:-]{1,48}$/i.test(id) || id.includes('..') || id.includes('/')) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const err = new Error('Payload must be an object');
    err.status = 400;
    throw err;
  }
  if ('id' in payload) validateId(String(payload.id));
  if ('message' in payload && String(payload.message).trim().length === 0) {
    const err = new Error('message cannot be empty');
    err.status = 400;
    throw err;
  }
  if ('title' in payload && String(payload.title).trim().length === 0) {
    const err = new Error('title cannot be empty');
    err.status = 400;
    throw err;
  }
  if ('name' in payload && String(payload.name).trim().length === 0) {
    const err = new Error('name cannot be empty');
    err.status = 400;
    throw err;
  }
}

function buildModuleDetails({ data, counts, stageCounts, statusCounts, quality, pendingHandoffs, blockedRisks, activeAssignments, assignmentsByTeam, azureSync }) {
  const workItems = data.workItems || [];
  const gates = data.gates || [];
  const evidences = data.evidences || [];
  const handoffs = data.handoffs || [];
  const risks = data.risks || [];
  const users = data.users || [];
  const assignments = data.assignments || [];
  const openStates = new Set(['Active', 'New', 'To Do', 'Doing', 'Committed', 'Approved', 'Pendiente', 'En curso']);
  const closedStates = new Set(['Closed', 'Done', 'Resolved', 'Removed', 'Completada']);
  const azureWorkItems = workItems.filter((item) => item.syncSource === 'azure-devops');
  const azureUsers = users.filter((user) => user.syncSource === 'azure-devops');
  const azureAssignments = assignments.filter((assignment) => assignment.syncSource === 'azure-devops');
  const bugs = workItems.filter((item) => item.type === 'Bug');
  const openWorkItems = workItems.filter((item) => !closedStates.has(item.state));
  const cpActive = Object.entries(stageCounts).filter(([stage]) => /^CP|Producción|DevOps/i.test(stage)).reduce((sum, [, value]) => sum + value, 0);
  const overloadedUsers = users.filter((user) => {
    const allocation = assignments.filter((a) => a.userId === user.id && ['Activa', 'En curso', 'Pendiente'].includes(a.status)).reduce((sum, a) => sum + Number(a.allocation || 0), 0);
    return allocation > Number(user.capacity || 100);
  }).length;
  const evidenceCoverage = counts.initiatives ? Math.round((evidences.length / counts.initiatives) * 100) : 0;
  const gateApprovalRate = gates.length ? Math.round((gates.filter((g) => g.result === 'Aprobado').length / gates.length) * 100) : 0;

  return [
    {
      id: 'azure',
      title: 'Azure DevOps Sync',
      owner: 'PMO / Tecnología',
      status: azureSync ? 'Sincronizado read-only' : 'Pendiente sync',
      metrics: { projects: azureSync?.projects?.length || 0, workItems: azureWorkItems.length || azureSync?.workItems || 0, assignedWorkItems: azureSync?.assignedWorkItems || azureAssignments.length, users: azureUsers.length },
      details: [`Último sync: ${azureSync?.syncedAt || 'sin ejecutar'}`, `Fuente de verdad: Azure DevOps`, `Modo: ${azureSync?.mode || 'read-only'}`]
    },
    {
      id: 'cp',
      title: 'CP0–CP5 / Gobierno de entrega',
      owner: 'Product Owner / Arquitectura / Tech Lead',
      status: pendingHandoffs ? 'Con handoffs pendientes' : 'Flujo estable',
      metrics: { initiatives: counts.initiatives, activeStages: cpActive, pendingHandoffs },
      details: [`Estados: ${Object.keys(statusCounts).length}`, `Gates registrados: ${gates.length}`, `Próximo foco: cerrar handoffs antes de QA`]
    },
    {
      id: 'qa',
      title: 'QA, defectos y evidencia',
      owner: 'QA Lead',
      status: quality.openBugs ? 'Con defectos abiertos' : 'Sin bugs abiertos críticos',
      metrics: { bugs: bugs.length, openBugs: quality.openBugs, criticalBugs: quality.criticalBugs, evidenceCoverage },
      details: [`Evidencias: ${evidences.length}`, `Gates pendientes: ${quality.pendingGates}`, `Cobertura evidencia/iniciativas: ${evidenceCoverage}%`]
    },
    {
      id: 'devops',
      title: 'DevOps / Release',
      owner: 'DevOps / SRE',
      status: quality.pendingGates ? 'Release condicionado por gates' : 'Listo para calendarización',
      metrics: { gates: gates.length, gateApprovalRate, releasesTracked: stageCounts.Producción || 0 },
      details: [`Quality Gates aprobados: ${gateApprovalRate}%`, `Rollback/evidencia: por conectar a pipeline`, `Despliegues en producción: ${stageCounts.Producción || 0}`]
    },
    {
      id: 'negocio',
      title: 'Negocio / Aprobación',
      owner: 'Sponsor / Product Owner / Negocio',
      status: 'Requiere aceptación explícita por entrega',
      metrics: { approvalsPending: Math.max(1, quality.pendingGates), activities: counts.activities, valueMeasures: 0 },
      details: ['Demo, evidencia y criterios cumplidos antes de aprobar', 'Valor medible pendiente de línea base', 'Decisión humana obligatoria para aceptación o devolución']
    },
    {
      id: 'riesgos',
      title: 'Riesgos y bloqueos',
      owner: 'PMO / Responsables por dominio',
      status: blockedRisks ? 'Atención ejecutiva requerida' : 'Sin riesgos críticos abiertos',
      metrics: { openRisks: risks.filter((r) => r.status !== 'Cerrado').length, highOpen: blockedRisks, handoffsPending: pendingHandoffs },
      details: risks.slice(0, 3).map((risk) => `${risk.severity}: ${risk.title}`)
    },
    {
      id: 'capacidad',
      title: 'Usuarios, capacidad y asignaciones',
      owner: 'Líderes de equipo',
      status: overloadedUsers ? 'Hay sobreasignación' : 'Capacidad controlada',
      metrics: { users: counts.users, activeAssignments, overloadedUsers, teams: Object.keys(assignmentsByTeam).length },
      details: [`Asignaciones por equipo: ${Object.entries(assignmentsByTeam).slice(0, 4).map(([team, total]) => `${team} ${total}`).join(' · ') || 'sin datos'}`, `CRUD operativo en /dashboard/users`, 'Azure sync preserva registros locales']
    }
  ];
}

const MODULE_ALIAS = new Map([
  ['business', 'negocio'],
  ['risks', 'riesgos'],
  ['capacity', 'capacidad']
]);

export function buildModuleSlice(data, requestedId) {
  const id = MODULE_ALIAS.get(requestedId) || requestedId;
  const summary = buildSummary(data);
  const module = summary.modules.find((item) => item.id === id || item.id === requestedId);
  if (!module) {
    const err = new Error('Unknown module');
    err.status = 404;
    throw err;
  }
  const workItems = data.workItems || [];
  const gates = data.gates || [];
  const evidences = data.evidences || [];
  const risks = data.risks || [];
  const assignments = data.assignments || [];
  const users = data.users || [];
  const initiatives = data.initiatives || [];
  const recordsByModule = {
    azure: {
      workItems: workItems.filter((item) => item.syncSource === 'azure-devops').slice(0, 200),
      users: users.filter((user) => user.syncSource === 'azure-devops').slice(0, 100),
      assignments: assignments.filter((assignment) => assignment.syncSource === 'azure-devops').slice(0, 200)
    },
    cp: { initiatives, gates, handoffs: data.handoffs || [], traceability: buildTraceabilityDetails(data) },
    qa: { workItems: workItems.filter((item) => item.type === 'Bug'), gates, evidences },
    devops: { gates, releases: initiatives.filter((item) => /Producción|DevOps|CP5/i.test(item.stage || '')), evidences },
    negocio: { initiatives, gates: gates.filter((gate) => /Negocio|acept|aprob/i.test(`${gate.name} ${gate.owner} ${gate.result}`)), activities: data.activities || [] },
    riesgos: { risks, handoffs: data.handoffs || [] },
    capacidad: buildCapacity(data)
  };
  return { module: { ...module, requestedId }, records: recordsByModule[id] || {} };
}

export function buildTraceabilityDetails(data) {
  const workItems = data.workItems || [];
  const gates = data.gates || [];
  const evidences = data.evidences || [];
  const risks = data.risks || [];
  return (data.initiatives || []).map((initiative) => {
    const items = workItems.filter((item) => item.initiativeId === initiative.id);
    const itemGates = gates.filter((gate) => gate.initiativeId === initiative.id);
    const itemEvidences = evidences.filter((evidence) => evidence.initiativeId === initiative.id);
    const itemRisks = risks.filter((risk) => risk.initiativeId === initiative.id);
    const blocking = itemGates.some((gate) => ['Pendiente', 'Bloqueado', 'Devuelto'].includes(gate.result)) || itemRisks.some((risk) => ['Alto', 'Crítico', 'Critico'].includes(risk.severity) && risk.status !== 'Cerrado');
    return {
      initiativeId: initiative.id,
      title: initiative.title,
      owner: initiative.owner,
      stage: initiative.stage,
      workItems: items.length,
      openWorkItems: items.filter((item) => !['Closed', 'Done', 'Resolved', 'Removed'].includes(item.state)).length,
      bugs: items.filter((item) => item.type === 'Bug').length,
      gates: itemGates.length,
      pendingGates: itemGates.filter((gate) => ['Pendiente', 'Bloqueado', 'Devuelto'].includes(gate.result)).length,
      evidences: itemEvidences.length,
      risks: itemRisks.length,
      decision: blocking ? 'Requiere decisión / desbloqueo' : 'Puede avanzar con evidencia',
      complete: items.length > 0 && itemGates.length > 0 && itemEvidences.length > 0 && !blocking
    };
  });
}

export function buildCapacity(data) {
  const assignments = data.assignments || [];
  const initiativesById = new Map((data.initiatives || []).map((initiative) => [initiative.id, initiative]));
  const users = (data.users || []).map((user) => {
    const userAssignments = assignments.filter((assignment) => assignment.userId === user.id && ['Activa', 'En curso', 'Pendiente'].includes(assignment.status));
    const allocation = userAssignments.reduce((sum, assignment) => sum + Number(assignment.allocation || 0), 0);
    return {
      ...user,
      allocation,
      available: Math.max(0, Number(user.capacity || 100) - allocation),
      overloaded: allocation > Number(user.capacity || 100),
      assignments: userAssignments.slice(0, 20).map((assignment) => ({ ...assignment, initiativeTitle: initiativesById.get(assignment.initiativeId)?.title || assignment.initiativeId }))
    };
  });
  const byTeam = {};
  for (const user of users) {
    if (!byTeam[user.team]) byTeam[user.team] = { users: 0, allocation: 0, capacity: 0, overloaded: 0 };
    byTeam[user.team].users += 1;
    byTeam[user.team].allocation += user.allocation;
    byTeam[user.team].capacity += Number(user.capacity || 100);
    if (user.overloaded) byTeam[user.team].overloaded += 1;
  }
  return { users, byTeam, overloaded: users.filter((user) => user.overloaded), unassignedWorkItems: (data.workItems || []).filter((item) => !item.assignedTo || item.assignedTo === 'Sin asignar').slice(0, 100) };
}

export function buildSyncHistory(data) {
  const current = data.meta?.azureSync;
  const history = Array.isArray(data.meta?.syncHistory) ? data.meta.syncHistory : [];
  return [current, ...history].filter(Boolean).slice(0, 25).map((item, index) => ({ id: `SYNC-${index + 1}`, ...item }));
}

export function buildSummary(data) {
  const counts = {};
  for (const collection of COLLECTIONS) counts[collection] = data[collection]?.length || 0;

  const stageCounts = {};
  for (const initiative of data.initiatives || []) {
    const stage = initiative.stage || 'Sin etapa';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }

  const statusCounts = {};
  for (const initiative of data.initiatives || []) {
    const status = initiative.status || 'Sin estado';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const openBugs = (data.workItems || []).filter((item) => item.type === 'Bug' && !['Closed', 'Done', 'Resolved'].includes(item.state)).length;
  const criticalBugs = (data.workItems || []).filter((item) => item.type === 'Bug' && ['Critical', 'High'].includes(item.severity) && !['Closed', 'Done', 'Resolved'].includes(item.state)).length;
  const pendingGates = (data.gates || []).filter((gate) => ['Pendiente', 'Bloqueado', 'Devuelto'].includes(gate.result)).length;
  const pendingHandoffs = (data.handoffs || []).filter((handoff) => ['Pendiente', 'Vencido', 'Bloqueado'].includes(handoff.status)).length;
  const blockedRisks = (data.risks || []).filter((risk) => ['Alto', 'Crítico', 'Critico'].includes(risk.severity) && risk.status !== 'Cerrado').length;
  const activeAssignments = (data.assignments || []).filter((assignment) => ['Activa', 'En curso', 'Pendiente'].includes(assignment.status)).length;
  const usersById = new Map((data.users || []).map((user) => [user.id, user]));
  const assignmentsByTeam = {};
  for (const assignment of data.assignments || []) {
    const team = usersById.get(assignment.userId)?.team || 'Sin equipo';
    assignmentsByTeam[team] = (assignmentsByTeam[team] || 0) + 1;
  }

  const traceability = (data.initiatives || []).map((initiative) => {
    const workItems = (data.workItems || []).filter((item) => item.initiativeId === initiative.id);
    const gates = (data.gates || []).filter((gate) => gate.initiativeId === initiative.id);
    const evidences = (data.evidences || []).filter((ev) => ev.initiativeId === initiative.id);
    const risks = (data.risks || []).filter((risk) => risk.initiativeId === initiative.id);
    return {
      initiativeId: initiative.id,
      title: initiative.title,
      workItems: workItems.length,
      gates: gates.length,
      evidences: evidences.length,
      risks: risks.length,
      complete: workItems.length > 0 && gates.length > 0 && evidences.length > 0
    };
  });

  const azureSync = data.meta?.azureSync || null;
  const repoAlerts = data.repoAlerts || [];
  const repositories = data.repositories || [];
  const repoSync = {
    repositories: repositories.length,
    profiles: (data.repoProfiles || []).length,
    responsibles: (data.repoResponsibles || []).length,
    alertsOpen: repoAlerts.filter((alert) => !['resolved', 'closed', 'acknowledged', 'RESOLVED', 'CLOSED', 'ACKNOWLEDGED'].includes(String(alert.status || alert.state || '').trim())).length,
    criticalAlerts: repoAlerts.filter((alert) => ['critical', 'alta', 'crítico', 'critico'].includes(String(alert.severity || '').toLowerCase())).length,
    outdated: repositories.filter((repo) => ['BEHIND', 'UPDATED_REQUIRED', 'OUTDATED'].includes(repo.status)).length,
    blocked: repositories.filter((repo) => ['PAT_EXPIRED', 'AUTH_FAILED', 'ACCESS_DENIED', 'DIRTY_WORKTREE', 'DIVERGED', 'REMOTE_NOT_FOUND', 'FETCH_FAILED', 'PULL_FAILED'].includes(repo.status)).length,
    globalRecipients: {
      emails: ['rgarcia@mobilityappsin.com.mx', 'teamworkmobility@gmail.com'],
      telegramIds: ['5791501756']
    }
  };
  const modules = buildModuleDetails({ data, counts, stageCounts, statusCounts, quality: { openBugs, criticalBugs, pendingGates }, pendingHandoffs, blockedRisks, activeAssignments, assignmentsByTeam, azureSync });

  return {
    generatedAt: new Date().toISOString(),
    source: data.meta?.source || 'json-store',
    counts,
    stageCounts,
    statusCounts,
    quality: { openBugs, criticalBugs, pendingGates },
    handoffs: { pending: pendingHandoffs },
    risks: { highOpen: blockedRisks },
    assignments: { active: activeAssignments, byTeam: assignmentsByTeam },
    repoSync,
    azureSync,
    modules,
    traceability,
    recentActivities: [...(data.activities || [])].slice(0, 8)
  };
}
