import {change,digest,hash} from './model.js';
export function importProposal(state,snapshot,actor,{revision,confirmReplace}={}){
 if(!actor?.authenticated||!actor.roles.some(r=>['editor','coordinator'].includes(r)))throw Object.assign(Error('Rol editor o coordinator requerido.'),{status:403});
 if(revision!==state.revision)throw Object.assign(Error('Conflicto de versión: recarga antes de importar.'),{status:409});
 if(Object.keys(state.phases[1]).length&&confirmReplace!==true)throw Object.assign(Error('Confirma reemplazar el borrador; la versión anterior quedará preservada.'),{status:409});
 const root=snapshot.root,owner=state.phases[1].owner||actor.id;
 const items=[root,...snapshot.children.filter(c=>c.fields)];
 const sources=items.map(item=>({id:`AZ-${item.id}-r${item.rev}`,kind:'azure-reference',name:`Azure #${item.id} · r${item.rev} · ${item.fetchedAt}`,text:item.url||'',status:'referenced'}));
 const context=['Propuesta documental determinista; no se ejecutó Hermes IA. Reportes de fuentes, no defectos reproducidos ni causas verificadas.',...items.map(item=>`# Azure ${item.id} r${item.rev}: ${item.fields['System.Title']||''}\n${item.fields['System.Description']||'(Sin descripción)'}\nCriterios originales: ${item.fields['Microsoft.VSTS.Common.AcceptanceCriteria']||'(No disponibles)'}\nComentarios leídos (versiones originales):\n${(item.comments?.items||[]).map(c=>`Comentario ${c.id} v${c.version}: ${c.text||''}`).join('\n')||'(Ninguno disponible)'}\nAdjuntos con texto extraído UTF-8:\n${(item.attachments||[]).filter(a=>a.status==='extracted').map(a=>`${a.name}: ${a.text}`).join('\n')||'(Ninguno extraído)'}`)].join('\n\n').slice(0,95000);
 const data={title:String(root.fields['System.Title']||`Azure #${root.id}`).slice(0,100000),owner,context,constraints:'Pendiente confirmar entorno, URL/build, reproducción y criterios. No publicar, cambiar estado ni reemplazar descripción/criterios Azure. El texto de propuesta puede estar acotado; consulte el snapshot completo.',sources,questions:[{id:'Q-ENV',question:'¿Cuál es el entorno, URL y build afectados?',owner,blocking:true,answer:'',rationale:''},{id:'Q-REPRO',question:'¿Qué pasos y evidencia permiten reproducir y validar los reportes?',owner,blocking:true,answer:'',rationale:''}]};
 // Reuse existing version/history/approval invalidation rather than a parallel draft model.
 const next=change(state,{type:'save',phase:1,revision,data},{...actor,roles:[...new Set([...actor.roles,'editor'])]});
 next.azureIntakes||=[];
 next.azureIntakes.push({version:next.revision,actor:actor.id,at:new Date().toISOString(),generation:'documentary-deterministic-v1',aiStatus:'not-run',sourceHash:hash(snapshot),proposalHash:digest(next),snapshot:structuredClone(snapshot)});
 next.audit.at(-1).type='azure.import';return next;
}
