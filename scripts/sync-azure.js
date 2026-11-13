import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const DEFAULT_STATE = path.join(root, 'data', 'state.json');
const DEFAULT_ORG = 'https://dev.azure.com/MobileappsAmerica';

function hash(value, len = 10) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, len).toUpperCase();
}

function azureUserKey(assignedTo) {
  if (!assignedTo) return '';
  if (typeof assignedTo === 'string') return assignedTo;
  return assignedTo.uniqueName || assignedTo.mailAddress || assignedTo.id || assignedTo.displayName || '';
}

function azureUserName(assignedTo) {
  if (!assignedTo) return '';
  if (typeof assignedTo === 'string') return assignedTo;
  return assignedTo.displayName || assignedTo.uniqueName || assignedTo.id || 'Azure DevOps user';
}

function azureUserEmail(assignedTo) {
  if (!assignedTo || typeof assignedTo === 'string') return '';
  return assignedTo.uniqueName || assignedTo.mailAddress || '';
}

function initiativeForProject(project) {
  return {
    id: `INI-AZ-${hash(project, 8)}`,
    title: `${project} Azure DevOps Backlog`,
    project,
    client: 'MobilityApps',
    owner: 'Azure DevOps',
    sponsor: 'Delivery',
    stage: 'CP0',
    status: 'Sincronizado',
    priority: 'Media',
    risk: 'Bajo',
    valueExpected: 'Backlog sincronizado desde Azure DevOps',
    syncSource: 'azure-devops'
  };
}

function normalizeState(state) {
  const collections = ['initiatives', 'workItems', 'gates', 'evidences', 'handoffs', 'risks', 'activities', 'users', 'assignments'];
  for (const collection of collections) if (!Array.isArray(state[collection])) state[collection] = [];
  if (!state.meta) state.meta = {};
  return state;
}

export function mergeAzureWorkItems(currentState, azureItems, options = {}) {
  const state = normalizeState(JSON.parse(JSON.stringify(currentState || {})));
  const organization = options.organization || DEFAULT_ORG;
  const syncedAt = options.syncedAt || new Date().toISOString();

  const manual = (collection) => state[collection].filter((item) => item.syncSource !== 'azure-devops');
  const projects = [...new Set(azureItems.map((item) => item.project).filter(Boolean))].sort();
  const initiatives = projects.map(initiativeForProject);
  const initiativeByProject = new Map(initiatives.map((initiative) => [initiative.project, initiative]));

  const usersByKey = new Map();
  const workItems = [];
  const assignments = [];

  for (const item of azureItems) {
    const fields = item.fields || item;
    const azureId = Number(item.id || fields['System.Id']);
    if (!Number.isFinite(azureId)) continue;
    const project = item.project || fields['System.TeamProject'] || 'Azure DevOps';
    const initiative = initiativeByProject.get(project) || initiativeForProject(project);
    const type = fields['System.WorkItemType'] || 'Work Item';
    const title = fields['System.Title'] || `Azure work item ${azureId}`;
    const stateName = fields['System.State'] || 'Sin estado';
    const assignedTo = fields['System.AssignedTo'];
    const userKey = azureUserKey(assignedTo);
    let userId = '';

    if (userKey) {
      userId = `USR-AZ-${hash(userKey, 10)}`;
      if (!usersByKey.has(userKey)) {
        usersByKey.set(userKey, {
          id: userId,
          azureIdentityKey: userKey,
          name: azureUserName(assignedTo),
          email: azureUserEmail(assignedTo),
          role: 'Azure DevOps assignee',
          team: project,
          status: 'Activo',
          capacity: 100,
          projects: [project],
          areas: [],
          skills: [],
          syncSource: 'azure-devops',
          lastSyncAt: syncedAt
        });
      } else {
        const user = usersByKey.get(userKey);
        if (!user.projects.includes(project)) user.projects.push(project);
        user.team = user.projects.length === 1 ? user.projects[0] : 'Multi-proyecto';
      }
      const areaPath = fields['System.AreaPath'] || project;
      const syncedUser = usersByKey.get(userKey);
      if (syncedUser && areaPath && !syncedUser.areas.includes(areaPath)) syncedUser.areas.push(areaPath);
    }

    const workItem = {
      id: `ADO-${azureId}`,
      azureId,
      initiativeId: initiative.id,
      project,
      type,
      title,
      state: stateName,
      assignedTo: userId ? usersByKey.get(userKey).name : '',
      assignedUserId: userId,
      stage: mapStateToStage(stateName, type),
      priority: Number(fields['Microsoft.VSTS.Common.Priority'] || 3),
      severity: fields['Microsoft.VSTS.Common.Severity'] || '',
      updatedAt: fields['System.ChangedDate'] || syncedAt,
      tags: fields['System.Tags'] || '',
      syncSource: 'azure-devops',
      url: `${organization}/${encodeURIComponent(project)}/_workitems/edit/${azureId}`
    };
    workItems.push(workItem);

    if (userId) {
      const closed = /closed|done|resolved|removed/i.test(stateName);
      assignments.push({
        id: `ASN-AZ-${azureId}`,
        userId,
        initiativeId: initiative.id,
        workItemId: workItem.id,
        azureId,
        role: `${type} owner`,
        allocation: closed ? 0 : 10,
        status: closed ? 'Completada' : 'Activa',
        startDate: (fields['System.CreatedDate'] || syncedAt).slice(0, 10),
        dueDate: '',
        project,
        syncSource: 'azure-devops',
        lastSyncAt: syncedAt
      });
    }
  }

  state.initiatives = [...manual('initiatives'), ...initiatives];
  state.workItems = [...manual('workItems'), ...workItems.sort((a, b) => b.azureId - a.azureId)];
  state.users = [...manual('users'), ...[...usersByKey.values()].sort((a, b) => a.name.localeCompare(b.name))];
  state.assignments = [...manual('assignments'), ...assignments.sort((a, b) => b.azureId - a.azureId)];
  const previousHistory = Array.isArray(state.meta.syncHistory) ? state.meta.syncHistory : [];
  const previousSync = state.meta.azureSync ? { ...state.meta.azureSync } : null;
  state.meta.syncHistory = [previousSync, ...previousHistory].filter(Boolean).slice(0, 24);
  state.meta.azureSync = {
    organization,
    syncedAt,
    projects,
    workItems: workItems.length,
    assignedWorkItems: assignments.length,
    users: usersByKey.size,
    mode: 'read-only'
  };
  return state;
}

function mapStateToStage(stateName, type) {
  const state = String(stateName || '').toLowerCase();
  const kind = String(type || '').toLowerCase();
  if (state.includes('new') || state.includes('proposed')) return 'CP0';
  if (state.includes('design')) return 'CP2';
  if (state.includes('active') || state.includes('progress')) return 'CP3';
  if (kind.includes('test') || state.includes('resolved')) return 'CP4';
  if (state.includes('closed') || state.includes('done')) return 'Producción';
  return 'CP1';
}

function runAz(args) {
  const output = execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  return output.trim() ? JSON.parse(output) : [];
}

export function listProjects(organization = DEFAULT_ORG) {
  const result = runAz(['devops', 'project', 'list', '--organization', organization, '-o', 'json']);
  return (result.value || []).map((project) => project.name).filter(Boolean);
}

export function queryProjectWorkItems(project, organization = DEFAULT_ORG) {
  const wiql = `SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State], [System.AssignedTo], [System.AreaPath], [System.ChangedDate], [System.CreatedDate], [System.Tags], [Microsoft.VSTS.Common.Priority], [Microsoft.VSTS.Common.Severity] FROM WorkItems WHERE [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`;
  const result = runAz(['boards', 'query', '--organization', organization, '--project', project, '--wiql', wiql, '-o', 'json']);
  const items = Array.isArray(result) ? result : (result.workItems || result.value || result.items || []);
  return items.map((item) => ({ ...item, project }));
}

export function syncAzureToFile({ stateFile = DEFAULT_STATE, organization = DEFAULT_ORG, projects = [] } = {}) {
  const selectedProjects = projects.length ? projects : listProjects(organization);
  const azureItems = [];
  for (const project of selectedProjects) {
    try {
      azureItems.push(...queryProjectWorkItems(project, organization));
    } catch (error) {
      console.error(`WARN project ${project}: ${error.message}`);
    }
  }
  const current = JSON.parse(readFileSync(stateFile, 'utf8'));
  const next = mergeAzureWorkItems(current, azureItems, { organization });
  writeFileSync(stateFile, JSON.stringify(next, null, 2) + '\n');
  return next.meta.azureSync;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectsArg = process.argv.find((arg) => arg.startsWith('--projects='));
  const stateArg = process.argv.find((arg) => arg.startsWith('--state='));
  const projects = projectsArg ? projectsArg.replace('--projects=', '').split(',').map((p) => p.trim()).filter(Boolean) : [];
  const stateFile = stateArg ? stateArg.replace('--state=', '') : DEFAULT_STATE;
  const result = syncAzureToFile({ stateFile, projects });
  console.log(JSON.stringify(result, null, 2));
}
