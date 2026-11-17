const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={pending:'Pendiente',accepted:'Aceptada',corrected:'Corregida',rejected:'Rechazada'};
let view,act,selected,discard;
function choices(id,values,label='Todos'){
 const old=$(id).value;$(id).innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');if(values.some(v=>v.id===old))$(id).value=old;
}
export function renderReview(current,action,canDiscard){
 view=current;act=action;discard=canDiscard;selected=null;$('reviewForm').hidden=true;
 const review=view.catalog.review||{batches:[],proposals:[]};
 $('importResearch').hidden=!view.canManage;$('importResearch').disabled=!view.researchConfigured;
 $('researchSource').textContent=view.researchConfigured?`Fuente fija privada configurada · ${review.batches.length} lotes importados. La fecha es el corte de evidencia, no disponibilidad actual. Importar de nuevo el mismo hash no modifica el catálogo.`:'Fuente privada pendiente de montaje por el operador. No se acepta investigación enviada desde el navegador.';
 choices('reviewFrontFilter',[...new Set(review.proposals.map(p=>p.frontName).filter(Boolean))].sort().map(name=>({id:name,name})), 'Todos los frentes');
 choices('reviewBatch',review.batches.map(b=>({id:b.hash,name:`${b.window.start} → ${b.sourceDate} · ${b.hash.slice(0,12)}`})), 'Todos los periodos');
 renderList();
}
function renderList(){
 if(!view)return;
 const all=view.catalog.review?.proposals||[],q=$('reviewQuery').value.trim().toLocaleLowerCase('es');
 const name=p=>view.catalog.directory.users.find(u=>u.id===p.userId)?.name||'Identidad ausente de la copia V2 · pendiente';
 const records=all.filter(p=>(!q||name(p).toLocaleLowerCase('es').includes(q))&&(!$('reviewFrontFilter').value||p.frontName===$('reviewFrontFilter').value)&&(!$('reviewStatus').value||p.status===$('reviewStatus').value)&&(!$('reviewConfidence').value||p.confidence===$('reviewConfidence').value)&&(!$('reviewBatch').value||p.batchHash===$('reviewBatch').value));
 $('reviewCount').textContent=`${records.length} de ${all.length} propuestas · Solo una decisión explícita puede crear participación.`;
 $('reviewList').innerHTML=records.length?`<table><caption class="sr-only">Propuestas privadas filtradas</caption><thead><tr><th scope="col">Persona / frente propuesto</th><th scope="col">Confianza y periodo</th><th scope="col">Evidencia, límites e historial</th><th scope="col">Decisión</th></tr></thead><tbody>${records.map(p=>`<tr><td><strong>${esc(name(p))}</strong><small>${esc(p.frontName||'Sin propuesta suficiente')}</small></td><td>${esc(p.confidence)}<small>${esc(p.window.start)} → ${esc(p.window.end)}</small><small>Lote ${esc(p.batchHash.slice(0,12))}</small></td><td><details><summary>Revisar ${p.evidence.length} referencias e historial</summary><p>${esc(p.reason)}</p><ul>${p.evidence.map(e=>`<li>${esc(e.id)} · ${esc(e.type||'tipo no disponible')} · ${esc(e.date||'fecha individual no disponible')} ${esc(e.dateKind||'')} · ${e.available?'Referencia registrada':'Referencia faltante; no confirmable'}${e.caveat?`<br>${esc(e.caveat)}`:''}${['withinWindow','merge','initialImport','historyPartial','pathListPartial'].filter(k=>typeof e[k]==='boolean').map(k=>`<small>${esc(k)}: ${e[k]?'sí':'no'}</small>`).join('')}</li>`).join('')}</ul><p>${esc(p.limits)}</p><p>No se incluyen títulos, comentarios, código ni documentos operacionales de Azure. Las referencias no equivalen a verificar especialidad ni capacidad libre.</p>${p.history.map(h=>`<p><strong>${esc(states[p.status])}</strong> · ${esc(h.actor)} · ${esc(h.at)} · v${h.revision}<br>${esc(h.reason)}</p><pre>${esc(JSON.stringify(h.participation||null,null,2))}</pre>`).join('')}</details></td><td>${esc(states[p.status])}${view.canManage&&p.status==='pending'?`<button data-review-id="${esc(p.id)}">Revisar propuesta</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">No hay propuestas para estos filtros. Ajusta la búsqueda o importa el lote privado configurado. Las identidades sin evidencia permanecen pendientes.</p>';
 document.querySelectorAll('[data-review-id]').forEach(b=>b.onclick=()=>openReview(all.find(p=>p.id===b.dataset.reviewId)));
}
function openReview(p){
 if(!discard())return;selected=p;$('reviewForm').reset();$('reviewForm').hidden=false;
 $('reviewFormTitle').textContent=`Revisar: ${view.catalog.directory.users.find(u=>u.id===p.userId)?.name||'Identidad ausente; no confirmable'} · ${p.frontName||'Sin evidencia suficiente'}`;
 $('reviewExact').textContent=`Propuesta ${p.id} · lote ${p.batchHash} · catálogo v${view.catalog.revision}. La decisión quedará ligada a esta versión.`;
 choices('reviewFront',view.catalog.fronts.filter(f=>f.active),'Selecciona frente actual');$('reviewFront').value='';
 const user=view.catalog.directory.users.find(u=>u.id===p.userId);
 $('reviewProjects').innerHTML=user?.projects.length?user.projects.map(project=>`<label class="check"><input name="reviewProject" type="checkbox" value="${esc(project)}">${esc(project)}</label>`).join(''):'<p>Sin proyectos actuales autorizados. Mantener pendiente o rechazar; no puede crearse participación.</p>';
 toggleOutcome();$('reviewForm').scrollIntoView({block:'start',behavior:'auto'});$('reviewOutcome').focus();
}
function toggleOutcome(){const reject=$('reviewOutcome').value==='reject';$('reviewParticipation').disabled=reject;$('reviewParticipation').hidden=reject;}
$('reviewOutcome').onchange=toggleOutcome;
$('reviewForm').onsubmit=e=>{
 e.preventDefault();if(!selected)return;
 const outcome=$('reviewOutcome').value;
 const data={outcome,reason:$('reviewReason').value,batchHash:selected.batchHash};
 if(outcome!=='reject')data.participation={frontId:$('reviewFront').value,level:$('reviewLevel').value,roles:[...document.querySelectorAll('[name=reviewRole]:checked')].map(e=>e.value),projects:[...document.querySelectorAll('[name=reviewProject]:checked')].map(e=>e.value),enabled:$('reviewEnabled').value==='true'};
 act('review.decide',{id:selected.id,data});
};
$('cancelReview').onclick=()=>{if(discard()){$('reviewForm').hidden=true;selected=null;}};
$('importResearch').onclick=()=>{if(discard())act('review.import');};
for(const id of ['reviewQuery','reviewFrontFilter','reviewConfidence','reviewStatus','reviewBatch'])$(id).addEventListener('input',renderList);
