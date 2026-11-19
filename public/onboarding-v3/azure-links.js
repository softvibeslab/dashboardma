const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeWorkItemUrl(item){
 if(item?.project!=='agileNestCorp'||!Number.isSafeInteger(item.id)||item.id<=0)return null;
 const expected=`https://dev.azure.com/MobileappsAmerica/agileNestCorp/_workitems/edit/${item.id}`;
 // Accept only the exact server URL: no scheme/domain/organization/project/ID substitution.
 return item.webUrl===expected?item.webUrl:null;
}
export function azureLink(item,label='Abrir en Azure ↗'){
 const url=safeWorkItemUrl(item);
 return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
}
export function resultIdentity(item){
 const label=`#${item.id} · ${item.title}`;
 return azureLink(item,label+' · Abrir en Azure ↗')||esc(label);
}
export function selectionSummary(item){
 return `<p><strong>Seleccionado · no importado</strong><br>${resultIdentity(item)}<br>${esc(item.project)}. Confirma la importación para vincular esta fuente al expediente; no se modifica Azure.</p>`;
}
