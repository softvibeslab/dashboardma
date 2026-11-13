import crypto from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
const id = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
// Only trusted synchronized references, never a URL supplied by the browser.
function identity(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'dev.azure.com' || url.username || url.password || url.port) return '';
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length !== 5 || parts[2] !== '_workitems' || parts[3] !== 'edit' || !/^\d+$/.test(parts[4])) return '';
    return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}/${parts[4]}`;
  } catch { return ''; }
}

export async function importAzureRequirement(store, payload, actor = 'Usuario del dashboard') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.workItemId !== 'string' || !/^ADO-\d+$/.test(payload.workItemId)) throw fail(400, 'Selecciona un registro de Azure del buscador.');
  return store.transaction(data => {
    const workItem = data.workItems.find(item => item.id === payload.workItemId && item.syncSource === 'azure-devops');
    if (!workItem) throw fail(404, 'El registro no está disponible en la copia sincronizada de Azure. Vuelve a buscar.');
    const key = identity(workItem.url);
    if (!key || !Number.isSafeInteger(workItem.azureId) || workItem.azureId <= 0 || workItem.id !== `ADO-${workItem.azureId}` || !key.endsWith(`/${workItem.azureId}`)) throw fail(409, 'El registro sincronizado no tiene una referencia Azure válida. Revisa la sincronización.');
    const linkedIds = new Set(data.requirementSources.filter(source => identity(source.url) === key).map(source => source.requirementId));
    const existing = data.requirements.find(item => item.azureImportIdentity === key || linkedIds.has(item.id));
    if (existing) return { item: existing, created: false };
    const now = new Date().toISOString();
    const item = {
      id: id('REQ'), title: workItem.title, project: workItem.project,
      description: `Referencia importada de la copia sincronizada de Azure DevOps.\n${workItem.title}\nTipo: ${workItem.type || 'Sin tipo'} · Estado en Azure: ${workItem.state || 'Sin estado'}.\nLa descripción completa y los criterios del ticket no están incluidos en esta copia; revisa el original y completa el contexto antes de enriquecer.`,
      status: 'Nuevo', owner: workItem.assignedTo || '', priority: Number(workItem.priority) <= 2 ? 'Alta' : 'Media',
      azureWorkItemId: workItem.id, azureImportIdentity: key,
      initiativeId: workItem.initiativeId || '', createdAt: now, updatedAt: now,
      importedBy: actor, azureSyncedAt: data.meta?.azureSync?.syncedAt || null
    };
    data.requirements.unshift(item);
    data.requirementSources.unshift({ id: id('RSRC'), requirementId: item.id, type: 'other-url', name: `Azure DevOps #${workItem.azureId}`, url: workItem.url, status: 'registrada', createdAt: now });
    return { item, created: true };
  });
}
