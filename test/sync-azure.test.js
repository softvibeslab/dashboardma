import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeAzureWorkItems } from '../scripts/sync-azure.js';

const baseState = {
  meta: { source: 'test' },
  initiatives: [{ id: 'INI-LOCAL', title: 'Local initiative' }],
  workItems: [],
  users: [{ id: 'USR-LOCAL', name: 'Manual User', team: 'PMO', status: 'Activo' }],
  assignments: [],
  gates: [], evidences: [], handoffs: [], risks: [], activities: []
};

const azureItems = [
  {
    project: 'mobileApps',
    id: 2686,
    fields: {
      'System.WorkItemType': 'Bug',
      'System.Title': 'Bug real de prueba',
      'System.State': 'New',
      'System.AssignedTo': { displayName: 'Ana Azure', uniqueName: 'ana.azure@example.com', id: 'aad-1' },
      'System.AreaPath': 'mobileApps\\Ventas',
      'System.ChangedDate': '2026-09-24T10:00:00Z'
    }
  },
  {
    project: 'mobileApps',
    id: 2687,
    fields: {
      'System.WorkItemType': 'Task',
      'System.Title': 'Tarea sin asignar',
      'System.State': 'Active',
      'System.ChangedDate': '2026-09-24T11:00:00Z'
    }
  },
  {
    project: 'agileNestCorp',
    id: 100,
    fields: {
      'System.WorkItemType': 'User Story',
      'System.Title': 'Historia Prosalud',
      'System.State': 'Closed',
      'System.AssignedTo': { displayName: 'Carlos Azure', uniqueName: 'carlos.azure@example.com', id: 'aad-2' },
      'System.ChangedDate': '2026-09-22T11:00:00Z'
    }
  }
];

test('mergeAzureWorkItems maps Azure assigned users and assignments without deleting manual records', () => {
  const next = mergeAzureWorkItems(baseState, azureItems, { organization: 'https://dev.azure.com/MobileappsAmerica' });

  assert.equal(next.users.some((u) => u.id === 'USR-LOCAL'), true);
  assert.equal(next.users.filter((u) => u.syncSource === 'azure-devops').length, 2);
  assert.deepEqual(next.users.find((u) => u.email === 'ana.azure@example.com').areas, ['mobileApps\\Ventas']);
  assert.equal(next.workItems.filter((w) => w.syncSource === 'azure-devops').length, 3);
  assert.equal(next.assignments.filter((a) => a.syncSource === 'azure-devops').length, 2);

  const bug = next.workItems.find((w) => w.azureId === 2686);
  assert.equal(bug.id, 'ADO-2686');
  assert.equal(bug.assignedTo, 'Ana Azure');
  assert.equal(bug.project, 'mobileApps');

  const assignment = next.assignments.find((a) => a.workItemId === 'ADO-2686');
  assert.match(assignment.id, /^ASN-AZ-2686$/);
  assert.equal(assignment.status, 'Activa');

  const closedAssignment = next.assignments.find((a) => a.workItemId === 'ADO-100');
  assert.equal(closedAssignment.status, 'Completada');

  assert.equal(next.meta.azureSync.organization, 'https://dev.azure.com/MobileappsAmerica');
  assert.equal(next.meta.azureSync.projects.length, 2);
});
